import { ArrowRight, CheckCircle, Sparkle, UploadSimple } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

const DEMO_PIECES = [
  { label: "Top", tone: "ink" },
  { label: "Bottom", tone: "stone" },
  { label: "Shoes", tone: "paper" },
];

/**
 * The original one-screen landing experience, preserved. The only change is that
 * "Craft your vault" now starts real account onboarding via `onEnter`.
 */
export function LandingPage({ onEnter }: { onEnter: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState("");
  const [stage, setStage] = useState<"ready" | "processing" | "complete">("ready");

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  const processPhoto = (file?: File | null) => {
    if (!file?.type?.startsWith("image/")) return;
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
    setStage("processing");
    window.setTimeout(() => setStage("complete"), 1250);
  };

  const onDrop = (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    processPhoto(event.dataTransfer.files?.[0]);
  };

  return (
    <main className="landing-page">
      <header className="landing-nav">
        <a className="landing-wordmark" href="#top" aria-label="Wardrobe home">
          WARDROBE<span>®</span>
        </a>
        <span className="landing-nav__note">PRIVATE BETA · LONDON</span>
      </header>

      <section className="landing-hero" id="top" aria-labelledby="landing-title">
        <div className="landing-copy">
          <p className="landing-kicker">
            <i /> YOUR CLOTHES, MADE USEFUL
          </p>
          <h1 id="landing-title">
            Your wardrobe.
            <br />
            <span>Finally</span> in one place.
          </h1>
          <p className="landing-description">
            Drop in a photo of an outfit. AI separates the pieces, builds your digital wardrobe and
            keeps every look ready to wear.
          </p>
          <button className="landing-cta" type="button" onClick={onEnter}>
            Craft your vault <ArrowRight size={18} weight="bold" aria-hidden="true" />
          </button>
          <p className="landing-footnote">Built for the clothes you already own.</p>
        </div>

        <section className={`vault-console is-${stage}`} aria-label="Wardrobe AI demonstration">
          <div className="vault-console__bar">
            <span>WARDROBE_OS / INGEST</span>
            <span className="vault-console__live">
              <b /> LIVE
            </span>
          </div>
          <div className="vault-console__body">
            {stage === "complete" ? (
              <div className="vault-result">
                <div className="vault-result__heading">
                  <span>
                    <CheckCircle size={16} weight="fill" /> LOOK ADDED
                  </span>
                  <small>03 PIECES FOUND</small>
                </div>
                <div className="vault-result__pieces">
                  {DEMO_PIECES.map((piece) => (
                    <div className={`vault-piece vault-piece--${piece.tone}`} key={piece.label}>
                      <div>{preview && <img src={preview} alt="" />}</div>
                      <span>{piece.label}</span>
                    </div>
                  ))}
                </div>
                <div className="vault-outfit">
                  <span>OUTFIT_001</span>
                  <strong>Your new look is ready.</strong>
                  <i>→</i>
                </div>
              </div>
            ) : (
              <label
                className="vault-dropzone"
                onDragOver={(event) => event.preventDefault()}
                onDrop={onDrop}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/*"
                  onChange={(event) => processPhoto(event.target.files?.[0])}
                />
                <div className="vault-dropzone__preview">
                  {preview ? (
                    <img src={preview} alt="Outfit ready for processing" />
                  ) : (
                    <img
                      src="/landing-demo-wardrobe-transparent.png"
                      alt="A selection of wardrobe pieces ready to be added"
                    />
                  )}
                </div>
                <div className="vault-dropzone__copy">
                  {stage === "processing" ? (
                    <>
                      <Sparkle size={22} weight="fill" />
                      <strong>Reading the look…</strong>
                      <small>Finding individual pieces</small>
                    </>
                  ) : (
                    <>
                      <UploadSimple size={22} weight="bold" />
                      <strong>Drop your outfit here</strong>
                      <small>or choose one from your camera roll</small>
                    </>
                  )}
                </div>
              </label>
            )}
          </div>
          <div className="vault-console__footer">
            <span>
              {stage === "complete"
                ? "VAULT UPDATED"
                : stage === "processing"
                  ? "AI ANALYSING"
                  : "AWAITING IMAGE"}
            </span>
            <span>SECURE PRIVATE LIBRARY</span>
          </div>
        </section>
      </section>

      <div className="landing-orbit landing-orbit--one" aria-hidden="true" />
      <div className="landing-orbit landing-orbit--two" aria-hidden="true" />
    </main>
  );
}
