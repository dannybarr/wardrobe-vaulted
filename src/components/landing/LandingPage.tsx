import { ArrowRight, CheckCircle, Sparkle, UploadSimple } from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

const DEMO_PIECES = [
  { label: "Top", tone: "ink" },
  { label: "Bottom", tone: "stone" },
  { label: "Shoes", tone: "paper" },
];

/**
 * Public home. Account creation, the read-only demo, and sign-in are the ways in.
 * "Craft your vault" stays as the no-account trial. A dropped photo still opens that trial.
 */
export function LandingPage({ onPhotoChosen }: { onPhotoChosen?: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<number | null>(null);
  const [preview, setPreview] = useState("");
  const [stage, setStage] = useState<"ready" | "processing" | "complete">("ready");

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  // The reveal timer must not outlive the page, or it settles a screen that has gone.
  useEffect(
    () => () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    },
    [],
  );

  const processPhoto = (file?: File | null) => {
    if (!file?.type?.startsWith("image/")) return;
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
    setStage("processing");
    // A direct upload goes straight into the wardrobe's first-outfit flow.
    if (onPhotoChosen) {
      onPhotoChosen(file);
      return;
    }
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => setStage("complete"), 1250);
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
        <div className="landing-nav__links">
          <Link to="/auth" search={{ mode: "signin" }} className="landing-nav__signin">
            Sign in
          </Link>
          <span className="landing-nav__note">PRIVATE BETA · LONDON</span>
        </div>
      </header>

      <section className="landing-hero" id="top" aria-labelledby="landing-title">
        <div className="landing-copy">
          <p className="landing-kicker">
            <i /> NET WORTH FOR YOUR CLOTHES
          </p>
          <h1 id="landing-title">
            Know what your
            <br />
            wardrobe is <span>worth</span>.
          </h1>
          <p className="landing-description">
            See the live resale value of every piece you own, in GBP, with share cards.
          </p>
          <div className="landing-actions">
            <Link to="/auth" search={{ mode: "signup" }} className="landing-cta">
              Start your vault <ArrowRight size={18} weight="bold" aria-hidden="true" />
            </Link>
            <Link to="/demo" className="landing-cta landing-cta--secondary">
              See a demo wardrobe
            </Link>
          </div>
          <p className="landing-trial">
            <Link to="/try">Craft your vault</Link>
            <span>No account. Try it with one photo.</span>
          </p>
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
