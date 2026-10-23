import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { founderOutfits, founderPieces, founderWishlist } from "@/lib/demo/founder";
import { planImports, type OwnedRow } from "@/lib/demo/founder-plan";
import { summariseWardrobe } from "@/lib/worth/summarise";
import type { WorthPiece } from "@/lib/worth/types";

function worth(piece: (typeof founderPieces)[number]): WorthPiece {
  return {
    id: piece.id,
    name: piece.name,
    part: piece.part,
    brand: piece.brand ?? "",
    size: null,
    condition: null,
    colour: piece.color ?? null,
    purchasePrice: null,
    purchaseDate: null,
    valueLow: piece.valueLow ?? null,
    valueHigh: piece.valueHigh ?? null,
    valueSource: piece.valueSource ?? null,
    valueConfidence: piece.valueConfidence === "low" ? "low" : "unknown",
    valueOverridden: false,
    valuedAt: null,
    lastWornAt: null,
    updatedAt: null,
    wearCount: 0,
    image: piece.image ?? null,
  };
}

describe("founder catalogue", () => {
  it("loads every piece, outfit and wishlist item with a real resale range", () => {
    expect(founderPieces).toHaveLength(32);
    expect(founderOutfits).toHaveLength(2);
    expect(founderWishlist).toHaveLength(1);
    expect(founderWishlist[0]?.name).toBe("Poubel Bangle");
    const summary = summariseWardrobe(founderPieces.map(worth));
    expect(summary.low).toBeGreaterThan(0);
    expect(summary.high).toBeGreaterThan(summary.low);
    expect(founderPieces.every((piece) => piece.image?.startsWith("/demo/library/"))).toBe(true);
  });

  it("keeps personal fields out of the public files", () => {
    const blob = ["library.json", "outfits.json", "wishlist.json"]
      .map((name) => readFileSync(`src/data/founder-seed/${name}`, "utf8"))
      .join("\n");
    expect(blob).not.toMatch(/importJobId/);
    expect(blob).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
    expect(blob).not.toMatch(/"note"/);
  });

  it("plans inserts once and never deletes an existing row", () => {
    const existing: OwnedRow[] = [
      { id: "already", legacyId: null, name: "Black Nike Sneakers", hasImage: true },
    ];
    const first = planImports(existing, founderPieces);
    const inserts = first.filter((action) => action.kind === "insert");
    const kept = first.find(
      (action) => action.kind === "keep" && action.founderId.includes("import-"),
    );
    expect(inserts).toHaveLength(31);
    expect(kept?.kind).toBe("keep");
    if (kept?.kind === "keep") {
      expect(kept.existingId).toBe("already");
      expect(kept.attachImage).toBe(false);
    }
    expect(JSON.stringify(first)).not.toMatch(/delete/i);

    const after: OwnedRow[] = [
      ...existing,
      ...inserts.map((action, index) => ({
        id: `new-${index}`,
        legacyId: action.founderId,
        name: founderPieces.find((piece) => piece.id === action.founderId)?.name ?? "",
        hasImage: true,
      })),
    ];
    const second = planImports(after, founderPieces);
    expect(second.every((action) => action.kind === "keep")).toBe(true);
    expect(second.some((action) => action.kind === "keep" && action.attachImage)).toBe(false);
  });
});
