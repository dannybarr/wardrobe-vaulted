import { findMarketBand } from "@/lib/worth/bands";
import {
  ESTIMATE_DISCLAIMER,
  type ComparableListing,
  type Condition,
  type ResaleEvidenceSource,
  type ResaleQuery,
  type Valuation,
} from "@/lib/worth/types";

const CONDITION_SCALE: Record<Condition, [number, number]> = {
  new_with_tags: [1.05, 1.2],
  like_new: [1, 1],
  good: [0.7, 0.85],
  fair: [0.4, 0.62],
};

function roundToFive(value: number): number {
  return Math.max(5, Math.round(value / 5) * 5);
}

function needsDetails(evidence: string[]): Valuation {
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

function rangeFromPrices(prices: number[]): { low: number; high: number } | null {
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

function scaleBand(
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

export class CuratedBandSource implements ResaleEvidenceSource {
  readonly id = "market_band";

  async findComparables(query: ResaleQuery): Promise<ComparableListing[]> {
    const band = findMarketBand(query.brand, query.category);
    if (!band) return [];
    const scaled = scaleBand(band.low, band.high, query.condition);
    return [
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
  }
}

/**
 * A live feed can be dropped in later (Vinted, eBay, or a partner). It is not
 * called unless a base URL is configured, and every request goes through the
 * SSRF guard supplied by the caller.
 */
export class HttpListingSource implements ResaleEvidenceSource {
  readonly id = "listing_feed";

  constructor(
    private readonly baseUrl: string,
    private readonly load: (url: string) => Promise<unknown>,
  ) {}

  async findComparables(query: ResaleQuery): Promise<ComparableListing[]> {
    const url = new URL(this.baseUrl);
    url.searchParams.set("brand", query.brand);
    url.searchParams.set("category", query.category);
    if (query.condition) url.searchParams.set("condition", query.condition);
    url.searchParams.set("name", query.name);
    const payload = (await this.load(url.toString())) as { listings?: ComparableListing[] };
    return (payload.listings ?? []).filter(
      (listing) =>
        typeof listing.priceGbp === "number" &&
        listing.priceGbp > 0 &&
        typeof listing.title === "string",
    );
  }
}

export async function estimateResale(
  query: ResaleQuery,
  sources: ResaleEvidenceSource[] = [new CuratedBandSource()],
): Promise<Valuation> {
  const brand = query.brand.trim();
  const category = query.category.trim();
  if (!brand || !category) {
    return needsDetails([
      "Brand or category is missing, so there is nothing solid to price against.",
    ]);
  }

  let listings: ComparableListing[] = [];
  let sourceId: string | null = null;
  for (const source of sources) {
    const found = await source.findComparables(query);
    if (!found.length) continue;
    listings = found;
    sourceId = source.id;
    if (source.id !== "market_band") break;
  }

  if (!listings.length) {
    return needsDetails([
      `No resale evidence for ${brand}. Add a closer brand or category, or set your own figure.`,
    ]);
  }

  const spread = rangeFromPrices(listings.map((listing) => listing.priceGbp));
  if (!spread) return needsDetails(["The evidence was not enough to form a range."]);

  const live = sourceId === "listing_feed";
  const confidence = live
    ? listings.length >= 4
      ? "high"
      : "medium"
    : query.condition
      ? "medium"
      : "low";

  return {
    status: "estimated",
    lowGbp: spread.low,
    highGbp: spread.high,
    confidence,
    source: sourceId,
    evidence: listings.slice(0, 4).map((listing) => `${listing.source}: ${listing.title}`),
    disclaimer: ESTIMATE_DISCLAIMER,
  };
}

/** A member's own figure. Shown as theirs, still not an offer from Wardrobe. */
export function overrideValuation(lowGbp: number, highGbp: number): Valuation {
  const low = Math.min(lowGbp, highGbp);
  const high = Math.max(lowGbp, highGbp);
  return {
    status: "estimated",
    lowGbp: low,
    highGbp: high,
    confidence: "high",
    source: "user",
    evidence: ["Set by you."],
    disclaimer: ESTIMATE_DISCLAIMER,
  };
}
