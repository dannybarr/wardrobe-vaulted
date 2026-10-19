import { formatGbp, formatRange, categoryLabel } from "@/lib/worth/format";
import type { NetWorthSummary } from "@/lib/worth/summarise";
import type { WorthPiece } from "@/lib/worth/types";

export function NetWorthHome({
  summary,
  onOpenPiece,
  onShare,
}: {
  summary: NetWorthSummary;
  onOpenPiece: (id: string) => void;
  onShare: () => void;
}) {
  const change =
    summary.monthChange === "higher"
      ? "Higher than last month"
      : summary.monthChange === "lower"
        ? "Lower than last month"
        : summary.monthChange === "about the same"
          ? "About the same as last month"
          : "No earlier estimate yet";

  return (
    <div className="worth-page">
      <p className="worth-kicker">Wardrobe net worth</p>
      <h1 className="worth-range" data-testid="net-worth-total">
        {summary.pricedCount ? formatRange(summary.low, summary.high) : "Needs details"}
      </h1>
      <p className="worth-change" data-testid="net-worth-change">
        {change}
        {summary.previous
          ? ` · was ${formatRange(summary.previous.low, summary.previous.high)}`
          : ""}
      </p>
      <p className="worth-disclaimer">Estimate of resale value in GBP. Not an offer to buy.</p>

      <div className="worth-actions">
        <button className="primary-button" type="button" onClick={onShare} data-testid="open-share">
          Share card
        </button>
      </div>

      <section className="worth-section" aria-labelledby="worth-categories">
        <h2 id="worth-categories">By category</h2>
        {summary.byCategory.length ? (
          <ul className="worth-bars" data-testid="category-breakdown">
            {summary.byCategory.map((row) => (
              <li key={row.label}>
                <div className="worth-bar-label">
                  <span>{row.label}</span>
                  <span>{formatRange(row.low, row.high)}</span>
                </div>
                <div className="worth-bar-track">
                  <div
                    className="worth-bar-fill"
                    style={{
                      width: `${summary.high ? Math.max(8, (row.high / summary.high) * 100) : 0}%`,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="worth-empty">Add a brand and category to see a breakdown.</p>
        )}
      </section>

      <section className="worth-section" aria-labelledby="worth-brands">
        <h2 id="worth-brands">By brand</h2>
        {summary.byBrand.length ? (
          <ul className="worth-list" data-testid="brand-breakdown">
            {summary.byBrand.map((row) => (
              <li key={row.label}>
                <span>{row.label}</span>
                <span>{formatRange(row.low, row.high)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="worth-empty">Brands appear here once a piece has an estimate.</p>
        )}
      </section>

      <section className="worth-section" aria-labelledby="worth-top">
        <h2 id="worth-top">Most valuable</h2>
        {summary.topPieces.length ? (
          <ol className="worth-top" data-testid="top-pieces">
            {summary.topPieces.map((piece) => (
              <li key={piece.id}>
                <button type="button" onClick={() => onOpenPiece(piece.id)}>
                  <PieceThumb piece={piece} />
                  <span>
                    <strong>{piece.name}</strong>
                    <small>
                      {[piece.brand, categoryLabel(piece.part)].filter(Boolean).join(" · ")}
                    </small>
                  </span>
                  <em>
                    {formatRange(piece.valueLow, piece.valueHigh, piece.valueSource === "user")}
                  </em>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="worth-empty">Nothing priced yet.</p>
        )}
      </section>

      <section className="worth-section" aria-labelledby="worth-forgotten">
        <h2 id="worth-forgotten">Forgotten value</h2>
        <p className="worth-note">Pieces not worn or edited in six months or more.</p>
        {summary.forgotten.pieces.length ? (
          <p data-testid="forgotten-value">
            {formatRange(summary.forgotten.low, summary.forgotten.high)} across{" "}
            {summary.forgotten.pieces.length}{" "}
            {summary.forgotten.pieces.length === 1 ? "piece" : "pieces"}.
          </p>
        ) : (
          <p>Nothing has been sitting that long.</p>
        )}
      </section>

      <section className="worth-section" aria-labelledby="worth-cpw">
        <h2 id="worth-cpw">Cost per wear</h2>
        {summary.costPerWear.length ? (
          <ul className="worth-list" data-testid="cost-per-wear">
            {summary.costPerWear.map((row) => (
              <li key={row.id}>
                <span>{row.name}</span>
                <span>
                  {row.pounds === null ? row.note : `${formatGbp(row.pounds, true)} · ${row.note}`}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="worth-empty">Add a purchase price to see cost per wear.</p>
        )}
      </section>

      {summary.needsDetailsCount > 0 ? (
        <p className="worth-note" data-testid="needs-details-count">
          {summary.needsDetailsCount}{" "}
          {summary.needsDetailsCount === 1 ? "piece needs" : "pieces need"} details before{" "}
          {summary.needsDetailsCount === 1 ? "it" : "they"} can be priced.
        </p>
      ) : null}
    </div>
  );
}

function PieceThumb({ piece }: { piece: WorthPiece }) {
  if (!piece.image) return <span className="worth-thumb worth-thumb--empty" aria-hidden="true" />;
  return <img className="worth-thumb" src={piece.image} alt="" />;
}
