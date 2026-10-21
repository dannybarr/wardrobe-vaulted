import type { DirectPiece } from "../../components/wardrobe/add-piece.tsx";
import type { WishlistPiece } from "../import/engine.ts";
import { quoteCuratedBand } from "../worth/quote.ts";
import libraryJson from "../../data/founder-seed/library.json" with { type: "json" };
import outfitsJson from "../../data/founder-seed/outfits.json" with { type: "json" };
import wishlistJson from "../../data/founder-seed/wishlist.json" with { type: "json" };

/**
 * Public catalogue behind /demo. Brands are read out of the piece name so the
 * existing resale bands can price what they recognise. Unknown names stay
 * unpriced. This module does not grant founder access and does not talk to
 * Supabase.
 */

const BRAND_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bair jordan\b/i, "Nike"],
  [/\bnike\b/i, "Nike"],
  [/\badidas\b/i, "Adidas"],
  [/\bap monogram\b|\ba\.?\s*p\.?\s*c\.?\b/i, "A.P.C."],
  [/\bfred perry\b/i, "Fred Perry"],
  [/\bloewe\b/i, "Loewe"],
  [/\bpalace\b/i, "Palace"],
  [/\bgap\b/i, "GAP"],
  [/\bralph lauren\b|\bpolo\b/i, "Ralph Lauren"],
];

export function brandFromName(name: string): string {
  for (const [pattern, brand] of BRAND_RULES) {
    if (pattern.test(name)) return brand;
  }
  return "";
}

type LibraryRecord = (typeof libraryJson)[number];

function pieceFrom(record: LibraryRecord): DirectPiece {
  const brand = brandFromName(record.name);
  const quote = quoteCuratedBand({
    brand,
    category: record.part,
    condition: null,
    name: record.name,
  });
  const priced = quote.status === "estimated" && quote.lowGbp !== null && quote.highGbp !== null;
  return {
    id: record.id,
    name: record.name,
    part: record.part,
    brand,
    color: record.color,
    secondaryColor: record.secondaryColor,
    palette: record.palette,
    tags: record.tags,
    image: record.image,
    thumbnail: record.thumbnail,
    modeledImage: record.modeledImage,
    valueLow: priced ? quote.lowGbp : null,
    valueHigh: priced ? quote.highGbp : null,
    valueSource: priced ? quote.source : null,
    valueConfidence: priced ? quote.confidence : "unknown",
    valueOverridden: false,
  };
}

export type FounderOutfit = {
  id: string;
  name: string;
  garmentIds: string[];
  colors: string[];
  modeledImage: string | null;
};

export const founderPieces: DirectPiece[] = libraryJson.map(pieceFrom);

export const founderOutfits: FounderOutfit[] = outfitsJson.map((outfit) => ({
  id: outfit.id,
  name: outfit.name,
  garmentIds: outfit.garmentIds,
  colors: outfit.colors,
  modeledImage: outfit.modeledImage,
}));

export const founderWishlist: WishlistPiece[] = wishlistJson.map((item) => ({
  id: item.id,
  name: item.name,
  brand: item.brand,
  price: item.price,
  part: item.part,
  url: item.url,
  note: null,
  status: item.status,
  image: item.image,
  modeledImage: item.modeledImage,
}));

export const founderPreview = {
  pieces: founderPieces,
  outfits: founderOutfits,
  wishlist: founderWishlist,
};
