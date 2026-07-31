import { useEffect, useMemo, useState } from "react";
import { Check, Plus, Sparkle, Trash, X } from "@phosphor-icons/react";
import { OptimizedImage } from "./OptimizedImage.jsx";
import { apiFetch } from "../../lib/api-fetch";

const LABELS = {
  upperbody: "Top",
  wholebody_up: "Layer",
  lowerbody: "Bottom",
  accessories_up: "Accessory",
  shoes: "Shoes",
};

function colorsFor(item) {
  return [item.color, item.secondaryColor, ...(item.palette || [])]
    .filter((color, index, all) => typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color) && all.indexOf(color) === index);
}

function rgb(hex) {
  return [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
}

function colourScore(first, second) {
  const firstColors = colorsFor(first).length ? colorsFor(first) : ["#808080"];
  const secondColors = colorsFor(second).length ? colorsFor(second) : ["#808080"];
  const nearNeutral = (r, g, b) => Math.max(r, g, b) - Math.min(r, g, b) < .12;
  const scores = firstColors.flatMap((firstColor) => secondColors.map((secondColor) => {
    const [r1, g1, b1] = rgb(firstColor);
    const [r2, g2, b2] = rgb(secondColor);
    const distance = Math.sqrt(((r1 - r2) ** 2) + ((g1 - g2) ** 2) + ((b1 - b2) ** 2));
    return (nearNeutral(r1, g1, b1) || nearNeutral(r2, g2, b2) ? 1.15 : 1) - Math.min(distance, 1.1) * .34;
  }));
  return scores.reduce((total, score) => total + score, 0) / scores.length;
}

function reasonFor(items) {
  const colors = [...new Set(items.flatMap(colorsFor))];
  if (colors.length < 2) return "A clean tonal base that lets the pieces do the work.";
  const [first, second] = colors;
  const [r1, g1, b1] = rgb(first);
  const [r2, g2, b2] = rgb(second);
  const muted = Math.max(r1, g1, b1) - Math.min(r1, g1, b1) < .15 || Math.max(r2, g2, b2) - Math.min(r2, g2, b2) < .15;
  return muted ? "A neutral anchor makes the colour detail feel considered." : "The shared colour story gives this look an easy sense of cohesion.";
}

function FlatLay({ items, compact = false }) {
  const sorted = [...items].sort((a, b) => ({ wholebody_up: 0, upperbody: 1, lowerbody: 2, shoes: 3, accessories_up: 4 }[a.part] ?? 9) - ({ wholebody_up: 0, upperbody: 1, lowerbody: 2, shoes: 3, accessories_up: 4 }[b.part] ?? 9));
  return (
    <div className={`outfit-flatlay${compact ? " compact" : ""}`} data-piece-count={sorted.length} aria-label={`Outfit with ${items.map((item) => item.name).join(", ")}`}>
      {sorted.map((item) => (
        <div className={`outfit-piece piece-${item.part}`} key={item.id}>
          <span className="outfit-piece__label">{LABELS[item.part] || "Piece"}</span>
          <OptimizedImage src={item.thumbnail || item.image} alt={item.name} sizes="(max-width: 520px) 72vw, (max-width: 1180px) 42vw, 420px" breakpoints={[160, 240, 320, 480, 640]} />
        </div>
      ))}
    </div>
  );
}

function ColourMarks({ items }) {
  const colors = [...new Set(items.flatMap(colorsFor))].slice(0, 4);
  return <div className="outfit-colors" aria-label="Colours in this outfit">{colors.map((color) => <span key={color} style={{ backgroundColor: color }} title={color} />)}</div>;
}

function OutfitCard({ outfit, pieces, recommended = false, setupReady, onUse, onGenerate, onDelete, onRebuild }) {
  const modeled = outfit.modeledImage;
  const processing = outfit.generation?.status === "processing";
  const failed = outfit.generation?.status === "failed";
  const missingPieces = !recommended && pieces.length !== outfit.garmentIds.length;
  return (
    <article className={`outfit-card${recommended ? " is-recommended" : ""}`}>
      {modeled ? <OptimizedImage className="outfit-modeled-image" src={modeled} alt={`${outfit.name} on model`} sizes="(max-width: 640px) 92vw, 440px" breakpoints={[320, 480, 640, 800]} /> : <FlatLay items={pieces} />}
      <div className="outfit-card__body">
        <div className="outfit-card__heading">
          <div>
            <p>{recommended ? "Colour recommendation" : "Your outfit"}</p>
            <h2>{outfit.name}</h2>
          </div>
          <ColourMarks items={pieces} />
        </div>
        <p className="outfit-card__reason">{outfit.reason || reasonFor(pieces)}</p>
        <p className="outfit-card__pieces">{pieces.map((item) => item.name).join(" · ")}</p>
        {missingPieces && <p className="outfit-card__error" role="alert">A piece in this saved outfit is no longer in your wardrobe.</p>}
        <div className="outfit-card__actions">
          {recommended ? <button className="secondary-button" type="button" onClick={() => onUse(outfit.garmentIds)}>Use this look</button> : <button className="delete-button" type="button" onClick={() => onDelete(outfit.id)}><Trash size={15} aria-hidden="true" /> Delete</button>}
          {missingPieces && <button className="secondary-button" type="button" onClick={() => onRebuild(outfit.garmentIds)}>Edit / rebuild</button>}
          {!modeled && !recommended && !missingPieces && <button className="primary-button" type="button" disabled={processing || !setupReady} onClick={() => onGenerate(outfit.id)}><Sparkle size={15} weight="fill" aria-hidden="true" /> {processing ? "Generating…" : "Generate on model"}</button>}
        </div>
        {recommended && <p className="outfit-card__note">Edit before saving.</p>}
        {!setupReady && !modeled && !recommended && <p className="outfit-card__note">Add your API key and model reference to enable on-model generation.</p>}
        {failed && <p className="outfit-card__error" role="alert">{outfit.generation.error}</p>}
      </div>
    </article>
  );
}

function OutfitBuilder({ items, initialIds, onClose, onCreated }) {
  const [selected, setSelected] = useState(initialIds || []);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selectionNotice, setSelectionNotice] = useState("");
  const selectedItems = items.filter((item) => selected.includes(item.id));
  const toggle = (id) => {
    const item = items.find((entry) => entry.id === id);
    if (!item) return;
    setError("");
    setSelected((current) => {
      if (current.includes(id)) { setSelectionNotice(""); return current.filter((value) => value !== id); }
      const replacedId = current.find((value) => items.find((entry) => entry.id === value)?.part === item.part);
      if (!replacedId) { setSelectionNotice(""); return [...current, id]; }
      const replaced = items.find((entry) => entry.id === replacedId);
      setSelectionNotice(`${replaced?.name || LABELS[item.part]} was replaced with ${item.name}. One ${LABELS[item.part] || "piece"} per outfit.`);
      return current.map((value) => value === replacedId ? id : value);
    });
  };
  const save = async () => {
    if (selected.length < 2) { setError("Choose at least two pieces for this outfit."); return; }
    setSaving(true); setError("");
    try {
      const response = await apiFetch("/api/outfits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, garmentIds: selected }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not save the outfit.");
      onCreated(result);
    } catch (requestError) { setError(requestError.message); }
    finally { setSaving(false); }
  };
  return (
    <section className="outfit-builder" aria-labelledby="build-outfit-title">
      <div className="outfit-builder__header"><div><p>Compose from your wardrobe</p><h2 id="build-outfit-title">Build an outfit</h2></div><button className="outfit-close" type="button" onClick={onClose} aria-label="Close outfit builder"><X size={20} /></button></div>
      <div className="outfit-builder__preview">{selectedItems.length ? <FlatLay items={selectedItems} compact /> : <p>Select two to five pieces. Their original clean product images will form the outfit card.</p>}</div>
      <p className="outfit-builder__help">Choose one top, bottom, shoes, and accessory, plus an optional layer. Selecting another piece in a slot replaces the first.</p>
      <label className="field outfit-name"><span>Name this look <em>Optional</em></span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Easy weekend blue" /></label>
      <div className="outfit-picker" aria-label="Select wardrobe pieces">
        {items.map((item) => <button key={item.id} type="button" className={selected.includes(item.id) ? "selected" : ""} onClick={() => toggle(item.id)} aria-pressed={selected.includes(item.id)}><span className="outfit-picker__image"><OptimizedImage src={item.thumbnail || item.image} alt="" sizes="76px" breakpoints={[80, 120]} /></span><span><strong>{item.name}</strong><small>{LABELS[item.part] || "Piece"}</small></span><i>{selected.includes(item.id) && <Check size={14} weight="bold" />}</i></button>)}
      </div>
      {selectionNotice && <p className="outfit-builder__notice" role="status">{selectionNotice}</p>}
      {error && <p className="outfit-card__error" role="alert">{error}</p>}
      <div className="outfit-builder__actions"><span>{selected.length}/5 pieces</span><button className="primary-button" type="button" disabled={saving || selected.length < 2} onClick={save}><Plus size={15} weight="bold" aria-hidden="true" /> {saving ? "Saving…" : "Create outfit"}</button></div>
    </section>
  );
}

