import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowSquareOut, Check, LinkSimple, Plus, ShoppingBagOpen, Sparkle, SpinnerGap, Trash, UploadSimple, X } from "@phosphor-icons/react";
import { apiFetch } from "../../lib/api-fetch";
import { importPhotoToWishlist } from "../../lib/import/engine";

const API = "/api/wishlist";
const TYPES = [
  { id: "upperbody", label: "Tops" },
  { id: "wholebody_up", label: "Jackets" },
  { id: "lowerbody", label: "Bottoms" },
  { id: "accessories_up", label: "Accessories" },
  { id: "shoes", label: "Shoes" },
];

async function api(path, options) {
  const response = await apiFetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
  });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(value.error || "The wishlist request failed.");
  return value;
}

// Phone photos are far bigger than any endpoint accepts, so every image is
// resized and re-encoded here before it is sent.
const fileToDataUrl = (file) => fileToUploadDataUrl(file);


function AddLinkBar({ onAdd, busy, onPhoto, photoBusy }) {
  const [value, setValue] = useState("");
  const photoInputRef = useRef(null);

  const submit = async () => {
    const url = value.trim();
    if (!url || busy) return;
    const added = await onAdd(url);
    if (added) setValue("");
  };

  return (
    <div className="wishlist-add-bar">
      <LinkSimple size={17} aria-hidden="true" />
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => event.key === "Enter" && submit()}
        placeholder="Paste a product link, or add a photo"
        aria-label="Product link"
        disabled={busy}
      />
      <button type="button" onClick={submit} disabled={busy || !value.trim()}>
        {busy ? <SpinnerGap size={15} className="wishlist-spinner" aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}
        {busy ? "Fetching" : "Add"}
      </button>
      <button
        type="button"
        className="wishlist-add-photo"
        onClick={() => photoInputRef.current?.click()}
        disabled={photoBusy}
        title="Add a wishlist piece from a photo"
      >
        {photoBusy ? <SpinnerGap size={15} className="wishlist-spinner" aria-hidden="true" /> : <UploadSimple size={15} aria-hidden="true" />}
        {photoBusy ? "Reading photo" : "Add photo"}
      </button>
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onPhoto(file);
        }}
      />
    </div>
  );
}


function WishlistCard({ item, onOpen }) {
  return (
    <button className="gallery-item wishlist-card" type="button" onClick={() => onOpen(item.id)} aria-label={`View ${item.name}`}>
      {item.image
        ? <img src={item.image} alt="" loading="lazy" />
        : <span className="wishlist-card-placeholder"><UploadSimple size={22} aria-hidden="true" />Image needed</span>}
      <span className="wishlist-card-meta">
        <span className="wishlist-card-name">{item.name}</span>
        <span className="wishlist-card-detail">{[item.brand, item.price].filter(Boolean).join(" · ") || " "}</span>
      </span>
    </button>
  );
}

