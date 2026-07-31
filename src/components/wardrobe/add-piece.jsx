import { useEffect, useRef, useState } from "react";
import { Plus, UploadSimple, X } from "@phosphor-icons/react";
import { apiFetch } from "../../lib/api-fetch";

const PARTS = [
  ["upperbody", "Tops"],
  ["wholebody_up", "Jackets"],
  ["lowerbody", "Bottoms"],
  ["accessories_up", "Accessories"],
  ["shoes", "Shoes"],
];

const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(reader.error || new Error("Could not read that image."));
  reader.readAsDataURL(file);
});

const EMPTY_DRAFT = { name: "", part: "upperbody", value: "", tags: "" };

export function AddPieceModal({ open, setupReady, onClose, onDirectAdded }) {
  const fileInputRef = useRef(null);
  const closeButtonRef = useRef(null);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [skipExtraction, setSkipExtraction] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    setFile(null);
    setPreview(null);
    setDraft(EMPTY_DRAFT);
    setSkipExtraction(false);
    setError("");
    const onKeyDown = (event) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKeyDown);
    closeButtonRef.current?.focus({ preventScroll: true });
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  useEffect(() => {
    if (!open) return undefined;
    const onPaste = (event) => {
      const pasted = [...event.clipboardData.files].find((candidate) => candidate.type.startsWith("image/"));
      if (pasted) { event.preventDefault(); choose(pasted); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [open]);

  if (!open) return null;

  const choose = (nextFile) => {
    if (!nextFile || !nextFile.type.startsWith("image/")) return;
    setFile(nextFile);
    setPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(nextFile);
    });
    setError("");
  };

  const useAI = setupReady && !skipExtraction;

  const submit = async () => {
    if (!file || busy) return;
    setBusy(true);
    setError("");
    const metadata = {
      name: draft.name.trim(),
      part: draft.part,
      value: draft.value.trim(),
      tags: draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
    };
    try {
      if (useAI) {
        window.dispatchEvent(new CustomEvent("wardrobe:add-piece", { detail: { files: [file], metadata } }));
        onClose();
      } else {
        const imageDataUrl = await fileToDataUrl(file);
        const response = await apiFetch("/api/wardrobe/direct-add", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageDataUrl, metadata }),
        });
        const record = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(record.error || "The piece could not be added.");
        onDirectAdded(record);
        onClose();
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="addpiece-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="addpiece-modal" role="dialog" aria-modal="true" aria-labelledby="addpiece-title">
        <header className="addpiece-header">
          <div>
            <p className="addpiece-eyebrow">Wardrobe</p>
            <h2 id="addpiece-title">Add a piece</h2>
          </div>
          <button className="addpiece-close" type="button" onClick={onClose} aria-label="Close" ref={closeButtonRef}>
            <X size={20} weight="light" aria-hidden="true" />
          </button>
        </header>

        <button
          className={`addpiece-drop${dragOver ? " is-over" : ""}${preview ? " has-preview" : ""}`}
          type="button"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(event) => { event.preventDefault(); setDragOver(false); choose(event.dataTransfer.files[0]); }}
          aria-label={preview ? "Replace photo" : "Choose a photo"}
        >
          {preview
            ? <img src={preview} alt="Chosen piece" />
            : (
              <span className="addpiece-drop-copy">
                <UploadSimple size={26} aria-hidden="true" />
                <strong>Choose a photo</strong>
                <span>Click, drag in, or paste. One item per photo works best.</span>
              </span>
            )}
        </button>
        <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={(event) => { choose(event.target.files[0]); event.target.value = ""; }} />

        <div className="addpiece-fields">
          <label className="field"><span>Name</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Navy overshirt" /></label>
          <label className="field"><span>Category</span>
            <select value={draft.part} onChange={(event) => setDraft({ ...draft, part: event.target.value })}>
              {PARTS.map(([id, label]) => <option value={id} key={id}>{label}</option>)}
            </select>
          </label>
          <label className="field"><span>Value (£)</span><input inputMode="decimal" value={draft.value} onChange={(event) => setDraft({ ...draft, value: event.target.value })} placeholder="120" /></label>
          <label className="field"><span>Details</span><input value={draft.tags} onChange={(event) => setDraft({ ...draft, tags: event.target.value })} placeholder="cotton, casual" /></label>
        </div>

        {setupReady ? (
          <label className="addpiece-toggle">
            <input type="checkbox" checked={skipExtraction} onChange={(event) => setSkipExtraction(event.target.checked)} />
            <span>Skip extraction and keep the photo as it is</span>
          </label>
        ) : (
          <p className="addpiece-note">Clean cutout extraction switches on once your OpenAI key and reference photo are set up. Until then the photo is added as it is.</p>
        )}

        {error && <p className="addpiece-error" role="alert">{error}</p>}

        <div className="addpiece-actions">
          <button className="secondary-button" type="button" onClick={onClose}>Cancel</button>
          <button className="primary-button" type="button" disabled={!file || busy} onClick={submit}>
            <Plus size={15} weight="bold" aria-hidden="true" /> {busy ? "Adding" : useAI ? "Add and extract" : "Add piece"}
          </button>
        </div>
      </section>
    </div>
  );
}
