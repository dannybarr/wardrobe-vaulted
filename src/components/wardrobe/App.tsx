import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
} from "react";
import { Check, Plus, Sparkle, Trash, X } from "@phosphor-icons/react";
import { WardrobeImportFlow } from "./import-flow";
import { WishlistPane } from "./wishlist";
import { OutfitsPane } from "./outfits";
import { AddPieceModal, type DirectPiece } from "./add-piece";
import { OptimizedImage } from "./OptimizedImage";
import { ProfileBadge } from "./ProfileBadge.tsx";
import { OnboardingChecklist } from "./OnboardingChecklist.tsx";
import { apiFetch } from "../../lib/api-fetch";
import { askToSignUp } from "../../lib/demo/signup";
import type { WishlistPiece } from "../../lib/import/engine";
import { NetWorthHome } from "@/components/worth/NetWorthHome";
import { ShareCards } from "@/components/worth/ShareCards";
import { SellSheet } from "@/components/worth/SellSheet";
import { summariseWardrobe } from "@/lib/worth/summarise";
import { formatRange } from "@/lib/worth/format";
import type { Condition, ValueConfidence, WorthPiece } from "@/lib/worth/types";

const TYPES: Array<{ id: string; label: string; singular?: string }> = [
  { id: "all", label: "All" },
  { id: "upperbody", label: "Tops", singular: "Top" },
  { id: "wholebody_up", label: "Jackets", singular: "Jacket" },
  { id: "lowerbody", label: "Bottoms", singular: "Bottom" },
  { id: "accessories_up", label: "Accessories", singular: "Accessory" },
  { id: "shoes", label: "Shoes", singular: "Shoes" },
  { id: "bags", label: "Bags", singular: "Bag" },
  { id: "watches", label: "Watches", singular: "Watch" },
  { id: "jewellery", label: "Jewellery", singular: "Jewellery" },
];

const TYPE_MAP: Record<string, { id: string; label: string; singular?: string } | undefined> =
  Object.fromEntries(TYPES.map((type) => [type.id, type]));
const TYPE_ORDER: Record<string, number> = Object.fromEntries(
  TYPES.slice(1).map((type, index) => [type.id, index]),
);
const OCCASIONS = ["Work", "Casual", "Formal", "Night Out"];

type AppView = "worth" | "wardrobe" | "outfits" | "wishlist";
type ColorField = "primary" | "secondary";
type Rgb = { red: number; green: number; blue: number };
type Bucket = Rgb & { count: number };

type ItemDraft = {
  name: string;
  brand: string;
  occasion: string;
  part: string;
  color: string;
  secondaryColor: string | null;
  tags: string[];
  value: string;
};

function at(values: ArrayLike<number>, index: number): number {
  return values[index] ?? 0;
}

function isPiece(value: unknown): value is DirectPiece {
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

function piecesFrom(value: unknown): DirectPiece[] {
  return Array.isArray(value) ? value.filter(isPiece) : [];
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function isCondition(value: string | null | undefined): value is Condition {
  return value === "new_with_tags" || value === "like_new" || value === "good" || value === "fair";
}

function isConfidence(value: string | null | undefined): value is ValueConfidence {
  return value === "high" || value === "medium" || value === "low" || value === "unknown";
}

function toWorthPiece(item: DirectPiece): WorthPiece {
  const low =
    typeof item.valueLow === "number" && Number.isFinite(item.valueLow) ? item.valueLow : null;
  const high =
    typeof item.valueHigh === "number" && Number.isFinite(item.valueHigh) ? item.valueHigh : null;
  const priced = low !== null && high !== null;
  const confidence = isConfidence(item.valueConfidence) ? item.valueConfidence : null;
  return {
    id: item.id,
    name: item.name,
    part: item.part,
    brand: item.brand ?? "",
    size: item.size ?? null,
    condition: isCondition(item.condition) ? item.condition : null,
    colour: item.color ?? null,
    purchasePrice: typeof item.purchasePrice === "number" ? item.purchasePrice : null,
    purchaseDate: item.purchaseDate ?? null,
    valueLow: priced ? low : null,
    valueHigh: priced ? high : null,
    valueSource: item.valueSource ?? null,
    valueConfidence: priced ? confidence : "unknown",
    valueOverridden: priced ? Boolean(item.valueOverridden) : false,
    valuedAt: item.valuedAt ?? null,
    lastWornAt: item.lastWornAt ?? null,
    updatedAt: item.updatedAt ?? null,
    wearCount: typeof item.wearCount === "number" ? item.wearCount : 0,
    image: item.image ?? item.thumbnail ?? null,
  };
}

function moneyLabel(amount: number): string {
  return `£${amount.toLocaleString("en-GB", { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

function parseDraftValue(input: string): number | null {
  const numeric = Number((input || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric * 100) / 100 : null;
}

function normalizeBrand(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 80) : "";
}

function normalizeOccasion(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 80) : "";
}

async function saveItemToAccount(item: DirectPiece) {
  const response = await apiFetch(`/api/import/wardrobe/${item.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: item.name || "",
      brand: item.brand || "",
      occasion: item.occasion || "",
      part: item.part,
      color: item.color || null,
      secondaryColor: item.secondaryColor || null,
      tags: item.tags || [],
      value: typeof item.value === "number" && Number.isFinite(item.value) ? item.value : null,
    }),
  });
  if (!response.ok) throw new Error("Those changes could not be saved.");
}

function rgbToHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue].map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0")).join("")}`;
}

function colorDistance(first: Rgb, second: Rgb): number {
  return Math.sqrt(
    (first.red - second.red) ** 2 +
      (first.green - second.green) ** 2 +
      (first.blue - second.blue) ** 2,
  );
}

function extractPalette(image: HTMLImageElement): string[] {
  const canvas = document.createElement("canvas");
  canvas.width = 72;
  canvas.height = 72;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return [];
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const buckets = new Map<string, Bucket>();

  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = at(pixels, index + 3);
    if (alpha < 72) continue;

    const red = at(pixels, index);
    const green = at(pixels, index + 1);
    const blue = at(pixels, index + 2);
    const key = `${Math.round(red / 28)}-${Math.round(green / 28)}-${Math.round(blue / 28)}`;
    const current = buckets.get(key) ?? { red: 0, green: 0, blue: 0, count: 0 };
    current.red += red;
    current.green += green;
    current.blue += blue;
    current.count += 1;
    buckets.set(key, current);
  }

  const ranked = [...buckets.values()]
    .map((bucket) => ({
      red: Math.round(bucket.red / bucket.count),
      green: Math.round(bucket.green / bucket.count),
      blue: Math.round(bucket.blue / bucket.count),
      count: bucket.count,
    }))
    .sort((a, b) => b.count - a.count);

  const selected: Bucket[] = [];
  for (const color of ranked) {
    if (selected.every((existing) => colorDistance(existing, color) > 38)) selected.push(color);
    if (selected.length === 5) break;
  }

  return selected.map((color) => rgbToHex(color.red, color.green, color.blue));
}

function buildSamplingCanvas(image: HTMLImageElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  canvas.getContext("2d", { willReadFrequently: true })?.drawImage(image, 0, 0);
  return canvas;
}

function sampleImageColor(
  image: HTMLImageElement,
  canvas: HTMLCanvasElement,
  event: { clientX: number; clientY: number },
): string | null {
  const bounds = image.getBoundingClientRect();
  const scale = Math.min(bounds.width / image.naturalWidth, bounds.height / image.naturalHeight);
  const renderedWidth = image.naturalWidth * scale;
  const renderedHeight = image.naturalHeight * scale;
  const offsetX = (bounds.width - renderedWidth) / 2;
  const offsetY = (bounds.height - renderedHeight) / 2;
  const imageX = Math.floor((event.clientX - bounds.left - offsetX) / scale);
  const imageY = Math.floor((event.clientY - bounds.top - offsetY) / scale);

  if (imageX < 0 || imageY < 0 || imageX >= canvas.width || imageY >= canvas.height) return null;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  for (let radius = 0; radius <= 18; radius += 2) {
    const startX = Math.max(0, imageX - radius);
    const startY = Math.max(0, imageY - radius);
    const width = Math.min(canvas.width - startX, radius * 2 + 1);
    const height = Math.min(canvas.height - startY, radius * 2 + 1);
    const data = context.getImageData(startX, startY, width, height).data;
    for (let index = 0; index < data.length; index += 4) {
      if (at(data, index + 3) > 96)
        return rgbToHex(at(data, index), at(data, index + 1), at(data, index + 2));
    }
  }

  return null;
}

function GalleryItem({
  item,
  selected,
  onOpen,
}: {
  item: DirectPiece;
  selected: boolean;
  onOpen: (id: string) => void;
}) {
  const type = TYPE_MAP[item.part]?.singular || "wardrobe item";

  return (
    <button
      className={`gallery-item${selected ? " selected" : ""}`}
      type="button"
      onClick={() => onOpen(item.id)}
      aria-label={`View ${item.name || type}`}
      aria-pressed={selected}
      data-testid={`wardrobe-item-${item.id}`}
    >
      <OptimizedImage
        src={item.thumbnail || item.image}
        alt=""
        sizes="(max-width: 520px) calc(50vw - 16px), (max-width: 860px) calc(33vw - 18px), 180px"
        breakpoints={[120, 180, 240, 320, 480]}
      />
    </button>
  );
}

