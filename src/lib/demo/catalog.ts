import type { WorthPiece } from "@/lib/worth/types";

const jacket = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 260"><rect width="200" height="260" fill="#f4efe6"/><path d="M70 40 L100 28 L130 40 L168 78 L150 96 L138 70 L138 220 L62 220 L62 70 L50 96 L32 78 Z" fill="#6d5a45"/></svg>`,
);
const trainers = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 260"><rect width="200" height="260" fill="#f4efe6"/><path d="M36 150 H150 C170 150 178 164 170 176 H36 Z" fill="#e8e4dc"/><path d="M48 150 C70 118 120 116 156 140" fill="none" stroke="#1c1410" stroke-width="8"/><rect x="36" y="176" width="140" height="14" fill="#1c1410"/></svg>`,
);
const jeans = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 260"><rect width="200" height="260" fill="#f4efe6"/><path d="M62 36 H138 L146 230 H112 L100 150 L88 230 H54 Z" fill="#2c3d55"/></svg>`,
);
const bag = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 260"><rect width="200" height="260" fill="#f4efe6"/><rect x="48" y="78" width="104" height="120" rx="8" fill="#8c3b32"/><path d="M72 78 C72 48 128 48 128 78" fill="none" stroke="#8c3b32" stroke-width="10"/></svg>`,
);
const knit = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 260"><rect width="200" height="260" fill="#f4efe6"/><path d="M58 52 H142 L156 200 H44 Z" fill="#c45b4a"/><rect x="78" y="36" width="44" height="22" fill="#c45b4a"/></svg>`,
);
const watch = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 260"><rect width="200" height="260" fill="#f4efe6"/><rect x="78" y="36" width="44" height="188" rx="8" fill="#d7d1c6"/><circle cx="100" cy="130" r="36" fill="#1c1410"/><circle cx="100" cy="130" r="28" fill="#f6f1e8"/></svg>`,
);

function art(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${svg}`;
}

/** Fictional pieces for the preview. None of these are a real wardrobe. */
export const DEMO_PIECES: WorthPiece[] = [
  {
    id: "demo-jacket",
    name: "Field jacket",
    part: "wholebody_up",
    brand: "Northline",
    size: "M",
    condition: "good",
    colour: "Olive",
    purchasePrice: 220,
    purchaseDate: "2023-11-02",
    valueLow: 90,
    valueHigh: 160,
    valueSource: "demo",
    valueConfidence: "low",
    valueOverridden: false,
    valuedAt: "2026-10-01",
    lastWornAt: "2025-02-01",
    updatedAt: "2025-02-01",
    wearCount: 12,
    image: art(jacket),
  },
  {
    id: "demo-trainers",
    name: "Court trainer",
    part: "shoes",
    brand: "Harbour",
    size: "UK 8",
    condition: "like_new",
    colour: "White",
    purchasePrice: 110,
    purchaseDate: "2025-06-12",
    valueLow: 45,
    valueHigh: 75,
    valueSource: "demo",
    valueConfidence: "low",
    valueOverridden: false,
    valuedAt: "2026-10-01",
    lastWornAt: "2026-09-20",
    updatedAt: "2026-09-20",
    wearCount: 8,
    image: art(trainers),
  },
  {
    id: "demo-jeans",
    name: "Straight jean",
    part: "lowerbody",
    brand: "Mill & Rowe",
    size: "32",
    condition: "good",
    colour: "Indigo",
    purchasePrice: 95,
    purchaseDate: "2024-04-18",
    valueLow: 25,
    valueHigh: 45,
    valueSource: "demo",
    valueConfidence: "low",
    valueOverridden: false,
    valuedAt: "2026-10-01",
    lastWornAt: "2026-08-02",
    updatedAt: "2026-08-02",
    wearCount: 30,
    image: art(jeans),
  },
  {
    id: "demo-bag",
    name: "Day bag",
    part: "bags",
    brand: "Atelier South",
    size: "One size",
    condition: "like_new",
    colour: "Cherry",
    purchasePrice: 280,
    purchaseDate: "2025-01-09",
    valueLow: 140,
    valueHigh: 210,
    valueSource: "demo",
    valueConfidence: "medium",
    valueOverridden: false,
    valuedAt: "2026-10-01",
    lastWornAt: "2026-07-11",
    updatedAt: "2026-07-11",
    wearCount: 15,
    image: art(bag),
  },
  {
    id: "demo-knit",
    name: "Crew knit",
    part: "upperbody",
    brand: "Paper Studio",
    size: "S",
    condition: "good",
    colour: "Rust",
    purchasePrice: 80,
    purchaseDate: "2024-09-01",
    valueLow: 20,
    valueHigh: 40,
    valueSource: "demo",
    valueConfidence: "low",
    valueOverridden: false,
    valuedAt: "2026-10-01",
    lastWornAt: "2026-10-02",
    updatedAt: "2026-10-02",
    wearCount: 6,
    image: art(knit),
  },
  {
    id: "demo-watch",
    name: "Field watch",
    part: "watches",
    brand: "Keel",
    size: "38mm",
    condition: "like_new",
    colour: "Steel",
    purchasePrice: 420,
    purchaseDate: "2022-12-01",
    valueLow: 180,
    valueHigh: 260,
    valueSource: "demo",
    valueConfidence: "low",
    valueOverridden: false,
    valuedAt: "2026-10-01",
    lastWornAt: "2025-01-04",
    updatedAt: "2025-01-04",
    wearCount: 40,
    image: art(watch),
  },
];

export const DEMO_PREVIOUS = { low: 390, high: 620 };

export function demoPieceFromEstimate(input: {
  name: string;
  brand: string;
  part: string;
  condition: WorthPiece["condition"];
  low: number | null;
  high: number | null;
  confidence: WorthPiece["valueConfidence"];
  source: string | null;
}): WorthPiece {
  return {
    id: `demo-added-${Date.now().toString(36)}`,
    name: input.name || "New piece",
    part: input.part,
    brand: input.brand,
    size: "M",
    condition: input.condition,
    colour: null,
    purchasePrice: null,
    purchaseDate: null,
    valueLow: input.low,
    valueHigh: input.high,
    valueSource: input.source,
    valueConfidence: input.confidence,
    valueOverridden: false,
    valuedAt: new Date().toISOString(),
    lastWornAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    wearCount: 0,
    image: art(trainers),
  };
}
