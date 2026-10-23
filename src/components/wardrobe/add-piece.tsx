import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, UploadSimple, X } from "@phosphor-icons/react";
import { apiFetch } from "../../lib/api-fetch";
import { fileToUploadDataUrl } from "../../lib/image/pixels";

const PARTS: ReadonlyArray<readonly [string, string]> = [
  ["upperbody", "Tops"],
  ["wholebody_up", "Jackets"],
  ["lowerbody", "Bottoms"],
  ["accessories_up", "Accessories"],
  ["shoes", "Shoes"],
  ["bags", "Bags"],
  ["watches", "Watches"],
  ["jewellery", "Jewellery"],
];
const CONDITIONS: ReadonlyArray<readonly [string, string]> = [
  ["", "Not sure"],
  ["new_with_tags", "New with tags"],
  ["like_new", "Like new"],
  ["good", "Good"],
  ["fair", "Fair"],
];

// Resized and re-encoded first: a raw camera photo is many times larger than the
// upload endpoints accept.
const fileToDataUrl = (file: File) => fileToUploadDataUrl(file);

type Draft = {
  name: string;
  part: string;
  brand: string;
  condition: string;
  value: string;
  tags: string;
};

/** Shape returned when a photo is stored without the import pipeline. */
export type DirectPiece = {
  id: string;
  name: string;
  part: string;
  brand?: string;
  occasion?: string;
  value?: number | null;
  color?: string | null;
  secondaryColor?: string | null;
  palette?: string[];
  tags?: string[];
  image?: string | null;
  thumbnail?: string | null;
  modeledImage?: string | null;
  canGenerateModeled?: boolean;
  size?: string | null;
  condition?: string | null;
  purchasePrice?: number | null;
  purchaseDate?: string | null;
  valueLow?: number | null;
  valueHigh?: number | null;
  valueSource?: string | null;
  valuedAt?: string | null;
  valueConfidence?: string | null;
  valueOverridden?: boolean;
  lastWornAt?: string | null;
  wearCount?: number;
  updatedAt?: string | null;
};

const EMPTY_DRAFT: Draft = {
  name: "",
  part: "upperbody",
  brand: "",
  condition: "",
  value: "",
  tags: "",
};

function isDirectPiece(value: unknown): value is DirectPiece {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    typeof value.id === "string" &&
    "name" in value &&
    typeof value.name === "string" &&
    "part" in value &&
    typeof value.part === "string"
  );
}

function errorText(value: unknown, fallback: string): string {
  if (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof value.error === "string" &&
    value.error
  )
    return value.error;
  return fallback;
}