function recommendations(items) {
  const tops = items.filter((item) => item.part === "upperbody" || item.part === "wholebody_up");
  const bottoms = items.filter((item) => item.part === "lowerbody");
  const shoes = items.filter((item) => item.part === "shoes");
  const companions = bottoms.length ? bottoms : shoes;
  return tops.flatMap((top) => companions.map((companion) => {
    const selected = [top, companion];
    if (shoes.length && companion.part !== "shoes") selected.push([...shoes].sort((a, b) => colourScore(top, b) - colourScore(top, a))[0]);
    return { id: `recommended-${selected.map((item) => item.id).join("-")}`, name: `${top.name} + ${companion.name}`, garmentIds: selected.map((item) => item.id), reason: reasonFor(selected), score: colourScore(top, companion) };
  })).sort((a, b) => b.score - a.score).slice(0, 3);
}

export function OutfitsPane({ items, setupReady, toggle, navigation, onReturnToWardrobe, onAddPiece }) {
  const [outfits, setOutfits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [building, setBuilding] = useState(false);
  const [draftIds, setDraftIds] = useState([]);
  const pieceMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const resolve = (outfit) => outfit.garmentIds.map((id) => pieceMap.get(id)).filter(Boolean);
  useEffect(() => {
    document.querySelector(".outfits-pane > .category-nav button.active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, []);
  const refresh = async () => {
    const response = await apiFetch("/api/outfits", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load outfits.");
    setOutfits(await response.json());
    setError("");
  };
  useEffect(() => { refresh().catch((requestError) => setError(requestError.message)).finally(() => setLoading(false)); }, []);
  useEffect(() => {
    if (!outfits.some((outfit) => outfit.generation?.status === "processing")) return undefined;
    const timer = window.setInterval(() => refresh().catch(() => {}), 2400);
    return () => window.clearInterval(timer);
  }, [outfits]);
  const useRecommendation = (ids) => { setDraftIds(ids); setBuilding(true); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const retryLoad = async () => {
    setRetrying(true);
    try { await refresh(); }
    catch (requestError) { setError(requestError.message || "Could not load outfits."); }
    finally { setRetrying(false); }
  };
  const generate = async (id) => {
    setError("");
    try {
      const response = await apiFetch(`/api/outfits/${id}/modeled`, { method: "POST" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not start the on-model image.");
      setOutfits((current) => current.map((outfit) => outfit.id === id ? result : outfit));
    } catch (requestError) { setError(requestError.message || "Could not start the on-model image."); }
  };
  const remove = async (id) => {
    setError("");
    try {
      const response = await apiFetch(`/api/outfits/${id}`, { method: "DELETE" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not delete the outfit.");
      setOutfits((current) => current.filter((outfit) => outfit.id !== id));
    } catch (requestError) { setError(requestError.message || "Could not delete the outfit."); }
  };
  const rebuild = (ids) => { setDraftIds(ids.filter((id) => pieceMap.has(id))); setBuilding(true); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const suggested = useMemo(() => recommendations(items), [items]);
  return <main className="outfits-pane">
    <header className="gallery-header outfits-header"><div className="gallery-meta-row"><div><p className="piece-count">{outfits.length} {outfits.length === 1 ? "outfit" : "outfits"}</p><p className="net-worth">Build looks from the pieces you already own.</p></div><div className="meta-actions"><button className="add-piece-button" type="button" onClick={() => items.length < 2 ? onAddPiece?.() : (setDraftIds([]), setBuilding(true))}><Plus size={14} weight="bold" /> {items.length < 2 ? "Add a piece" : "Build an outfit"}</button>{toggle}</div></div><button className="outfits-back" type="button" onClick={onReturnToWardrobe}>← Back to wardrobe</button></header>
    {navigation}
    {building && <OutfitBuilder items={items} initialIds={draftIds} onClose={() => setBuilding(false)} onCreated={(outfit) => { setOutfits((current) => [outfit, ...current]); setBuilding(false); }} />}
    {error && <div className="outfit-request-error" role="alert"><p>{error}</p><button className="secondary-button" type="button" onClick={retryLoad} disabled={retrying}>{retrying ? "Retrying…" : "Try again"}</button></div>}
    {!building && <section className="outfits-section" aria-labelledby="recommendations-title"><div className="outfits-section__intro"><p>Starting point</p><h1 id="recommendations-title">Colour-led recommendations</h1><span>Pairings are based on the colour information extracted from your actual pieces.</span></div>{suggested.length ? <div className="outfit-grid recommendations-grid">{suggested.map((outfit) => <OutfitCard key={outfit.id} outfit={outfit} pieces={resolve(outfit)} recommended setupReady={setupReady} onUse={useRecommendation} onGenerate={() => {}} onDelete={() => {}} />)}</div> : <div className="outfits-empty"><p>No recommendations yet. Add a top or layer and a bottom or shoes to see colour-led pairings.</p></div>}</section>}
    {!building && <section className="outfits-section your-outfits" aria-labelledby="your-outfits-title"><div className="outfits-section__intro"><p>Saved looks</p><h1 id="your-outfits-title">Your outfits</h1><span>Each card stays a crisp composition until you choose to see it on model.</span></div>{loading ? <p className="status">Loading outfits</p> : outfits.length ? <div className="outfit-grid saved-outfits-grid">{outfits.map((outfit) => <OutfitCard key={outfit.id} outfit={outfit} pieces={resolve(outfit)} setupReady={setupReady} onUse={useRecommendation} onGenerate={generate} onDelete={remove} onRebuild={rebuild} />)}</div> : items.length < 2 ? <div className="outfits-empty"><p>Add at least two pieces to your wardrobe before you build your first outfit.</p><button className="primary-button" type="button" onClick={() => onAddPiece?.()}><Plus size={15} weight="bold" /> Add a piece</button></div> : <div className="outfits-empty"><p>No saved outfits yet.</p><button className="primary-button" type="button" onClick={() => setBuilding(true)}><Plus size={15} weight="bold" /> Build your first outfit</button></div>}</section>}
  </main>;
}