function WishlistViewer({ item, setupReady, onClose, onChange, onDelete, onPurchased }) {
  const closeButtonRef = useRef(null);
  const fileInputRef = useRef(null);
  const [draft, setDraft] = useState({ name: item.name, brand: item.brand || "", price: item.price || "", part: item.part });
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setDraft({ name: item.name, brand: item.brand || "", price: item.price || "", part: item.part });
    setError("");
  }, [item.id]);

  useEffect(() => {
    const onKeyDown = (event) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKeyDown);
    document.body.classList.add("viewer-open");
    closeButtonRef.current?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("viewer-open");
    };
  }, [onClose]);

  const run = async (label, task) => {
    setBusy(label);
    setError("");
    try { await task(); }
    catch (requestError) { setError(requestError.message); }
    finally { setBusy(null); }
  };

  const save = () => run("save", async () => {
    const updated = await api(`${API}/${item.id}`, { method: "PATCH", body: JSON.stringify({ name: draft.name, brand: draft.brand, price: draft.price, part: draft.part }) });
    onChange(updated);
  });

  const attachImage = (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    run("image", async () => {
      const imageDataUrl = await fileToDataUrl(file);
      const updated = await api(`${API}/${item.id}/image`, { method: "POST", body: JSON.stringify({ imageDataUrl }) });
      onChange(updated);
    });
  };

  useEffect(() => {
    const onPaste = (event) => {
      const file = [...event.clipboardData.files].find((candidate) => candidate.type.startsWith("image/"));
      if (file) { event.preventDefault(); attachImage(file); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [item.id]);

  const tryOn = () => run("tryon", async () => {
    const updated = await api(`${API}/${item.id}/tryon`, { method: "POST" });
    onChange(updated);
  });

  const purchase = () => run("purchase", async () => {
    const result = await api(`${API}/${item.id}/purchase`, { method: "POST" });
    onPurchased(item.id, result.record);
  });

  const isDirty = draft.name !== item.name || draft.brand !== (item.brand || "") || draft.price !== (item.price || "") || draft.part !== item.part;

  return (
    <div className="viewer-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="viewer-entry">
        <aside className="viewer editing wishlist-viewer" role="dialog" aria-modal="true" aria-label="Selected wishlist item">
          <button className="viewer-icon-close" type="button" onClick={onClose} aria-label="Close viewer" ref={closeButtonRef}>
            <X size={24} weight="light" aria-hidden="true" />
          </button>

          <div className="viewer-heading">
            <div>
              <h2>{draft.name || "Wishlist piece"}</h2>
              <p className="wishlist-viewer-sub">{[item.brand, item.price].filter(Boolean).join(" · ")}</p>
            </div>
          </div>

          {item.modeledImage && (
            <div className="wishlist-modeled">
              <img src={item.modeledImage} alt={`${item.name} worn by you`} />
              <p>Your try-on</p>
            </div>
          )}

          <div className="viewer-art wishlist-art">
            {item.image
              ? <img src={item.image} alt={item.name} />
              : (
                <div className="wishlist-image-fallback">
                  <UploadSimple size={26} aria-hidden="true" />
                  <p>{item.note || "This site blocked automatic fetching. Add the product image yourself."}</p>
                  <button className="secondary-button" type="button" disabled={busy === "image"} onClick={() => fileInputRef.current?.click()}>
                    {busy === "image" ? "Saving" : "Choose image"}
                  </button>
                  <small>Or paste a copied image while this panel is open.</small>
                </div>
              )}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={(event) => { attachImage(event.target.files[0]); event.target.value = ""; }} />

          <div className="viewer-details editing">
            <div className="item-editor">
              <label className="field"><span>Name</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
              <label className="field"><span>Brand</span><input value={draft.brand} onChange={(event) => setDraft({ ...draft, brand: event.target.value })} placeholder="Brand" /></label>
              <label className="field"><span>Price</span><input value={draft.price} onChange={(event) => setDraft({ ...draft, price: event.target.value })} placeholder="£0.00" /></label>
              <label className="field"><span>Category</span>
                <select value={draft.part} onChange={(event) => setDraft({ ...draft, part: event.target.value })}>
                  {TYPES.map((type) => <option value={type.id} key={type.id}>{type.label}</option>)}
                </select>
              </label>
            </div>

            <div className="wishlist-feature-actions">
              <button className="secondary-button" type="button" disabled={!item.image || busy === "tryon" || !setupReady} onClick={tryOn} title={setupReady ? undefined : "Add your OpenAI key and reference photo to enable try-on"}>
                {busy === "tryon" ? <SpinnerGap size={15} className="wishlist-spinner" aria-hidden="true" /> : <Sparkle size={15} aria-hidden="true" />}
                {busy === "tryon" ? "Generating your try-on" : item.modeledImage ? "Regenerate try-on" : "Try it on"}
              </button>
              <a className="secondary-button wishlist-outlink" href={item.url} target="_blank" rel="noreferrer noopener">
                <ArrowSquareOut size={15} aria-hidden="true" /> View product
              </a>
            </div>
            {!setupReady && <p className="wishlist-hint">Try-on needs your OpenAI key and reference photo set up first.</p>}

            {error && <p className="unsaved-notice" role="alert">{error}</p>}

            <div className="viewer-actions">
              <button className="delete-button" type="button" disabled={busy === "delete"} onClick={() => run("delete", async () => { await api(`${API}/${item.id}`, { method: "DELETE" }); onDelete(item.id); })}>
                <Trash size={15} aria-hidden="true" /> Remove
              </button>
              <span className="action-spacer" />
              <button className="secondary-button" type="button" disabled={!item.image || busy === "purchase"} onClick={purchase}>
                {busy === "purchase" ? <SpinnerGap size={15} className="wishlist-spinner" aria-hidden="true" /> : <ShoppingBagOpen size={15} aria-hidden="true" />}
                I bought it
              </button>
              <button className="primary-button" type="button" disabled={!isDirty || busy === "save"} onClick={save}>
                <Check size={15} weight="bold" aria-hidden="true" /> Save
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export function WishlistPane({ toggle, setupReady, onPurchased }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [adding, setAdding] = useState(false);
  const [addingPhoto, setAddingPhoto] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    api(API)
      .then(setItems)
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, []);

  const addLink = useCallback(async (url) => {
    setAdding(true);
    setError("");
    setNotice("");
    try {
      const { item, duplicate } = await api(`${API}/resolve`, { method: "POST", body: JSON.stringify({ url }) });
      if (duplicate) {
        setNotice("That link is already on your wishlist.");
        setSelectedId(item.id);
        return true;
      }
      setItems((current) => [...current, item]);
      if (item.status === "needs-image") setSelectedId(item.id);
      return true;
    } catch (requestError) {
      setError(requestError.message);
      return false;
    } finally {
      setAdding(false);
    }
  }, []);

  // A photo goes through exactly the same extraction the wardrobe uses, and each
  // piece it finds lands on the wishlist ready to edit.
  const addPhoto = useCallback(async (file) => {
    if (!file?.type?.startsWith("image/")) return;
    setAddingPhoto(true);
    setError("");
    setNotice("");
    try {
      const { items: added, noClothingDetected } = await importPhotoToWishlist(file);
      if (noClothingDetected || !added.length) {
        setNotice("No clothing was found in that photo. Try a clearer one.");
        return;
      }
      setItems((current) => [...current, ...added]);
      setNotice(added.length === 1 ? "Added from your photo." : `Added ${added.length} pieces from your photo.`);
      setSelectedId(added[0].id);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setAddingPhoto(false);
    }
  }, []);

  const changeItem = useCallback((updated) => {
    setItems((current) => current.map((item) => item.id === updated.id ? updated : item));
  }, []);

  const removeItem = useCallback((id) => {
    setItems((current) => current.filter((item) => item.id !== id));
    setSelectedId(null);
  }, []);

  const purchasedItem = useCallback((id, record) => {
    setItems((current) => current.filter((item) => item.id !== id));
    setSelectedId(null);
    setNotice("Moved to your wardrobe.");
    onPurchased(record);
  }, [onPurchased]);

  const selectedItem = items.find((item) => item.id === selectedId) || null;

  return (
    <main className="gallery-pane">
      <header className="gallery-header">
        <div className="gallery-meta-row">
          <p className="piece-count">{items.length} {items.length === 1 ? "piece" : "pieces"} wished for</p>
          {toggle}
        </div>
        <AddLinkBar onAdd={addLink} busy={adding} onPhoto={addPhoto} photoBusy={addingPhoto} />
      </header>

      {error && <p className="status error">{error}</p>}
      {notice && !error && <p className="status" role="status">{notice}</p>}
      {!error && loading && <p className="status">Loading wishlist</p>}
      {!error && !loading && !items.length && <p className="status empty">Paste a product link above to start your wishlist.</p>}

      {!!items.length && (
        <section className="gallery-grid wishlist-grid" aria-label="Wishlist items">
          {items.map((item) => <WishlistCard key={item.id} item={item} onOpen={setSelectedId} />)}
        </section>
      )}

      {selectedItem && (
        <WishlistViewer
          item={selectedItem}
          setupReady={setupReady}
          onClose={() => setSelectedId(null)}
          onChange={changeItem}
          onDelete={removeItem}
          onPurchased={purchasedItem}
        />
      )}
    </main>
  );
}
