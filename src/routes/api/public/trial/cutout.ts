import { createFileRoute } from "@tanstack/react-router";
import { editImage } from "@/lib/ai/provider.server";
import { buildGarmentPrompt } from "@/lib/ai/prompts";
import { safeChromaKey, safeDirection } from "@/lib/api/import-support";
import { claimTrialRun, TRIAL_RUN_CONTEXT } from "@/lib/trial/guard.server";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/**
 * The garment image for a guest's first piece, free and strictly capped. Identical
 * prompt and model to the member pipeline, so trial quality matches paid quality.
 */
export const Route = createFileRoute("/api/public/trial/cutout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const claim = await claimTrialRun(request, "cutout");
        if (!claim.ok) return claim.response;

        const body = (await request.json().catch(() => ({}))) as {
          imageBase64?: string;
          chromaKey?: string;
          metadata?: Record<string, unknown>;
          direction?: string;
        };
        if (typeof body.imageBase64 !== "string" || !body.imageBase64.length) {
          return json({ error: "The cropped image was missing." }, 400);
        }
        if (body.imageBase64.length > 14_000_000) {
          return json({ error: "That image is too large. Please try a smaller photo." }, 413);
        }

        const chromaKey = safeChromaKey(body.chromaKey);
        const direction = safeDirection(body.direction);
        const metadata = (body.metadata ?? {}) as {
          name?: string;
          part?: string;
          color?: string | null;
          secondaryColor?: string | null;
          tags?: string[];
        };

        const basePrompt = buildGarmentPrompt(metadata, chromaKey);
        const prompt = direction ? `${basePrompt}\nUser regeneration direction: ${direction}` : basePrompt;

        try {
          const imageBase64 = await editImage(TRIAL_RUN_CONTEXT, {
            prompt,
            images: [
              {
                base64: body.imageBase64.replace(/^data:[^,]+,/, ""),
                mime: "image/png",
                name: "crop.png",
              },
            ],
            size: "1024x1024",
          });
          return json({ imageBase64, chromaKey, mode: "trial", chargedPence: 0, balancePence: null });
        } catch (caught) {
          return json({ error: (caught as Error).message }, 502);
        }
      },
    },
  },
});
