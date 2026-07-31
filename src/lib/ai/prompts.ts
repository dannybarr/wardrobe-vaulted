/**
 * The prompts that make the import pipeline work.
 *
 * These are carried over word for word from the original app, because the exact
 * wording is what produces a clean, flat chroma background and a faithful
 * garment. Changing them changes the quality of every cutout, so treat them as
 * settled unless a member's own regeneration direction is appended.
 */

export type PieceMetadata = {
  name?: string;
  part?: string;
  color?: string | null;
  secondaryColor?: string | null;
  tags?: string[];
};

export function buildGarmentPrompt(metadata: PieceMetadata = {}, chromaKey = "#00ff00"): string {
  const name = metadata.name || "clothing item";
  const category = metadata.part || "wardrobe item";
  const primary = metadata.color || "the exact visible color";
  const secondary = metadata.secondaryColor
    ? ` with distinct secondary color ${metadata.secondaryColor}`
    : "";
  const details = metadata.tags?.length
    ? metadata.tags.join(", ")
    : "all visible construction and design details";

  return `Use case: background-extraction
Asset type: ecommerce catalog product cutout source

Input image: The reference photograph shows the exact garment, either by itself or worn by a person. Use it only to identify and reconstruct the garment.

Primary request: Reconstruct ONLY the complete empty ${name} (${category}) as a clean, front-facing ecommerce catalog product photograph. If a wearer is present, remove them. Remove every other garment, object, and background element. Show the complete item naturally arranged and symmetrical, with no person, body, mannequin, or hanger visible.

Garment fidelity: Preserve the reference garment's exact primary color ${primary}${secondary}, material and texture, silhouette, neckline, sleeves, fastenings, pattern, and distinctive details (${details}). Preserve any clearly legible existing graphic or logo exactly, but do not invent or reinterpret uncertain logos, text, pockets, seams, hardware, colors, or decoration.

Composition: Centered straight-on product view. Keep the entire garment inside the frame with generous, even padding on every side. No cropping or truncation.

Background: Perfectly flat, absolutely uniform solid ${chromaKey} chroma-key color, edge-to-edge. No shadows, gradient, texture, vignette, floor, horizon, reflection, or lighting variation.

Lighting: Neutral diffuse product lighting contained on the garment only.

Avoid: person, body, skin, hair, mannequin, hanger, props, other garments, retail tags, cast shadow, contact shadow, reflection, watermark, caption, border, background variation, or chroma spill.

Critical: Use no ${chromaKey} anywhere in the garment. Produce exactly one complete garment with a crisp, separable outer silhouette.`;
}

export const MODELED_PROMPT =
  "Create a professional horizontal 3:2 editorial fashion photograph of the person in Image 1 wearing the exact garment from Image 2. Preserve the person's recognizable identity, face, hair, age and proportions. Preserve every garment color, material, fit, construction, graphic, logo and distinctive detail. Keep the complete featured item clearly visible and unobstructed, use understated neutral supporting clothes, realistic anatomy, natural light, authentic fabric, a tasteful real-world setting, and leave environmental space around the model. No text, watermark, product mockup, or synthetic appearance.";

export const ANALYZE_INSTRUCTION =
  "Identify every distinct wearable clothing item visible in this image. Each physical item must appear exactly once in the result: never repeat the same garment under different names, and never return several boxes for different parts, halves or details of one garment. A photo may show one isolated garment or a person wearing several items. Return one record per actual item that should enter a wardrobe. Ignore the person's body and non-wearable background objects. For each item, include a tight bounding box around only that item using integer coordinates normalized to a 1000 by 1000 image: x and y are the top-left corner, followed by width and height. Boxes may overlap when garments overlap, but each box must focus on one distinct item. Use only these category ids: upperbody, wholebody_up, lowerbody, accessories_up, shoes. Suggest a concise specific name, primary hex color, optional genuinely distinct secondary hex color, and 1-4 useful lowercase detail tags.";

export const ANALYZE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    items: {
      type: "array",
      minItems: 0,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          part: {
            type: "string",
            enum: ["upperbody", "wholebody_up", "lowerbody", "accessories_up", "shoes"],
          },
          color: { type: "string", pattern: "^#[0-9A-Fa-f]{6}$" },
          secondaryColor: {
            anyOf: [{ type: "string", pattern: "^#[0-9A-Fa-f]{6}$" }, { type: "null" }],
          },
          tags: { type: "array", items: { type: "string" }, maxItems: 4 },
          boundingBox: {
            type: "object",
            additionalProperties: false,
            properties: {
              x: { type: "integer", minimum: 0, maximum: 999 },
              y: { type: "integer", minimum: 0, maximum: 999 },
              width: { type: "integer", minimum: 1, maximum: 1000 },
              height: { type: "integer", minimum: 1, maximum: 1000 },
            },
            required: ["x", "y", "width", "height"],
          },
        },
        required: ["name", "part", "color", "secondaryColor", "tags", "boundingBox"],
      },
    },
  },
  required: ["items"],
} as const;

