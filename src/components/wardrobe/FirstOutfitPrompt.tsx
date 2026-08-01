import { UploadSimple, X } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { takePendingOutfitPhoto } from "@/lib/trial/handoff";

/**
 * The first thing a new visitor sees inside the wardrobe: a single, obvious ask —
 * add your first outfit. Choosing a photo hands it to the existing import
 * pipeline, which reads the pieces out of it.
 */
export function FirstOutfitPrompt() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(true);
  const [dragOver, setDragOver] = useState(false);

  const submit = (file?: File | null) => {
    if (!file?.type?.startsWith("image/")) return;
    setOpen(false);
    window.dispatchEvent(new CustomEvent("wardrobe:add-piece", { detail: { files: [file] } }));
  };

  // A photo already chosen on the landing page skips the ask entirely.
  useEffect(() => {
    const handed = takePendingOutfitPhoto();
    if (handed) submit(handed);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="addpiece-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}
    >
      <section
        className="addpiece-modal onboard-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboard-title"
      >
        <header className="addpiece-header">
          <div>
            <p className="addpiece-eyebrow">Step one</p>
            <h2 id="onboard-title">Add your first outfit</h2>
          </div>
          <button
            className="addpiece-close"
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
          >
            <X size={20} weight="light" aria-hidden="true" />
          </button>
        </header>

        <p className="addpiece-note onboard-note">
          Upload one photo — a full outfit or a single item. Wardrobe reads the photo, pulls out each
          piece and files it for you.
        </p>

        <button
          className={`addpiece-drop${dragOver ? " is-over" : ""}`}
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            submit(event.dataTransfer.files?.[0]);
          }}
        >
          <span className="addpiece-drop-copy">
            <UploadSimple size={26} aria-hidden="true" />
            <strong>Choose a photo</strong>
            <span>Click, drag in or paste. Your camera roll works perfectly.</span>
          </span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            submit(event.target.files?.[0]);
            event.target.value = "";
          }}
        />

        <div className="addpiece-actions">
          <button className="secondary-button" type="button" onClick={() => setOpen(false)}>
            I'll look around first
          </button>
        </div>
      </section>
    </div>
  );
}
