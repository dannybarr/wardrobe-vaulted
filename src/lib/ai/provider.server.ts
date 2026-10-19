/**
 * The AI half of the import pipeline, server side.
 *
 * Two paths, one contract. A member on the built-in AI goes through the app's own
 * gateway and is charged the measured cost plus the markup; a member on their own
 * OpenAI key goes straight to OpenAI on exactly the request the original app
 * made, and is charged nothing here.
 *
 * Pixel work is deliberately absent: cropping, chroma removal and framing happen
 * in the browser (see src/lib/image/pixels.ts), which keeps the original quality
 * without needing native image libraries on the server.
 */
import {
  ANALYZE_INSTRUCTION,
  ANALYZE_SCHEMA,
  dedupeDetected,
  normalizeDetected,
  type DetectedPiece,
} from "@/lib/ai/prompts";
import type { AiRunContext } from "@/lib/ai/credits.server";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";
const OPENAI = "https://api.openai.com/v1";

/** Built-in models. Both read a reference photo and answer with an image. */
export const BUILTIN_VISION_MODEL = "openai/gpt-5.6-sol";
export const BUILTIN_IMAGE_MODEL = "google/gemini-3-pro-image-preview";

/** Models used when a member brings their own OpenAI key, as the original did. */
const OPENAI_VISION_MODEL = "gpt-5.4-mini";
const OPENAI_IMAGE_MODEL = "gpt-image-2";

export type ImageInput = { base64: string; mime: string; name: string };

function gatewayKey(): string {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("The built-in AI is not configured.");
  return key;
}

function dataUrl(image: ImageInput): string {
  return `data:${image.mime};base64,${image.base64}`;
}

type Json = Record<string, unknown>;

function asJson(value: unknown): Json | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Json)
    : null;
}

async function readJson(response: Response): Promise<Json> {
  const value: unknown = await response.json().catch(() => ({}));
  return asJson(value) ?? {};
}

function stringField(value: unknown, key: string): string | undefined {
  const field = asJson(value)?.[key];
  return typeof field === "string" ? field : undefined;
}

function errorMessage(payload: Json): string | undefined {
  return stringField(payload["error"], "message");
}

function firstB64(payload: Json): string | undefined {
  const data = payload["data"];
  if (!Array.isArray(data)) return undefined;
  return stringField(data[0], "b64_json");
}

/** Reads a photo and returns one record per wearable item it can see. */
export async function analyzePhoto(run: AiRunContext, image: ImageInput): Promise<DetectedPiece[]> {
  const items =
    run.mode === "byok" && run.apiKey
      ? await analyzeWithOpenAi(run.apiKey, image)
      : await analyzeWithGateway(image);
  return dedupeDetected(items.map(normalizeDetected));
}

async function analyzeWithGateway(image: ImageInput): Promise<unknown[]> {
  const response = await fetch(`${GATEWAY}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": gatewayKey() },
    body: JSON.stringify({
      model: BUILTIN_VISION_MODEL,
      reasoning_effort: "none",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: ANALYZE_INSTRUCTION },
            { type: "image_url", image_url: { url: dataUrl(image) } },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "wardrobe_items", strict: true, schema: ANALYZE_SCHEMA },
      },
    }),
  });

  const result = await readJson(response);
  if (!response.ok)
    throw new Error(errorMessage(result) || `The photo could not be read (${response.status}).`);

  const choices = result["choices"];
  const message = Array.isArray(choices) ? asJson(asJson(choices[0])?.["message"]) : null;
  const text = message?.["content"];
  if (typeof text !== "string") throw new Error("The photo could not be read.");
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed?.items)) throw new Error("The photo could not be read.");
  return parsed.items;
}

async function analyzeWithOpenAi(apiKey: string, image: ImageInput): Promise<unknown[]> {
  const response = await fetch(`${OPENAI}/responses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: OPENAI_VISION_MODEL,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: ANALYZE_INSTRUCTION },
            { type: "input_image", image_url: dataUrl(image) },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "wardrobe_items",
          strict: true,
          schema: ANALYZE_SCHEMA,
        },
      },
    }),
  });

  const result = await readJson(response);
  if (!response.ok)
    throw new Error(errorMessage(result) || `The photo could not be read (${response.status}).`);

  const direct = result["output_text"];
  let text = typeof direct === "string" ? direct : "";
  if (!text && Array.isArray(result["output"])) {
    for (const entry of result["output"]) {
      const content = asJson(entry)?.["content"];
      if (!Array.isArray(content)) continue;
      const match = content.find((item) => asJson(item)?.["type"] === "output_text");
      const value = asJson(match)?.["text"];
      if (typeof value === "string") {
        text = value;
        break;
      }
    }
  }
  if (!text) throw new Error("The photo could not be read.");
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed?.items)) throw new Error("The photo could not be read.");
  return parsed.items;
}

/**
 * Produces a new image from a prompt plus one or more reference photographs —
 * the cutout stage sends the cropped piece, the on-model stage sends the member's
 * own photo followed by the finished cutout.
 */
export async function editImage(
  run: AiRunContext,
  options: { prompt: string; images: ImageInput[]; size: "1024x1024" | "1536x1024" },
): Promise<string> {
  if (run.mode === "byok" && run.apiKey) return editWithOpenAi(run.apiKey, options);
  return editWithGateway(options);
}

async function editWithGateway(options: { prompt: string; images: ImageInput[] }): Promise<string> {
  const response = await fetch(`${GATEWAY}/images/generations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": gatewayKey() },
    body: JSON.stringify({
      model: BUILTIN_IMAGE_MODEL,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: options.prompt },
            ...options.images.map((image) => ({
              type: "image_url" as const,
              image_url: { url: dataUrl(image) },
            })),
          ],
        },
      ],
      modalities: ["image", "text"],
    }),
  });

  const result = await readJson(response);
  if (!response.ok) {
    const status = response.status;
    const message =
      status === 429
        ? "The built-in AI is busy right now. Please try again in a moment."
        : status === 402
          ? "The built-in AI is temporarily unavailable. Please try again shortly."
          : errorMessage(result) || `The image could not be generated (${status}).`;
    throw Object.assign(new Error(message), { status });
  }

  const encoded = firstB64(result);
  if (typeof encoded !== "string") throw new Error("The image could not be generated.");
  return encoded;
}

async function editWithOpenAi(
  apiKey: string,
  options: { prompt: string; images: ImageInput[]; size: "1024x1024" | "1536x1024" },
): Promise<string> {
  const form = new FormData();
  form.set("model", OPENAI_IMAGE_MODEL);
  form.set("prompt", options.prompt);
  form.set("size", options.size);
  form.set("quality", "high");
  form.set("output_format", "png");
  for (const image of options.images) {
    const bytes = Uint8Array.from(atob(image.base64), (character) => character.charCodeAt(0));
    form.append("image[]", new Blob([bytes], { type: image.mime }), image.name);
  }

  const response = await fetch(`${OPENAI}/images/edits`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  const result = await readJson(response);
  if (!response.ok) {
    throw new Error(
      errorMessage(result) || `Your OpenAI key could not generate the image (${response.status}).`,
    );
  }
  const encoded = firstB64(result);
  if (typeof encoded !== "string") throw new Error("The image could not be generated.");
  return encoded;
}
