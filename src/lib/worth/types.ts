export const GARMENT_PARTS = [
  "upperbody",
  "wholebody_up",
  "lowerbody",
  "accessories_up",
  "shoes",
  "bags",
  "watches",
  "jewellery",
] as const;

export type GarmentPart = (typeof GARMENT_PARTS)[number];

export const CONDITIONS = ["new_with_tags", "like_new", "good", "fair"] as const;
export type Condition = (typeof CONDITIONS)[number];

export const CONFIDENCE_LEVELS = ["high", "medium", "low", "unknown"] as const;
export type ValueConfidence = (typeof CONFIDENCE_LEVELS)[number];

export type WorthPiece = {
  id: string;
  name: string;
  part: string;
  brand: string;
  size: string | null;
  condition: Condition | null;
  colour: string | null;
  purchasePrice: number | null;
  purchaseDate: string | null;
  valueLow: number | null;
  valueHigh: number | null;
  valueSource: string | null;
  valueConfidence: ValueConfidence | null;
  valueOverridden: boolean;
  valuedAt: string | null;
  lastWornAt: string | null;
  updatedAt: string | null;
  wearCount: number;
  image: string | null;
};

export type ComparableListing = {
  title: string;
  priceGbp: number;
  source: string;
};

export type ResaleQuery = {
  brand: string;
  category: string;
  condition: Condition | null;
  name: string;
};

export interface ResaleEvidenceSource {
  readonly id: string;
  findComparables(query: ResaleQuery): Promise<ComparableListing[]>;
}

export type ValuationStatus = "estimated" | "needs_details";

export type Valuation = {
  status: ValuationStatus;
  lowGbp: number | null;
  highGbp: number | null;
  confidence: ValueConfidence;
  source: string | null;
  evidence: string[];
  disclaimer: string;
};

export const ESTIMATE_DISCLAIMER =
  "This is an estimate of what similar pieces have resold for. It is not an offer to buy your item.";
