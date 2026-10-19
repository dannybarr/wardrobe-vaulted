/** Whole pounds for estimates, so a range never pretends to be precise to the penny. */
export function formatGbp(amount: number, precise = false): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: precise ? 2 : 0,
    maximumFractionDigits: precise ? 2 : 0,
  }).format(amount);
}

export function formatRange(low: number | null, high: number | null, precise = false): string {
  if (low === null || high === null) return "Needs details";
  if (precise && low === high) return formatGbp(low, true);
  if (Math.round(low) === Math.round(high)) return formatGbp(low);
  return `${formatGbp(low, precise)}–${formatGbp(high, precise)}`;
}

export const CATEGORY_LABELS: Record<string, string> = {
  upperbody: "Tops",
  wholebody_up: "Outerwear",
  lowerbody: "Bottoms",
  accessories_up: "Accessories",
  shoes: "Shoes",
  bags: "Bags",
  watches: "Watches",
  jewellery: "Jewellery",
};

export const CONDITION_LABELS: Record<string, string> = {
  new_with_tags: "New with tags",
  like_new: "Like new",
  good: "Good",
  fair: "Fair",
};

export function categoryLabel(part: string): string {
  return CATEGORY_LABELS[part] ?? "Other";
}

export function conditionLabel(condition: string | null): string {
  if (!condition) return "Condition not set";
  return CONDITION_LABELS[condition] ?? condition;
}
