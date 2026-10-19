import { useMemo, useState } from "react";
import { shareCardSvg, type ShareFormat } from "@/lib/worth/share-card";
import type { NetWorthSummary } from "@/lib/worth/summarise";

function svgUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function ShareCards({
  summary,
  onClose,
}: {
  summary: NetWorthSummary;
  onClose: () => void;
}) {
  const [hideNumbers, setHideNumbers] = useState(false);
  const cards = useMemo(() => {
    const formats: ShareFormat[] = ["story", "square"];
    return formats.map((format) => ({
      format,
      svg: shareCardSvg({ format, summary, hideNumbers }),
    }));
  }, [hideNumbers, summary]);

  const download = (format: ShareFormat, svg: string) => {
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download =
      format === "story" ? "wardrobe-net-worth-9x16.svg" : "wardrobe-net-worth-1x1.svg";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className="worth-sheet-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="worth-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-title"
        data-testid="share-sheet"
      >
        <header className="worth-sheet-header">
          <div>
            <p className="worth-kicker">Share</p>
            <h2 id="share-title">Net worth card</h2>
          </div>
          <button type="button" className="secondary-button" onClick={onClose}>
            Close
          </button>
        </header>
        <label className="worth-hide">
          <input
            type="checkbox"
            checked={hideNumbers}
            onChange={(event) => setHideNumbers(event.target.checked)}
            data-testid="hide-numbers"
          />
          Hide exact figures
        </label>
        <div className="share-grid">
          {cards.map((card) => (
            <figure key={card.format} data-testid={`share-card-${card.format}`}>
              <img
                src={svgUrl(card.svg)}
                alt={card.format === "story" ? "9:16 net worth card" : "Square net worth card"}
                className={
                  card.format === "story"
                    ? "share-preview share-preview--story"
                    : "share-preview share-preview--square"
                }
              />
              <figcaption>
                {card.format === "story" ? "9:16 · Stories and TikTok" : "1:1 · X"}
              </figcaption>
              <button
                type="button"
                className="secondary-button"
                onClick={() => download(card.format, card.svg)}
              >
                Download
              </button>
            </figure>
          ))}
        </div>
        <p className="worth-disclaimer">
          Estimate, not an offer. Figures are a resale range in GBP.
        </p>
      </section>
    </div>
  );
}
