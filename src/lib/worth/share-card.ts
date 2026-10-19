import { formatRange } from "@/lib/worth/format";
import type { NetWorthSummary } from "@/lib/worth/summarise";

export type ShareFormat = "story" | "square";

export type ShareCardInput = {
  format: ShareFormat;
  summary: Pick<NetWorthSummary, "low" | "high" | "pricedCount" | "topPieces" | "monthChange">;
  hideNumbers: boolean;
  ownerLabel?: string;
};

const SIZE: Record<ShareFormat, { width: number; height: number }> = {
  story: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
};

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

const CHANGE_COPY: Record<NetWorthSummary["monthChange"], string> = {
  higher: "Higher than last month",
  lower: "Lower than last month",
  "about the same": "About the same as last month",
  "no earlier estimate": "First estimate",
};

/** A 9:16 or 1:1 card. Figures can be hidden for a screenshot that stays private. */
export function shareCardSvg(input: ShareCardInput): string {
  const { width, height } = SIZE[input.format];
  const range = input.hideNumbers ? "Hidden" : formatRange(input.summary.low, input.summary.high);
  const top = input.summary.topPieces[0];
  const topLine = input.hideNumbers
    ? "Most valuable piece hidden"
    : top
      ? `Top piece · ${top.brand ? `${top.brand} ` : ""}${top.name}`
      : "Add pieces to see a top item";
  const count = `${input.summary.pricedCount} priced ${input.summary.pricedCount === 1 ? "piece" : "pieces"}`;
  const titleSize = input.format === "story" ? 84 : 72;
  const yRange = input.format === "story" ? 640 : 460;
  const footer = height - 120;
  const ranked = input.hideNumbers
    ? []
    : input.summary.topPieces.slice(0, input.format === "story" ? 3 : 2).map((piece, index) => {
        const label = `${piece.brand ? `${piece.brand} ` : ""}${piece.name}`;
        return `${index + 1}  ${label}`;
      });
  const rankedSvg = ranked
    .map(
      (line, index) =>
        `<text x="96" y="${yRange + 210 + index * 56}" fill="#f3ecdf" font-family="Helvetica, Arial, sans-serif" font-size="28">${escapeXml(line)}</text>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#1c1410"/>
  <rect x="48" y="48" width="${width - 96}" height="${height - 96}" fill="none" stroke="#e0a955" stroke-width="2"/>
  <text x="96" y="160" fill="#e0a955" font-family="Georgia, serif" font-size="26" letter-spacing="8">WARDROBE</text>
  <text x="96" y="220" fill="#f3ecdf" font-family="Helvetica, Arial, sans-serif" font-size="20" letter-spacing="4">NET WORTH</text>
  <line x1="96" y1="260" x2="280" y2="260" stroke="#e0a955" stroke-width="2"/>
  <text x="96" y="${yRange}" fill="#f6f1e8" font-family="Georgia, serif" font-size="${titleSize}">${escapeXml(range)}</text>
  <text x="96" y="${yRange + 64}" fill="#c8b8a2" font-family="Helvetica, Arial, sans-serif" font-size="28">${escapeXml(CHANGE_COPY[input.summary.monthChange])}</text>
  <text x="96" y="${yRange + 120}" fill="#f3ecdf" font-family="Helvetica, Arial, sans-serif" font-size="26">${escapeXml(count)}</text>
  ${rankedSvg}
  <text x="96" y="${footer - 90}" fill="#f3ecdf" font-family="Helvetica, Arial, sans-serif" font-size="26">${escapeXml(topLine)}</text>
  <text x="96" y="${footer - 36}" fill="#a89884" font-family="Helvetica, Arial, sans-serif" font-size="20">Estimate, not an offer · GBP resale range</text>
  <text x="96" y="${footer + 8}" fill="#a89884" font-family="Helvetica, Arial, sans-serif" font-size="18">${escapeXml(input.ownerLabel ?? "A private wardrobe")}</text>
</svg>`;
}
