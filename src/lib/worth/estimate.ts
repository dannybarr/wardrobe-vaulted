import { needsDetails, quoteCuratedBand, rangeFromPrices } from "./quote.ts";
import {
  ESTIMATE_DISCLAIMER,
  type ComparableListing,
  type ResaleEvidenceSource,
  type ResaleQuery,
  type Valuation,
} from "./types.ts";

export { quoteCuratedBand } from "./quote.ts";

export class CuratedBandSource implements ResaleEvidenceSource {
  readonly id = "market_band";

  async findComparables(query: ResaleQuery): Promise<ComparableListing[]> {
    const quoted = quoteCuratedBand(query);
    if (quoted.lowGbp === null || quoted.highGbp === null) return [];
    const brand = query.brand.trim();
    return [
      {
        title: `${brand} resale band, lower end`,
        priceGbp: quoted.lowGbp,
        source: "UK resale band",
      },
      {
        title: `${brand} resale band, upper end`,
        priceGbp: quoted.highGbp,
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
