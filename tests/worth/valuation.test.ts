import { describe, expect, it } from "vitest";
import {
  CuratedBandSource,
  estimateResale,
  HttpListingSource,
  overrideValuation,
} from "@/lib/worth/estimate";
import { buildResaleListing } from "@/lib/worth/listing";
import { shareCardSvg } from "@/lib/worth/share-card";
import { summariseWardrobe } from "@/lib/worth/summarise";
import type { WorthPiece } from "@/lib/worth/types";

function piece(overrides: Partial<WorthPiece> = {}): WorthPiece {
  return {
    id: "1",
    name: "Waxed jacket",
    part: "wholebody_up",
    brand: "Barbour",
    size: "M",
    condition: "good",
    colour: "Olive",
    purchasePrice: 250,
    purchaseDate: "2024-01-01",
    valueLow: 60,
    valueHigh: 140,
    valueSource: "market_band",
    valueConfidence: "medium",
    valueOverridden: false,
    valuedAt: "2026-10-01",
    lastWornAt: "2026-09-01",
    updatedAt: "2026-09-01",
    wearCount: 10,
    image: null,
    ...overrides,
  };
}

describe("valuation", () => {
  it("returns a range for a known brand and never a single invented penny", async () => {
    const result = await estimateResale(
      { brand: "Barbour", category: "wholebody_up", condition: "good", name: "Beaufort" },
      [new CuratedBandSource()],
    );
    expect(result.status).toBe("estimated");
    expect(result.lowGbp).not.toBeNull();
    expect(result.highGbp).toBeGreaterThan(result.lowGbp ?? 0);
    expect(result.lowGbp).not.toBe(result.highGbp);
    expect(result.disclaimer).toMatch(/not an offer/i);
  });

  it("shows needs details when the brand is unknown", async () => {
    const result = await estimateResale(
      { brand: "", category: "shoes", condition: "good", name: "Trainers" },
      [new CuratedBandSource()],
    );
    expect(result.status).toBe("needs_details");
    expect(result.lowGbp).toBeNull();
  });

  it("prefers a live listing feed over the curated band", async () => {
    const feed = new HttpListingSource("https://feed.test/listings", async () => ({
      listings: [
        { title: "Sold A", priceGbp: 40, source: "feed" },
        { title: "Sold B", priceGbp: 55, source: "feed" },
        { title: "Sold C", priceGbp: 70, source: "feed" },
        { title: "Sold D", priceGbp: 80, source: "feed" },
      ],
    }));
    const result = await estimateResale(
      { brand: "Nike", category: "shoes", condition: "good", name: "Dunk" },
      [new CuratedBandSource(), feed],
    );
    expect(result.source).toBe("listing_feed");
    expect(result.confidence).toBe("high");
    expect(result.highGbp).toBeGreaterThan(result.lowGbp ?? 0);
  });

  it("keeps a member override", () => {
    const override = overrideValuation(80, 80);
    expect(override.source).toBe("user");
    expect(override.lowGbp).toBe(80);
    expect(override.highGbp).toBe(80);
  });
});

describe("net worth summary", () => {
  const now = Date.parse("2026-10-19T12:00:00Z");

  it("totals a range, ranks pieces, and flags forgotten value", () => {
    const summary = summariseWardrobe(
      [
        piece({ id: "a", valueLow: 100, valueHigh: 200 }),
        piece({
          id: "b",
          name: "Old coat",
          brand: "Barbour",
          valueLow: 50,
          valueHigh: 80,
          lastWornAt: "2025-01-01",
          updatedAt: "2025-01-01",
          purchasePrice: 180,
          wearCount: 0,
        }),
        piece({
          id: "c",
          brand: "",
          valueLow: null,
          valueHigh: null,
          valueConfidence: "unknown",
          purchasePrice: null,
        }),
      ],
      { low: 40, high: 90 },
      now,
    );
    expect(summary.low).toBe(150);
    expect(summary.high).toBe(280);
    expect(summary.needsDetailsCount).toBe(1);
    expect(summary.topPieces[0]?.id).toBe("a");
    expect(summary.forgotten.pieces.map((item) => item.id)).toEqual(["b"]);
    expect(summary.monthChange).toBe("higher");
    expect(summary.byCategory[0]?.label).toBe("Outerwear");
    expect(summary.byBrand[0]?.label).toBe("Barbour");
    expect(summary.costPerWear.find((row) => row.id === "a")?.pounds).toBe(25);
    expect(summary.costPerWear.find((row) => row.id === "b")?.note).toBe("Not worn yet");
  });
});

describe("sell this and share cards", () => {
  it("builds a pasteable listing with a range, not a fake offer", () => {
    const listing = buildResaleListing(piece());
    expect(listing.title).toContain("Barbour");
    expect(listing.suggestedPrice).toMatch(/£/);
    expect(listing.suggestedPrice).toContain("–");
    expect(listing.clipboard).toContain("not an offer");
    expect(listing.size).toBe("M");
    expect(listing.condition).toBe("Good");
  });

  it("draws a 9:16 and a 1:1 card, and can hide the figures", () => {
    const summary = summariseWardrobe([piece()]);
    const story = shareCardSvg({ format: "story", summary, hideNumbers: false });
    const square = shareCardSvg({ format: "square", summary, hideNumbers: true });
    expect(story).toContain('height="1920"');
    expect(square).toContain('height="1080"');
    expect(square).toContain("Hidden");
    expect(story).toContain("Estimate, not an offer");
  });
});
