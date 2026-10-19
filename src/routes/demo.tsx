import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { NetWorthHome } from "@/components/worth/NetWorthHome";
import { SellSheet } from "@/components/worth/SellSheet";
import { ShareCards } from "@/components/worth/ShareCards";
import { DEMO_PIECES, DEMO_PREVIOUS, demoPieceFromEstimate } from "@/lib/demo/catalog";
import { CuratedBandSource, estimateResale } from "@/lib/worth/estimate";
import { summariseWardrobe } from "@/lib/worth/summarise";
import { CONDITIONS, GARMENT_PARTS, type Condition } from "@/lib/worth/types";
import { categoryLabel, conditionLabel } from "@/lib/worth/format";

export const Route = createFileRoute("/demo")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Demo wardrobe — net worth preview" },
      {
        name: "description",
        content: "A fictional wardrobe showing how net worth, share cards and listings look.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DemoPage,
});

function DemoPage() {
  const [pieces, setPieces] = useState(DEMO_PIECES);
  const [signedIn, setSignedIn] = useState(false);
  const [email, setEmail] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [sellId, setSellId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({
    name: "Court trainer",
    brand: "Nike",
    part: "shoes",
    condition: "good" as Condition,
  });
  const summary = useMemo(() => summariseWardrobe(pieces, DEMO_PREVIOUS), [pieces]);
  const selling = pieces.find((piece) => piece.id === sellId) ?? null;

  const addPiece = async () => {
    const valuation = await estimateResale(
      { brand: draft.brand, category: draft.part, condition: draft.condition, name: draft.name },
      [new CuratedBandSource()],
    );
    setPieces((current) => [
      demoPieceFromEstimate({
        name: draft.name,
        brand: draft.brand,
        part: draft.part,
        condition: draft.condition,
        low: valuation.lowGbp,
        high: valuation.highGbp,
        confidence: valuation.confidence,
        source: valuation.source,
      }),
      ...current,
    ]);
    setAdding(false);
  };

  return (
    <main>
      <p className="demo-banner">
        Demo wardrobe. Every piece and figure on this page is fictional.
      </p>
      {!signedIn ? (
        <form
          className="demo-signup"
          data-testid="demo-signup"
          onSubmit={(event) => {
            event.preventDefault();
            if (email.includes("@")) setSignedIn(true);
          }}
        >
          <h2>Create a demo account</h2>
          <p>Nothing is sent anywhere. This stays in the browser so you can try adding a piece.</p>
          <label>
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              data-testid="demo-email"
              autoComplete="email"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              required
              minLength={8}
              defaultValue="demo-pass"
              data-testid="demo-password"
            />
          </label>
          <button className="primary-button" type="submit">
            Create demo account
          </button>
        </form>
      ) : (
        <div className="demo-add">
          <p>Signed in as {email}. This demo account is not saved.</p>
          {!adding ? (
            <button
              className="primary-button"
              type="button"
              onClick={() => setAdding(true)}
              data-testid="demo-add-open"
            >
              Add a piece
            </button>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void addPiece();
              }}
              data-testid="demo-add-form"
            >
              <h2>Add a piece from a photo</h2>
              <label>
                Photo
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  data-testid="demo-photo"
                />
              </label>
              <label>
                Name
                <input
                  value={draft.name}
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                  data-testid="demo-name"
                />
              </label>
              <label>
                Brand
                <input
                  value={draft.brand}
                  onChange={(event) => setDraft({ ...draft, brand: event.target.value })}
                  data-testid="demo-brand"
                />
              </label>
              <label>
                Category
                <select
                  value={draft.part}
                  onChange={(event) => setDraft({ ...draft, part: event.target.value })}
                  data-testid="demo-category"
                >
                  {GARMENT_PARTS.map((part) => (
                    <option key={part} value={part}>
                      {categoryLabel(part)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Condition
                <select
                  value={draft.condition}
                  onChange={(event) =>
                    setDraft({ ...draft, condition: event.target.value as Condition })
                  }
                  data-testid="demo-condition"
                >
                  {CONDITIONS.map((condition) => (
                    <option key={condition} value={condition}>
                      {conditionLabel(condition)}
                    </option>
                  ))}
                </select>
              </label>
              <button className="primary-button" type="submit" data-testid="demo-add-submit">
                Save piece
              </button>
            </form>
          )}
        </div>
      )}

      <NetWorthHome summary={summary} onOpenPiece={setSellId} onShare={() => setShareOpen(true)} />
      {shareOpen ? <ShareCards summary={summary} onClose={() => setShareOpen(false)} /> : null}
      {selling ? <SellSheet piece={selling} onClose={() => setSellId(null)} /> : null}
    </main>
  );
}