export function AddPieceModal({
  open,
  setupReady,
  onClose,
  onDirectAdded,
}: {
  open: boolean;
  setupReady: boolean;
  onClose: () => void;
  onDirectAdded: (record: DirectPiece) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [skipExtraction, setSkipExtraction] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const choose = useCallback((nextFile: File | null | undefined) => {
    if (!nextFile || !nextFile.type.startsWith("image/")) return;
    setFile(nextFile);
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(nextFile);
    });
    setError("");
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    setFile(null);
    setPreview(null);
    setDraft(EMPTY_DRAFT);
    setSkipExtraction(false);
    setError("");
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    closeButtonRef.current?.focus({ preventScroll: true });
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  useEffect(() => {
    if (!open) return undefined;
    const onPaste = (event: ClipboardEvent) => {
      const pasted = [...(event.clipboardData?.files ?? [])].find((candidate) =>
        candidate.type.startsWith("image/"),
      );
      if (pasted) {
        event.preventDefault();
        choose(pasted);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [open, choose]);

  if (!open) return null;

  const useAI = setupReady && !skipExtraction;

  const submit = async () => {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    const metadata = {
      name: draft.name.trim(),
      part: draft.part,
      brand: draft.brand.trim(),
      condition: draft.condition || null,
      value: draft.value.trim(),
      tags: draft.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    };
    try {
      if (useAI) {
        window.dispatchEvent(
          new CustomEvent("wardrobe:add-piece", { detail: { files: [file], metadata } }),
        );
        onClose();
      } else {
        const imageDataUrl = await fileToDataUrl(file);
        const response = await apiFetch("/api/wardrobe/direct-add", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageDataUrl, metadata }),
        });
        const record: unknown = await response.json().catch(() => ({}));
        if (!response.ok || !isDirectPiece(record))
          throw new Error(errorText(record, "The piece could not be added."));
        onDirectAdded(record);
        onClose();
      }
    } catch (requestError: unknown) {
      setError(
        requestError instanceof Error ? requestError.message : "The piece could not be added.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="addpiece-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="addpiece-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="addpiece-title"
      >
        <header className="addpiece-header">
          <div>
            <p className="addpiece-eyebrow">Wardrobe</p>
            <h2 id="addpiece-title">Add a piece</h2>
          </div>
          <button
            className="addpiece-close"
            type="button"
            onClick={onClose}
            aria-label="Close"
            ref={closeButtonRef}
          >
            <X size={20} weight="light" aria-hidden="true" />
          </button>
        </header>

        <button
          className={`addpiece-drop${dragOver ? " is-over" : ""}${preview ? " has-preview" : ""}`}
          type="button"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(false);
            choose(event.dataTransfer.files[0]);
          }}
          aria-label={preview ? "Replace photo" : "Choose a photo"}
        >
          {preview ? (
            <img src={preview} alt="Chosen piece" />
          ) : (
            <span className="addpiece-drop-copy">
              <UploadSimple size={26} aria-hidden="true" />
              <strong>Choose a photo</strong>
              <span>Click, drag in, or paste. One item per photo works best.</span>
            </span>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={(event) => {
            choose(event.target.files?.[0]);
            event.target.value = "";
          }}
        />

        <div className="addpiece-fields">
          <label className="field">
            <span>Name</span>
            <input
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder="Navy overshirt"
            />
          </label>
          <label className="field">
            <span>Category</span>
            <select
              value={draft.part}
              onChange={(event) => setDraft({ ...draft, part: event.target.value })}
            >
              {PARTS.map(([id, label]) => (
                <option value={id} key={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Brand</span>
            <input
              value={draft.brand}
              onChange={(event) => setDraft({ ...draft, brand: event.target.value })}
              placeholder="Only if you know it"
            />
          </label>
          <label className="field">
            <span>Condition</span>
            <select
              value={draft.condition}
              onChange={(event) => setDraft({ ...draft, condition: event.target.value })}
            >
              {CONDITIONS.map(([id, label]) => (
                <option value={id} key={id || "unset"}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Purchase price (£)</span>
            <input
              inputMode="decimal"
              value={draft.value}
              onChange={(event) => setDraft({ ...draft, value: event.target.value })}
              placeholder="120"
            />
          </label>
          <label className="field">
            <span>Details</span>
            <input
              value={draft.tags}
              onChange={(event) => setDraft({ ...draft, tags: event.target.value })}
              placeholder="cotton, casual"
            />
          </label>
        </div>

        {setupReady ? (
          <label className="addpiece-toggle">
            <input
              type="checkbox"
              checked={skipExtraction}
              onChange={(event) => setSkipExtraction(event.target.checked)}
            />
            <span>Skip extraction and keep the photo as it is</span>
          </label>
        ) : (
          <p className="addpiece-note">
            Clean cutout extraction switches on once your OpenAI key and reference photo are set up.
            Until then the photo is added as it is.
          </p>
        )}

        {error && (
          <p className="addpiece-error" role="alert">
            {error}
          </p>
        )}

        <div className="addpiece-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={!file || busy}
            onClick={submit}
          >
            <Plus size={15} weight="bold" aria-hidden="true" />{" "}
            {busy ? "Adding" : useAI ? "Add and extract" : "Add piece"}
          </button>
        </div>
      </section>
    </div>
  );
}
