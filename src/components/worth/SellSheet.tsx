import { useState } from "react";
import { buildResaleListing } from "@/lib/worth/listing";
import type { WorthPiece } from "@/lib/worth/types";

export function SellSheet({ piece, onClose }: { piece: WorthPiece; onClose: () => void }) {
  const listing = buildResaleListing(piece);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(listing.clipboard);
      setCopied(true);
    } catch {
      setCopied(false);
    }
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
        aria-labelledby="sell-title"
        data-testid="sell-sheet"
      >
        <header className="worth-sheet-header">
          <div>
            <p className="worth-kicker">Sell this</p>
            <h2 id="sell-title">{listing.title}</h2>
          </div>
          <button type="button" className="secondary-button" onClick={onClose}>
            Close
          </button>
        </header>
        <dl className="sell-facts">
          <div>
            <dt>Suggested price</dt>
            <dd data-testid="sell-price">{listing.suggestedPrice}</dd>
          </div>
          <div>
            <dt>Size</dt>
            <dd>{listing.size}</dd>
          </div>
          <div>
            <dt>Condition</dt>
            <dd>{listing.condition}</dd>
          </div>
        </dl>
        <p className="sell-copy" data-testid="sell-description">
          {listing.description}
        </p>
        <button className="primary-button" type="button" onClick={copy} data-testid="sell-copy">
          {copied ? "Copied" : "Copy listing"}
        </button>
        <p className="worth-disclaimer">
          Ready to paste into a resale listing. The price is an estimate, not an offer.
        </p>
      </section>
    </div>
  );
}
