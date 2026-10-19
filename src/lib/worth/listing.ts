import { conditionLabel, formatRange } from "@/lib/worth/format";
import type { WorthPiece } from "@/lib/worth/types";

export type ResaleListing = {
  title: string;
  description: string;
  suggestedPrice: string;
  size: string;
  condition: string;
  clipboard: string;
};

export function buildResaleListing(piece: WorthPiece): ResaleListing {
  const condition = conditionLabel(piece.condition);
  const size = piece.size?.trim() || "Size not set";
  const titleParts = [piece.brand.trim(), piece.name.trim(), piece.size?.trim() || ""].filter(
    Boolean,
  );
  const title = titleParts.join(" ").replace(/\s+/g, " ").slice(0, 80);
  const price =
    piece.valueLow !== null && piece.valueHigh !== null
      ? formatRange(piece.valueLow, piece.valueHigh, piece.valueSource === "user")
      : "Needs details";

  const description = [
    `${piece.name.trim() || "Piece"}${piece.brand.trim() ? ` by ${piece.brand.trim()}` : ""}.`,
    `Condition: ${condition}.`,
    `Size: ${size}.`,
    piece.colour ? `Colour: ${piece.colour}.` : "",
    price === "Needs details"
      ? "Price on request — this piece still needs a resale estimate."
      : `Suggested asking range: ${price}. This is an estimate of similar resale prices, not an offer.`,
  ]
    .filter(Boolean)
    .join(" ");

  const clipboard = [
    `${title}`,
    ``,
    description,
    ``,
    `Suggested price: ${price}`,
    `Size: ${size}`,
    `Condition: ${condition}`,
  ].join("\n");

  return { title, description, suggestedPrice: price, size, condition, clipboard };
}