const PARTS = new Set(["upperbody", "wholebody_up", "lowerbody", "accessories_up", "shoes"]);
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export type DetectedPiece = Required<Pick<PieceMetadata, "name" | "part">> & {
  color: string;
  secondaryColor: string | null;
  tags: string[];
  boundingBox: { x: number; y: number; width: number; height: number };
};

/** The original's normaliser, so a stray model answer can never reach the UI. */
export function normalizeDetected(value: unknown): DetectedPiece {
  const item = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const rawBox = item["boundingBox"];
  const box = (rawBox && typeof rawBox === "object" ? rawBox : {}) as Record<string, unknown>;
  const number = (key: string, fallback: number) =>
    Number.isFinite(Number(box[key])) ? Math.round(Number(box[key])) : fallback;
  const x = Math.max(0, Math.min(999, number("x", 0)));
  const y = Math.max(0, Math.min(999, number("y", 0)));
  const rawColor = item["color"];
  const rawSecondary = item["secondaryColor"];
  const rawName = item["name"];
  const rawPart = item["part"];
  const rawTags = item["tags"];

  return {
    name: typeof rawName === "string" && rawName.trim() ? rawName.trim().slice(0, 120) : "New piece",
    part: typeof rawPart === "string" && PARTS.has(rawPart) ? rawPart : "upperbody",
    color: typeof rawColor === "string" && HEX_COLOR.test(rawColor) ? rawColor.toLowerCase() : "#d8d0c2",
    secondaryColor:
      typeof rawSecondary === "string" && HEX_COLOR.test(rawSecondary) ? rawSecondary.toLowerCase() : null,
    tags: Array.isArray(rawTags)
      ? rawTags
          .filter((tag): tag is string => typeof tag === "string")
          .map((tag) => tag.trim().toLowerCase().slice(0, 40))
          .filter(Boolean)
          .slice(0, 12)
      : [],
    boundingBox: {
      x,
      y,
      width: Math.max(1, Math.min(1000 - x, number("width", 1000 - x))),
      height: Math.max(1, Math.min(1000 - y, number("height", 1000 - y))),
    },
  };

}

/** Normalised name used to spot the same garment returned twice. */
function nameKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((word) => word && !["the", "a", "an", "of", "with"].includes(word))
    .sort()
    .join(" ");
}

type Box = { x: number; y: number; width: number; height: number };

function area(box: Box): number {
  return box.width * box.height;
}

function intersection(a: Box, b: Box): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return width > 0 && height > 0 ? width * height : 0;
}

/**
 * The vision model sometimes reports one garment several times — once per sleeve,
 * once per crop, or simply repeated. Every duplicate would become its own import
 * job, so they are collapsed here before the UI ever sees them: a detection is
 * dropped when it shares a name with a kept item, or when its box overlaps a kept
 * box of the same category heavily enough that it cannot be a separate piece.
 */
export function dedupeDetected(items: DetectedPiece[]): DetectedPiece[] {
  const ordered = [...items].sort((a, b) => area(b.boundingBox) - area(a.boundingBox));
  const kept: DetectedPiece[] = [];
  const seenNames = new Set<string>();

  for (const item of ordered) {
    const key = `${item.part}|${nameKey(item.name)}`;
    if (key && seenNames.has(key)) continue;

    const duplicate = kept.some((existing) => {
      const overlap = intersection(existing.boundingBox, item.boundingBox);
      if (!overlap) return false;
      const smaller = Math.min(area(existing.boundingBox), area(item.boundingBox));
      const union = area(existing.boundingBox) + area(item.boundingBox) - overlap;
      const containment = overlap / smaller;
      const iou = overlap / union;
      if (existing.part === item.part) return containment > 0.6 || iou > 0.4;
      return containment > 0.9;
    });
    if (duplicate) continue;

    seenNames.add(key);
    kept.push(item);
  }

  return kept.sort(
    (a, b) => items.indexOf(a) - items.indexOf(b),
  );
}