function TagEditor({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [input, setInput] = useState("");

  const addTag = () => {
    const nextTag = input.trim().replace(/^#/, "");
    if (!nextTag || tags.some((tag) => tag.toLowerCase() === nextTag.toLowerCase())) return;
    onChange([...tags, nextTag]);
    setInput("");
  };

  return (
    <div className="tag-editor">
      <div className="editable-tags">
        {tags.map((tag) => (
          <span className="editable-tag" key={tag}>
            {tag}
            <button
              type="button"
              onClick={() => onChange(tags.filter((existing) => existing !== tag))}
              aria-label={`Remove ${tag}`}
            >
              <X size={12} weight="regular" aria-hidden="true" />
            </button>
          </span>
        ))}
      </div>
      <div className="tag-input-row">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              addTag();
            }
          }}
          placeholder="Add a detail"
          aria-label="Add detail tag"
        />
        <button type="button" onClick={addTag} disabled={!input.trim()} aria-label="Add detail">
          <Plus size={15} weight="regular" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function ColorControl({
  label,
  field,
  value,
  palette,
  onChange,
  sampling,
  setSampling,
  optional = false,
  onClear,
  onAdd,
}: {
  label: string;
  field: ColorField;
  value: string | null;
  palette: string[];
  onChange: (color: string) => void;
  sampling: ColorField | null;
  setSampling: Dispatch<SetStateAction<ColorField | null>>;
  optional?: boolean;
  onClear?: () => void;
  onAdd?: () => void;
}) {
  if (optional && !value) {
    return (
      <div className="color-slot empty-color-slot">
        <div className="color-slot-heading">
          <span>{label}</span>
          <small>Optional</small>
        </div>
        <p>No distinct secondary color detected.</p>
        <button className="add-secondary-button" type="button" onClick={() => onAdd?.()}>
          Add secondary color
        </button>
      </div>
    );
  }

  return (
    <div className="color-slot">
      <div className="color-slot-heading">
        <span>{label}</span>
        {optional && (
          <button type="button" onClick={() => onClear?.()}>
            Remove
          </button>
        )}
      </div>
      <label className="selected-color-control">
        <input
          type="color"
          value={value || "#9a9286"}
          onChange={(event) => onChange(event.target.value)}
          aria-label={`Choose ${label.toLowerCase()}`}
        />
        <span className="selected-color-copy">
          <small>Selected</small>
          <strong>{value || "Custom"}</strong>
        </span>
      </label>
      <div className="suggestion-heading">
        <span>Image suggestions</span>
        <small>Click to apply</small>
      </div>
      <div className="palette" aria-label={`${label} suggestions from image`}>
        {palette.map((color) => (
          <button
            type="button"
            key={color}
            className={value?.toLowerCase() === color.toLowerCase() ? "active" : ""}
            style={{ backgroundColor: color }}
            onClick={() => onChange(color)}
            aria-label={`Use ${color} as ${label.toLowerCase()}`}
            title={color}
          />
        ))}
      </div>
      <button
        className={`sample-button${sampling === field ? " active" : ""}`}
        type="button"
        onClick={() => setSampling((current) => (current === field ? null : field))}
      >
        {sampling === field ? "Cancel picking" : `Pick ${label.toLowerCase()} from image`}
      </button>
    </div>
  );
}

function ItemEditor({
  draft,
  setDraft,
  palette,
  sampling,
  setSampling,
  sampleStatus,
}: {
  draft: ItemDraft;
  setDraft: Dispatch<SetStateAction<ItemDraft>>;
  palette: string[];
  sampling: ColorField | null;
  setSampling: Dispatch<SetStateAction<ColorField | null>>;
  sampleStatus: string;
}) {
  const suggestedSecondary =
    palette.find((color) => color.toLowerCase() !== draft.color.toLowerCase()) || "#9a9286";

  return (
    <div className="item-editor">
      <label className="field">
        <span>Name</span>
        <input
          value={draft.name}
          onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
          placeholder={TYPE_MAP[draft.part]?.singular || "Wardrobe item"}
        />
      </label>

      <label className="field">
        <span>Category</span>
        <select
          value={draft.part}
          onChange={(event) => setDraft((current) => ({ ...current, part: event.target.value }))}
        >
          {TYPES.slice(1).map((type) => (
            <option value={type.id} key={type.id}>
              {type.label}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Brand</span>
        <input
          value={draft.brand}
          onChange={(event) => setDraft((current) => ({ ...current, brand: event.target.value }))}
          placeholder="Add brand"
          autoComplete="organization"
        />
      </label>

      <label className="field">
        <span>Value (£)</span>
        <input
          inputMode="decimal"
          value={draft.value}
          onChange={(event) => setDraft((current) => ({ ...current, value: event.target.value }))}
          placeholder="120"
        />
      </label>

      <label className="field">
        <span>Occasion</span>
        <input
          value={draft.occasion}
          onChange={(event) =>
            setDraft((current) => ({ ...current, occasion: event.target.value }))
          }
          list="occasion-options"
          placeholder="Choose or add an occasion"
        />
        <datalist id="occasion-options">
          {OCCASIONS.map((occasion) => (
            <option value={occasion} key={occasion} />
          ))}
        </datalist>
      </label>

      <fieldset className="color-field">
        <legend>Colors</legend>
        <div className="colors-editor">
          <ColorControl
            label="Primary color"
            field="primary"
            value={draft.color}
            palette={palette}
            onChange={(color) => setDraft((current) => ({ ...current, color }))}
            sampling={sampling}
            setSampling={setSampling}
          />
          <ColorControl
            label="Secondary color"
            field="secondary"
            value={draft.secondaryColor}
            palette={palette}
            onChange={(secondaryColor) => setDraft((current) => ({ ...current, secondaryColor }))}
            sampling={sampling}
            setSampling={setSampling}
            optional
            onClear={() => setDraft((current) => ({ ...current, secondaryColor: null }))}
            onAdd={() =>
              setDraft((current) => ({ ...current, secondaryColor: suggestedSecondary }))
            }
          />
        </div>
        <p className="color-help" aria-live="polite">
          {sampling
            ? `Click anywhere on the garment to sample the ${sampling} color.`
            : sampleStatus ||
              "Primary colors come from the image. A secondary is suggested only when a distinct color has meaningful coverage."}
        </p>
      </fieldset>

      <div className="field details-field">
        <span>Details</span>
        <TagEditor
          tags={draft.tags}
          onChange={(tags) => setDraft((current) => ({ ...current, tags }))}
        />
      </div>
    </div>
  );
}

function draftFrom(item: DirectPiece): ItemDraft {
  return {
    name: item.name || "",
    brand: item.brand || "",
    occasion: item.occasion || "",
    part: item.part,
    color: item.color || "#9a9286",
    secondaryColor: item.secondaryColor || null,
    tags: [...(item.tags || [])],
    value: item.value != null ? String(item.value) : "",
  };
}

function ItemViewer({
  item,
  onClose,
  onSave,
  onDelete,
  onGenerateModel,
}: {
  item: DirectPiece;
  onClose: () => void;
  onSave: (item: DirectPiece) => void;
  onDelete: (id: string) => void;
  onGenerateModel?: (item: DirectPiece) => Promise<void>;
}) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const samplingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const shakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sampling, setSampling] = useState<ColorField | null>(null);
  const [sampleStatus, setSampleStatus] = useState("");
  const [palette, setPalette] = useState<string[]>(item.palette || []);
  const [draft, setDraft] = useState<ItemDraft>(draftFrom(item));
  const [shaking, setShaking] = useState(false);
  const [closeBlocked, setCloseBlocked] = useState(false);
  const [generatingModel, setGeneratingModel] = useState(false);
  const [modelError, setModelError] = useState("");
  const type = TYPE_MAP[item.part]?.singular || "Wardrobe item";
  const hasModeledImage = Boolean(item.modeledImage);
  const canGenerateModel = Boolean(item.canGenerateModeled && !hasModeledImage && onGenerateModel);
  const pieceRotation = useMemo(() => {
    const hash = [...item.id].reduce((total, character) => total + character.charCodeAt(0), 0);
    return `${(hash % 9) - 4}deg`;
  }, [item.id]);

  const isDirty = useMemo(() => {
    const normalizedTags = (tags: string[]) => tags.map((tag) => tag.trim()).filter(Boolean);
    return (
      JSON.stringify({
        name: draft.name.trim(),
        brand: normalizeBrand(draft.brand),
        occasion: normalizeOccasion(draft.occasion),
        part: draft.part,
        color: draft.color.toLowerCase() || null,
        secondaryColor: draft.secondaryColor?.toLowerCase() || null,
        tags: normalizedTags(draft.tags),
        value: parseDraftValue(draft.value),
      }) !==
      JSON.stringify({
        name: (item.name || "").trim(),
        brand: normalizeBrand(item.brand),
        occasion: normalizeOccasion(item.occasion),
        part: item.part,
        color: item.color?.toLowerCase() || null,
        secondaryColor: item.secondaryColor?.toLowerCase() || null,
        tags: normalizedTags(item.tags || []),
        value: typeof item.value === "number" && Number.isFinite(item.value) ? item.value : null,
      })
    );
  }, [draft, item]);

  const nudgeUnsaved = useCallback(() => {
    setCloseBlocked(true);
    setShaking(false);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setShaking(true));
    });
    if (shakeTimerRef.current !== null) clearTimeout(shakeTimerRef.current);
    shakeTimerRef.current = setTimeout(() => setShaking(false), 420);
  }, []);

  const requestClose = useCallback(() => {
    if (isDirty) nudgeUnsaved();
    else onClose();
  }, [isDirty, nudgeUnsaved, onClose]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (sampling) setSampling(null);
        else requestClose();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    document.body.classList.add("viewer-open");
    closeButtonRef.current?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("viewer-open");
      if (shakeTimerRef.current !== null) clearTimeout(shakeTimerRef.current);
    };
  }, [requestClose, sampling]);

  useEffect(() => {
    if (!isDirty) setCloseBlocked(false);
  }, [isDirty]);

  useEffect(() => {
    setSampling(null);
    setSampleStatus("");
    setPalette(item.palette || []);
    setDraft(draftFrom(item));
  }, [item]);

  const cancelEditing = () => {
    setDraft(draftFrom(item));
    setSampling(null);
    setSampleStatus("");
    onClose();
  };

  const saveEditing = () => {
    onSave({
      ...item,
      ...draft,
      name: draft.name.trim(),
      brand: normalizeBrand(draft.brand),
      occasion: normalizeOccasion(draft.occasion),
      tags: draft.tags.map((tag) => tag.trim()).filter(Boolean),
      value: parseDraftValue(draft.value),
    });
    setSampling(null);
    setSampleStatus("Changes saved.");
  };

  const generateModel = async () => {
    if (!canGenerateModel || generatingModel || !onGenerateModel) return;
    setGeneratingModel(true);
    setModelError("");
    try {
      await onGenerateModel(item);
    } catch (error: unknown) {
      setModelError(messageOf(error, "The on-model image could not be generated."));
    } finally {
      setGeneratingModel(false);
    }
  };

  const handleImageLoad = (event: { currentTarget: HTMLImageElement }) => {
    samplingCanvasRef.current = buildSamplingCanvas(event.currentTarget);
    const extracted = extractPalette(event.currentTarget);
    setPalette([...new Set([...(item.palette || []), ...extracted])].slice(0, 5));
  };

  const handleImageClick = (event: {
    currentTarget: HTMLImageElement;
    clientX: number;
    clientY: number;
  }) => {
    if (!sampling || !samplingCanvasRef.current) return;
    const color = sampleImageColor(event.currentTarget, samplingCanvasRef.current, event);
    if (!color) {
      setSampleStatus("That spot is transparent—try directly on the garment.");
      return;
    }
    setDraft((current) =>
      sampling === "secondary" ? { ...current, secondaryColor: color } : { ...current, color },
    );
    setPalette((current) =>
      [
        color,
        ...current.filter((existing) => existing.toLowerCase() !== color.toLowerCase()),
      ].slice(0, 5),
    );
    setSampleStatus(`Sampled ${color} as the ${sampling} color.`);
    setSampling(null);
  };

  const rotationStyle = { "--piece-rotation": pieceRotation } as CSSProperties & {
    "--piece-rotation"?: string;
  };
  const garmentArtwork = (
    <div
      className={`viewer-art${hasModeledImage ? " viewer-art-floating" : ""}${sampling ? " sampling" : ""}`}
      style={hasModeledImage ? rotationStyle : undefined}
    >
      <OptimizedImage
        ref={imageRef}
        src={item.image}
        alt={`Selected ${type.toLowerCase()}`}
        sizes="(max-width: 520px) 40vw, 300px"
        breakpoints={[160, 240, 320, 480, 640]}
        priority
        onLoad={handleImageLoad}
        onClick={handleImageClick}
      />
      {sampling && <span className="sample-hint">Click garment to sample</span>}
    </div>
  );

  return (
    <div
      className="viewer-overlay"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && requestClose()}
    >
      <div className="viewer-entry">
        <aside
          className={`viewer editing${hasModeledImage ? " has-modeled-image" : ""}${shaking ? " shake" : ""}`}
          role="dialog"
          aria-modal="true"
          aria-label="Selected wardrobe item"
        >
          <button
            className="viewer-icon-close"
            type="button"
            onClick={requestClose}
            aria-label="Close viewer"
            ref={closeButtonRef}
          >
            <X size={24} weight="light" aria-hidden="true" />
          </button>

          {hasModeledImage ? (
            <div className="modeled-hero">
              <OptimizedImage
                className="modeled-hero-photo"
                src={item.modeledImage}
                alt={`${draft.name || type} worn by a model`}
                sizes="(max-width: 860px) 100vw, 520px"
                breakpoints={[320, 480, 640, 800, 1040, 1280]}
                quality={82}
                priority
              />
              <div className="viewer-heading modeled-heading">
                <div>
                  <h2>{draft.name || TYPE_MAP[draft.part]?.singular}</h2>
                </div>
              </div>
              {garmentArtwork}
            </div>
          ) : (
            <>
              <div className="viewer-heading">
                <div>
                  <h2>{draft.name || TYPE_MAP[draft.part]?.singular}</h2>
                </div>
              </div>
              {garmentArtwork}
              {canGenerateModel && (
                <div className="viewer-model-request">
                  <button
                    className="secondary-button viewer-model-button"
                    type="button"
                    onClick={() => {
                      void generateModel();
                    }}
                    disabled={generatingModel}
                  >
                    <Sparkle size={16} weight="fill" aria-hidden="true" />{" "}
                    {generatingModel ? "Generating on model…" : "Generate on model"}
                  </button>
                  {modelError && (
                    <p className="viewer-model-error" role="alert">
                      {modelError}
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          <div className="viewer-details editing">
            <ItemEditor
              draft={draft}
              setDraft={setDraft}
              palette={palette}
              sampling={sampling}
              setSampling={setSampling}
              sampleStatus={sampleStatus}
            />

            {closeBlocked && (
              <p className="unsaved-notice" role="status">
                Save or cancel changes before closing.
              </p>
            )}

            <div className="viewer-actions">
              <button className="delete-button" type="button" onClick={() => onDelete(item.id)}>
                <Trash size={15} weight="regular" aria-hidden="true" /> Delete
              </button>
              <span className="action-spacer" />
              <button className="secondary-button" type="button" onClick={cancelEditing}>
                Cancel
              </button>
              <button className="primary-button" type="button" onClick={saveEditing}>
                <Check size={15} weight="bold" aria-hidden="true" /> Save
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function ViewToggle({ view, onChange }: { view: AppView; onChange: (next: AppView) => void }) {
  return (
    <>
      <nav className="view-toggle" aria-label="Worth and pieces">
        <button
          type="button"
          className={view === "worth" ? "active" : ""}
          aria-pressed={view === "worth"}
          onClick={() => onChange("worth")}
        >
          Worth
        </button>
        <button
          type="button"
          className={view === "wardrobe" ? "active" : ""}
          aria-pressed={view === "wardrobe"}
          onClick={() => onChange("wardrobe")}
        >
          Pieces
        </button>
      </nav>
      <nav className="view-toggle" aria-label="Looks and wishlist">
        <button
          type="button"
          className={view === "outfits" ? "active" : ""}
          aria-pressed={view === "outfits"}
          onClick={() => onChange("outfits")}
        >
          Looks
        </button>
        <button
          type="button"
          className={view === "wishlist" ? "active" : ""}
          aria-pressed={view === "wishlist"}
          onClick={() => onChange("wishlist")}
        >
          Wishlist
        </button>
      </nav>
    </>
  );
}

export type WardrobePreview = {
  pieces: DirectPiece[];
  outfits: Array<{
    id: string;
    name: string;
    garmentIds: string[];
    modeledImage?: string | null;
  }>;
  wishlist: WishlistPiece[];
};

export function WardrobeApp({ preview }: { preview?: WardrobePreview } = {}) {
  const readOnly = preview !== undefined;
  const [items, setItems] = useState<DirectPiece[]>(preview?.pieces ?? []);
  const [activeType, setActiveType] = useState("all");
  const [activeBrand, setActiveBrand] = useState("");
  const [activeOccasion, setActiveOccasion] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(!readOnly);
  const [error, setError] = useState("");
  const [view, setView] = useState<AppView>("worth");
  const [setupReady, setSetupReady] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [sellPieceId, setSellPieceId] = useState<string | null>(null);

  useEffect(() => {
    if (readOnly) return;
    apiFetch("/api/import/config", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return null;
        const config: unknown = await response.json();
        return config;
      })
      .then((config) => {
        const ready =
          typeof config === "object" &&
          config !== null &&
          "ready" in config &&
          Boolean(config.ready);
        setSetupReady(ready);
      })
      .catch(() => {});
  }, [readOnly]);

  useEffect(() => {
    if (readOnly) return;
    apiFetch("/api/import/wardrobe", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load the wardrobe.");
        const loaded: unknown = await response.json();
        return piecesFrom(loaded);
      })
      .then((loadedItems) => setItems(loadedItems))
      .catch((requestError: unknown) =>
        setError(messageOf(requestError, "Could not load the wardrobe.")),
      )
      .finally(() => setLoading(false));
  }, [readOnly]);

  const selectedItem = items.find((item) => item.id === selectedId) || null;
  const worthPieces = useMemo(() => items.map(toWorthPiece), [items]);
  const summary = useMemo(() => summariseWardrobe(worthPieces), [worthPieces]);
  const purchaseTotal = useMemo(
    () =>
      items.reduce(
        (total, item) =>
          total + (typeof item.value === "number" && Number.isFinite(item.value) ? item.value : 0),
        0,
      ),
    [items],
  );
  const badgeWorth = summary.pricedCount ? (summary.low + summary.high) / 2 : purchaseTotal;
  const worthLabel = summary.pricedCount
    ? formatRange(summary.low, summary.high)
    : moneyLabel(purchaseTotal);
  const sellPiece = worthPieces.find((piece) => piece.id === sellPieceId) ?? null;

  const brands = useMemo(() => {
    const uniqueBrands = new Map<string, string>();
    items.forEach((item) => {
      const brand = normalizeBrand(item.brand);
      if (brand && !uniqueBrands.has(brand.toLocaleLowerCase()))
        uniqueBrands.set(brand.toLocaleLowerCase(), brand);
    });
    return [...uniqueBrands.values()].sort((first, second) => first.localeCompare(second));
  }, [items]);

  const occasions = useMemo(() => {
    const uniqueOccasions = new Map<string, string>();
    items.forEach((item) => {
      const occasion = normalizeOccasion(item.occasion);
      if (occasion && !uniqueOccasions.has(occasion.toLocaleLowerCase()))
        uniqueOccasions.set(occasion.toLocaleLowerCase(), occasion);
    });
    return [...uniqueOccasions.values()].sort((first, second) => first.localeCompare(second));
  }, [items]);

  const visibleItems = useMemo(() => {
    const typeFiltered =
      activeType === "all" ? items : items.filter((item) => item.part === activeType);
    const filtered =
      activeType === "all"
        ? typeFiltered.filter(
            (item) =>
              (!activeBrand ||
                normalizeBrand(item.brand).toLocaleLowerCase() ===
                  activeBrand.toLocaleLowerCase()) &&
              (!activeOccasion ||
                normalizeOccasion(item.occasion).toLocaleLowerCase() ===
                  activeOccasion.toLocaleLowerCase()),
          )
        : typeFiltered;
    return [...filtered].sort((a, b) => {
      if (activeType === "all") {
        const typeDifference = (TYPE_ORDER[a.part] ?? 99) - (TYPE_ORDER[b.part] ?? 99);
        if (typeDifference) return typeDifference;
      }
      return a.id.localeCompare(b.id);
    });
  }, [activeBrand, activeOccasion, activeType, items]);

  const chooseType = (typeId: string) => {
    setView("wardrobe");
    setActiveType(typeId);
    if (typeId !== "all") {
      setActiveBrand("");
      setActiveOccasion("");
    }
    setSelectedId(null);
  };

  const saveItem = (updatedItem: DirectPiece) => {
    if (readOnly) {
      askToSignUp();
      return;
    }
    setItems((current) => current.map((item) => (item.id === updatedItem.id ? updatedItem : item)));
    saveItemToAccount(updatedItem).catch((saveError: unknown) =>
      setError(messageOf(saveError, "Those changes could not be saved.")),
    );
  };

  const deleteItem = async (id: string) => {
    if (readOnly) {
      askToSignUp();
      return;
    }
    try {
      const response = await apiFetch(`/api/import/wardrobe/${id}`, { method: "DELETE" });
      if (!response.ok && response.status !== 404) throw new Error("Could not delete that piece.");
    } catch (requestError: unknown) {
      setError(messageOf(requestError, "Could not delete that piece."));
      return;
    }
    setItems((current) => current.filter((item) => item.id !== id));
    setSelectedId(null);
  };

  const addImportedItem = useCallback((newItem: DirectPiece) => {
    setItems((current) =>
      current.some((item) => item.id === newItem.id) ? current : [...current, newItem],
    );
  }, []);

  const attachImportedModeledImage = useCallback((jobId: string, modeledImage: string) => {
    const id = `import-${jobId}`;
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, modeledImage } : item)),
    );
  }, []);

  const generateOnModel = useCallback(
    async (item: DirectPiece) => {
      if (readOnly) {
        askToSignUp();
        return;
      }
      const response = await apiFetch(`/api/import/wardrobe/${item.id}/modeled`, {
        method: "POST",
      });
      const result: unknown = await response.json().catch(() => ({}));
      const failure =
        typeof result === "object" &&
        result !== null &&
        "error" in result &&
        typeof result.error === "string"
          ? result.error
          : "The on-model image could not be created.";
      if (!response.ok) throw new Error(failure);
      const modeledImage =
        typeof result === "object" &&
        result !== null &&
        "modeledImage" in result &&
        typeof result.modeledImage === "string"
          ? result.modeledImage
          : null;
      if (!modeledImage) throw new Error(failure);
      setItems((current) =>
        current.map((entry) => (entry.id === item.id ? { ...entry, modeledImage } : entry)),
      );
    },
    [readOnly],
  );

  // Shown on every pane so a new member can pick up the next step from wherever
  // they are. It takes itself off screen once all three are done.
  const checklist = (
    <OnboardingChecklist
      pieceCount={items.length}
      ready={!loading}
      onUploadWardrobe={() => {
        setView("wardrobe");
        chooseType("all");
        setAddOpen(true);
      }}
      onCraftOutfit={() => setView("outfits")}
      onAddWishlist={() => setView("wishlist")}
    />
  );

  const outfitNavigation = (
    <nav className="category-nav" aria-label="Switch between wardrobe sections">
      {TYPES.map((type) => (
        <button
          key={type.id}
          type="button"
          className={view === "wardrobe" && activeType === type.id ? "active" : ""}
          onClick={() => chooseType(type.id)}
          aria-pressed={view === "wardrobe" && activeType === type.id}
        >
          {type.label}
        </button>
      ))}
    </nav>
  );

  if (view === "wishlist") {
    return (
      <div className="app-shell">
        <WishlistPane
          toggle={<ViewToggle view={view} onChange={setView} />}
          setupReady={setupReady}
          onPurchased={addImportedItem}
          readOnly={readOnly}
          onReadOnlyAction={askToSignUp}
          savedItems={preview?.wishlist}
        />
        {readOnly ? null : checklist}
      </div>
    );
  }

  return (
    <div className={`app-shell${view === "wardrobe" && selectedItem ? " has-selection" : ""}`}>
      {view === "worth" && (
        <main className="gallery-pane">
          <header className="gallery-header">
            <div className="gallery-meta-row">
              <div className="gallery-identity">
                <ProfileBadge netWorth={badgeWorth} pieces={items.length} readOnly={readOnly} />
                <p className="piece-count">
                  {items.length} {items.length === 1 ? "piece" : "pieces"}
                </p>
                <p className="net-worth">
                  Wardrobe value <strong>{worthLabel}</strong>
                </p>
              </div>
              <div className="meta-actions">
                <button
                  className="add-piece-button"
                  type="button"
                  onClick={() => (readOnly ? askToSignUp() : setAddOpen(true))}
                >
                  <Plus size={14} weight="bold" aria-hidden="true" /> Add piece
                </button>
                <ViewToggle view={view} onChange={setView} />
              </div>
            </div>
          </header>
          {error && <p className="status error">{error}</p>}
          {!error && loading && <p className="status">Loading wardrobe</p>}
          <NetWorthHome
            summary={summary}
            onOpenPiece={setSellPieceId}
            onShare={() => setShareOpen(true)}
          />
        </main>
      )}

      {view === "outfits" && (
        <OutfitsPane
          items={items}
          setupReady={setupReady}
          toggle={<ViewToggle view={view} onChange={setView} />}
          navigation={outfitNavigation}
          onReturnToWardrobe={() => chooseType("all")}
          onAddPiece={() => (readOnly ? askToSignUp() : setAddOpen(true))}
          readOnly={readOnly}
          onReadOnlyAction={askToSignUp}
          savedOutfits={preview?.outfits}
        />
      )}

      {view === "wardrobe" && (
        <main className="gallery-pane">
          <header className="gallery-header">
            <div className="gallery-meta-row">
              <div className="gallery-identity">
                <ProfileBadge netWorth={badgeWorth} pieces={items.length} readOnly={readOnly} />
                <p className="piece-count">
                  {items.length} {items.length === 1 ? "piece" : "pieces"}
                </p>
                <p className="net-worth">
                  Wardrobe value <strong>{worthLabel}</strong>
                </p>
              </div>

              <div className="meta-actions">
                <button
                  className="add-piece-button"
                  type="button"
                  onClick={() => (readOnly ? askToSignUp() : setAddOpen(true))}
                >
                  <Plus size={14} weight="bold" aria-hidden="true" /> Add piece
                </button>
                <ViewToggle view={view} onChange={setView} />
              </div>
            </div>
            <div className="gallery-filters">
              <nav className="category-nav" aria-label="Filter wardrobe by item type">
                {TYPES.map((type) => (
                  <button
                    key={type.id}
                    type="button"
                    className={activeType === type.id ? "active" : ""}
                    onClick={() => chooseType(type.id)}
                    aria-pressed={activeType === type.id}
                  >
                    {type.label}
                  </button>
                ))}
              </nav>
              {activeType === "all" && (
                <>
                  <label className="brand-filter">
                    <span>Brand</span>
                    <select
                      value={activeBrand}
                      onChange={(event) => setActiveBrand(event.target.value)}
                      aria-label="Filter wardrobe by brand"
                    >
                      <option value="">All brands</option>
                      {brands.map((brand) => (
                        <option value={brand} key={brand.toLocaleLowerCase()}>
                          {brand}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="brand-filter">
                    <span>Occasion</span>
                    <select
                      value={activeOccasion}
                      onChange={(event) => setActiveOccasion(event.target.value)}
                      aria-label="Filter wardrobe by occasion"
                    >
                      <option value="">All occasions</option>
                      {occasions.map((occasion) => (
                        <option value={occasion} key={occasion.toLocaleLowerCase()}>
                          {occasion}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>
          </header>

          {error && <p className="status error">{error}</p>}
          {!error && loading && <p className="status">Loading wardrobe</p>}
          {!error && !loading && !items.length && (
            <p className="status empty">Drop, paste, or add a photo to import your first piece.</p>
          )}

          {!!items.length && (
            <section
              className="gallery-grid"
              aria-label={`${TYPE_MAP[activeType]?.label || "All"} wardrobe items`}
            >
              {visibleItems.map((item) => (
                <GalleryItem
                  key={item.id}
                  item={item}
                  selected={selectedId === item.id}
                  onOpen={setSelectedId}
                />
              ))}
            </section>
          )}
        </main>
      )}

      {view === "wardrobe" && selectedItem && (
        <ItemViewer
          item={selectedItem}
          onClose={() => setSelectedId(null)}
          onSave={saveItem}
          onDelete={(id) => {
            void deleteItem(id);
          }}
          onGenerateModel={generateOnModel}
        />
      )}
      {view === "worth" && shareOpen && (
        <ShareCards summary={summary} onClose={() => setShareOpen(false)} />
      )}
      {view === "worth" && sellPiece && (
        <SellSheet piece={sellPiece} onClose={() => setSellPieceId(null)} />
      )}
      {readOnly ? null : (
        <>
          <AddPieceModal
            open={addOpen}
            setupReady={setupReady}
            onClose={() => setAddOpen(false)}
            onDirectAdded={addImportedItem}
          />
          <WardrobeImportFlow
            onGarmentApproved={addImportedItem}
            onModeledApproved={attachImportedModeledImage}
          />
          {checklist}
        </>
      )}
    </div>
  );
}
