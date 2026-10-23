import { findMarketBand } from "./bands.ts";
import {
  ESTIMATE_DISCLAIMER,
  type ComparableListing,
  type Condition,
  type ResaleQuery,
  type Valuation,
} from "./types.ts";

const CONDITION_SCALE: Record<Condition, [number, number]> = {
  new_with_tags: [1.05, 1.2],
  like_new: [1, 1],
  good: [0.7, 0.85],
  fair: [0.4, 0.62],
};

function roundToFive(value: number): number {
  return Math.max(5, Math.round(value / 5) * 5);
}

export function needsDetails(evidence: string[]): Valuation {
  return {
    status: "needs_details",
    lowGbp: null,
    highGbp: null,
    confidence: "unknown",
    source: null,
    evidence,
    disclaimer: ESTIMATE_DISCLAIMER,
  };
}

export function rangeFromPrices(prices: number[]): { low: number; high: number } | null {
  const sorted = prices
    .filter((price) => Number.isFinite(price) && price > 0)
    .sort((a, b) => a - b);
  if (sorted.length < 2) return null;
  const lowIndex = Math.max(0, Math.floor((sorted.length - 1) * 0.25));
  const highIndex = Math.min(sorted.length - 1, Math.ceil((sorted.length - 1) * 0.75));
  const low = roundToFive(sorted[lowIndex] ?? sorted[0]!);
  let high = roundToFive(sorted[highIndex] ?? sorted[sorted.length - 1]!);
  if (high <= low) high = low + 10;
  return { low, high };
}

export function scaleBand(
  low: number,
  high: number,
  condition: Condition | null,
): { low: number; high: number; confidence: "medium" | "low" } {
  if (!condition) {
    const fair = CONDITION_SCALE.fair;
    const tagged = CONDITION_SCALE.new_with_tags;
    return {
      low: roundToFive(low * fair[0]),
      high: roundToFive(high * tagged[1]),
      confidence: "low",
    };
  }
  const [lowScale, highScale] = CONDITION_SCALE[condition];
  const scaledLow = roundToFive(low * lowScale);
  let scaledHigh = roundToFive(high * highScale);
  if (scaledHigh <= scaledLow) scaledHigh = scaledLow + 10;
  return { low: scaledLow, high: scaledHigh, confidence: "medium" };
}

/** Curated-band quote with no network call. Unknown brands stay unpriced. */
export function quoteCuratedBand(query: ResaleQuery): Valuation {
  const brand = query.brand.trim();
  const category = query.category.trim();
  if (!brand || !category) {
    return needsDetails([
      "Brand or category is missing, so there is nothing solid to price against.",
    ]);
  }
  const band = findMarketBand(brand, category);
  if (!band) {
    return needsDetails([
      `No resale evidence for ${brand}. Add a closer brand or category, or set your own figure.`,
    ]);
  }
  const scaled = scaleBand(band.low, band.high, query.condition);
  const listings: ComparableListing[] = [
    {
      title: `${band.brand} resale band, lower end`,
      priceGbp: scaled.low,
      source: "UK resale band",
    },
    {
      title: `${band.brand} resale band, upper end`,
      priceGbp: scaled.high,
      source: "UK resale band",
    },
  ];
  const spread = rangeFromPrices(listings.map((listing) => listing.priceGbp));
  if (!spread) return needsDetails(["The evidence was not enough to form a range."]);
  return {
    status: "estimated",
    lowGbp: spread.low,
    highGbp: spread.high,
    confidence: query.condition ? "medium" : "low",
    source: "market_band",
    evidence: listings.map((listing) => `${listing.source}: ${listing.title}`),
    disclaimer: ESTIMATE_DISCLAIMER,
  };
}
