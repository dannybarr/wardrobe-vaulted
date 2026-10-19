import type { WorthPiece } from "@/lib/worth/types";
import { categoryLabel } from "@/lib/worth/format";

const SIX_MONTHS_MS = 183 * 24 * 60 * 60 * 1000;

export type BreakdownRow = {
  label: string;
  low: number;
  high: number;
  count: number;
};

export type NetWorthSummary = {
  low: number;
  high: number;
  pricedCount: number;
  needsDetailsCount: number;
  byCategory: BreakdownRow[];
  byBrand: BreakdownRow[];
  topPieces: WorthPiece[];
  forgotten: { pieces: WorthPiece[]; low: number; high: number };
  costPerWear: { id: string; name: string; pounds: number | null; note: string }[];
  monthChange: "higher" | "lower" | "about the same" | "no earlier estimate";
  previous: { low: number; high: number } | null;
};

function estimated(piece: WorthPiece): boolean {
  return (
    piece.valueLow !== null &&
    piece.valueHigh !== null &&
    Number.isFinite(piece.valueLow) &&
    Number.isFinite(piece.valueHigh) &&
    piece.valueConfidence !== "unknown"
  );
}

function addRow(map: Map<string, BreakdownRow>, label: string, low: number, high: number) {
  const current = map.get(label) ?? { label, low: 0, high: 0, count: 0 };
  current.low += low;
  current.high += high;
  current.count += 1;
  map.set(label, current);
}

function forgotten(piece: WorthPiece, now: number): boolean {
  const stamp = piece.lastWornAt ?? piece.updatedAt ?? piece.valuedAt;
  if (!stamp) return false;
  const time = Date.parse(stamp);
  if (!Number.isFinite(time)) return false;
  return now - time >= SIX_MONTHS_MS;
}

export function summariseWardrobe(
  pieces: WorthPiece[],
  previous: { low: number; high: number } | null = null,
  now = Date.now(),
): NetWorthSummary {
  const priced = pieces.filter(estimated);
  const byCategory = new Map<string, BreakdownRow>();
  const byBrand = new Map<string, BreakdownRow>();
  let low = 0;
  let high = 0;

  for (const piece of priced) {
    const pieceLow = piece.valueLow ?? 0;
    const pieceHigh = piece.valueHigh ?? 0;
    low += pieceLow;
    high += pieceHigh;
    addRow(byCategory, categoryLabel(piece.part), pieceLow, pieceHigh);
    const brand = piece.brand.trim() || "Unknown brand";
    addRow(byBrand, brand, pieceLow, pieceHigh);
  }

  const forgottenPieces = pieces.filter((piece) => estimated(piece) && forgotten(piece, now));
  const topPieces = [...priced].sort((a, b) => (b.valueHigh ?? 0) - (a.valueHigh ?? 0)).slice(0, 5);

  let monthChange: NetWorthSummary["monthChange"] = "no earlier estimate";
  if (previous && priced.length) {
    if (low > previous.high) monthChange = "higher";
    else if (high < previous.low) monthChange = "lower";
    else monthChange = "about the same";
  }

  return {
    low,
    high,
    pricedCount: priced.length,
    needsDetailsCount: pieces.length - priced.length,
    byCategory: [...byCategory.values()].sort((a, b) => b.high - a.high),
    byBrand: [...byBrand.values()].sort((a, b) => b.high - a.high),
    topPieces,
    forgotten: {
      pieces: forgottenPieces,
      low: forgottenPieces.reduce((total, piece) => total + (piece.valueLow ?? 0), 0),
      high: forgottenPieces.reduce((total, piece) => total + (piece.valueHigh ?? 0), 0),
    },
    costPerWear: pieces
      .filter((piece) => piece.purchasePrice !== null && piece.purchasePrice > 0)
      .map((piece) => ({
        id: piece.id,
        name: piece.name,
        pounds: piece.wearCount > 0 ? piece.purchasePrice! / piece.wearCount : null,
        note: piece.wearCount > 0 ? `${piece.wearCount} wears` : "Not worn yet",
      })),
    monthChange,
    previous,
  };
}
