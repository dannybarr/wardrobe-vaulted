/**
 * What the built-in AI costs, and what a member is charged for it.
 *
 * The pipeline uses the same models as the original app — a vision read of the
 * photo for the metadata, then high-quality image generations for the cutout and
 * the on-model shot — so quality is unchanged. The only difference is that the
 * request goes through the app's own AI gateway instead of a member's key, which
 * means it can be measured and charged.
 *
 * Costs below are the provider's list prices in US dollars, converted to pence.
 * Members who use the built-in AI pay that measured cost plus a 20% markup.
 * Members on their own key pay their provider directly and are charged nothing.
 */

/** Markup on built-in AI, in basis points. 2000 = 20%. */
export const AI_MARKUP_BPS = 2000;

/** Conversion used for pricing. Reviewed rather than fetched live, to keep
 *  quoted prices stable for the member between the estimate and the charge. */
export const GBP_PER_USD = 0.79;

export type AiJobKind = "analyze" | "cutout" | "on_model" | "wishlist_resolve";

/**
 * Provider list price per run, in US dollars.
 * - analyze: one vision read of the uploaded photo.
 * - cutout / on_model: one high-quality image generation each.
 */
export const AI_BASE_COST_USD: Record<AiJobKind, number> = {
  analyze: 0.012,
  cutout: 0.19,
  on_model: 0.19,
  wishlist_resolve: 0.02,
};

/** Bigger uploads carry more input tokens, so they cost a little more. */
const USD_PER_MB: Record<AiJobKind, number> = {
  analyze: 0.006,
  cutout: 0.004,
  on_model: 0.004,
  wishlist_resolve: 0,
};

export const AI_MODELS = {
  analyze: "openai/gpt-5.6-sol",
  cutout: "openai/gpt-image-2",
  on_model: "openai/gpt-image-2",
  wishlist_resolve: "openai/gpt-5.6-sol",
} as const satisfies Record<AiJobKind, string>;

export type AiCostEstimate = {
  /** What the AI itself costs, in pence. */
  costPence: number;
  /** What the member is charged, in pence: cost plus the markup. */
  chargedPence: number;
  markupBps: number;
  stages: { kind: AiJobKind; model: string; chargedPence: number }[];
};

function pence(usd: number): number {
  return usd * GBP_PER_USD * 100;
}

export function withMarkup(costPence: number): number {
  return Math.ceil((costPence * (10000 + AI_MARKUP_BPS)) / 10000);
}

/** Cost of one stage, allowing for the size of the source image. */
export function estimateStage(kind: AiJobKind, byteSize = 0): number {
  const megabytes = Math.max(0, byteSize) / (1024 * 1024);
  return pence(AI_BASE_COST_USD[kind] + USD_PER_MB[kind] * megabytes);
}

/**
 * Quote a whole run before it starts, so the member can see the exact charge and
 * confirm it. Always round the charge up at the end, never per stage.
 */
export function estimateAiCost(kinds: AiJobKind[], byteSize = 0): AiCostEstimate {
  const raw = kinds.map((kind) => ({ kind, cost: estimateStage(kind, byteSize) }));
  const costPence = raw.reduce((total, stage) => total + stage.cost, 0);

  return {
    costPence: Math.ceil(costPence),
    chargedPence: withMarkup(costPence),
    markupBps: AI_MARKUP_BPS,
    stages: raw.map((stage) => ({
      kind: stage.kind,
      model: AI_MODELS[stage.kind],
      chargedPence: withMarkup(stage.cost),
    })),
  };
}

/** The stages a new piece goes through when it is imported. */
export const IMPORT_STAGES: AiJobKind[] = ["analyze", "cutout"];

export function formatPence(value: number): string {
  if (value < 100) return `${Math.round(value)}p`;
  return `£${(value / 100).toFixed(2)}`;
}

/** The prepaid packs on offer. Amounts match the payment provider's prices. */
export const AI_CREDIT_PACKS = [
  { priceId: "ai_credits_500", pence: 500 },
  { priceId: "ai_credits_1500", pence: 1500 },
  { priceId: "ai_credits_4000", pence: 4000 },
] as const;
