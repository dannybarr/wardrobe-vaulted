import type { GarmentPart } from "@/lib/worth/types";

/**
 * Wide UK resale bands for brands we can recognise. These are market bands,
 * not live listings and not an offer. An unknown brand is left unpriced.
 */
export type MarketBand = {
  brand: string;
  category: GarmentPart;
  low: number;
  high: number;
};

export const MARKET_BANDS: MarketBand[] = [
  { brand: "Barbour", category: "wholebody_up", low: 80, high: 180 },
  { brand: "Arc'teryx", category: "wholebody_up", low: 160, high: 340 },
  { brand: "The North Face", category: "wholebody_up", low: 40, high: 120 },
  { brand: "Patagonia", category: "wholebody_up", low: 45, high: 130 },
  { brand: "Moncler", category: "wholebody_up", low: 250, high: 700 },
  { brand: "Stone Island", category: "wholebody_up", low: 120, high: 320 },
  { brand: "Nike", category: "upperbody", low: 15, high: 55 },
  { brand: "Nike", category: "shoes", low: 30, high: 110 },
  { brand: "Adidas", category: "shoes", low: 25, high: 90 },
  { brand: "Adidas", category: "upperbody", low: 12, high: 45 },
  { brand: "New Balance", category: "shoes", low: 35, high: 120 },
  { brand: "Veja", category: "shoes", low: 30, high: 70 },
  { brand: "Common Projects", category: "shoes", low: 80, high: 180 },
  { brand: "Dr. Martens", category: "shoes", low: 40, high: 110 },
  { brand: "Levi's", category: "lowerbody", low: 20, high: 55 },
  { brand: "Carhartt", category: "wholebody_up", low: 40, high: 110 },
  { brand: "Carhartt", category: "lowerbody", low: 20, high: 50 },
  { brand: "Ralph Lauren", category: "upperbody", low: 20, high: 70 },
  { brand: "COS", category: "upperbody", low: 15, high: 45 },
  { brand: "COS", category: "wholebody_up", low: 30, high: 90 },
  { brand: "Arket", category: "upperbody", low: 12, high: 40 },
  { brand: "Ganni", category: "upperbody", low: 30, high: 90 },
  { brand: "Ganni", category: "lowerbody", low: 25, high: 80 },
  { brand: "A.P.C.", category: "lowerbody", low: 40, high: 110 },
  { brand: "A.P.C.", category: "upperbody", low: 30, high: 90 },
  { brand: "Polène", category: "bags", low: 150, high: 320 },
  { brand: "Longchamp", category: "bags", low: 40, high: 120 },
  { brand: "Coach", category: "bags", low: 50, high: 180 },
  { brand: "Mejuri", category: "jewellery", low: 25, high: 90 },
  { brand: "Missoma", category: "jewellery", low: 20, high: 70 },
  { brand: "Tissot", category: "watches", low: 80, high: 220 },
  { brand: "Seiko", category: "watches", low: 70, high: 250 },
];

export function findMarketBand(brand: string, category: string): MarketBand | null {
  const needle = brand.trim().toLowerCase();
  if (!needle) return null;
  return (
    MARKET_BANDS.find(
      (band) => band.category === category && band.brand.toLowerCase() === needle,
    ) ?? null
  );
}
