/**
 * The wishlist, stored the same way the wardrobe is: rows in the database, image
 * files in the member's private storage folder, and short-lived signed links
 * handed to the UI. Items arrive either from a product link or from a photo that
 * has been through the same extraction pipeline the wardrobe uses.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { PRIVATE_BUCKET, signPaths } from "@/lib/api/wardrobe-payload";
import { decodeBase64Image } from "@/lib/api/pieces.server";

type Client = SupabaseClient<Database>;
type Row = Database["public"]["Tables"]["wishlist_items"]["Row"];
type ImageRow = Database["public"]["Tables"]["garment_images"]["Row"];

export const WISHLIST_PARTS = [
  "upperbody",
  "wholebody_up",
  "lowerbody",
  "accessories_up",
  "shoes",
] as const;

export type WishlistItem = {
  id: string;
  name: string;
  brand: string | null;
  price: string | null;
  part: string;
  url: string | null;
  note: string | null;
  color: string | null;
  tags: string[];
  status: string;
  image: string | null;
  modeledImage: string | null;
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  GBP: "£",
  EUR: "€",
  USD: "$",
  JPY: "¥",
  AUD: "A$",
  CAD: "C$",
};

function toItem(row: Row, images: ImageRow[], signed: Map<string, string>): WishlistItem {
  const linked = (id: string | null) => {
    if (!id) return null;
    const image = images.find((candidate) => candidate.id === id);
    return image ? (signed.get(image.storage_path) ?? null) : null;
  };

  return {
    id: row.id,
    name: row.name || "Wishlist piece",
    brand: row.brand,
    price: row.price,
    part: row.part && (WISHLIST_PARTS as readonly string[]).includes(row.part) ? row.part : "upperbody",
    url: row.url,
    note: row.note,
    color: row.color,
    tags: row.tags ?? [],
    status: row.status,
    image: linked(row.image_id),
    modeledImage: linked(row.modeled_image_id),
  };
}

async function hydrate(supabase: Client, rows: Row[]): Promise<WishlistItem[]> {
  const imageIds = rows.flatMap((row) => [row.image_id, row.modeled_image_id]).filter(Boolean) as string[];
  let images: ImageRow[] = [];
  if (imageIds.length) {
    const { data } = await supabase.from("garment_images").select("*").in("id", imageIds);
    images = data ?? [];
  }
  const signed = await signPaths(supabase, images.map((image) => image.storage_path));
  return rows.map((row) => toItem(row, images, signed));
}

export async function loadWishlist(supabase: Client): Promise<WishlistItem[]> {
  const { data, error } = await supabase
    .from("wishlist_items")
    .select("*")
    .order("added_at", { ascending: true });
  if (error) throw error;
  return hydrate(supabase, data ?? []);
}

export async function readWishlistItem(supabase: Client, id: string): Promise<WishlistItem> {
  const { data, error } = await supabase.from("wishlist_items").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error("That wishlist item no longer exists."), { status: 404 });
  const [item] = await hydrate(supabase, [data]);
  return item!;
}

/** Stores a wishlist image and points the row at it. */
export async function attachWishlistImage(
  supabase: Client,
  userId: string,
  itemId: string,
  base64: string,
  kind: "cutout" | "modeled",
): Promise<WishlistItem> {
  const { bytes, mime } = decodeBase64Image(base64);
  const extension = mime.includes("jpeg") || mime.includes("jpg") ? "jpg" : mime.includes("webp") ? "webp" : "png";
  const path = `${userId}/wishlist/${itemId}/${kind}-${Date.now()}.${extension}`;
  const { error: uploadError } = await supabase.storage.from(PRIVATE_BUCKET).upload(path, bytes, {
    contentType: mime,
    upsert: true,
  });
  if (uploadError) throw uploadError;

  const { data: image, error } = await supabase
    .from("garment_images")
    .insert({
      owner_id: userId,
      kind,
      bucket: PRIVATE_BUCKET,
      storage_path: path,
      byte_size: bytes.byteLength,
      is_current: true,
    })
    .select("*")
    .single();
  if (error) throw error;

  const patch =
    kind === "modeled" ? { modeled_image_id: image.id } : { image_id: image.id, status: "ready" as const };
  const { error: updateError } = await supabase.from("wishlist_items").update(patch).eq("id", itemId);
  if (updateError) throw updateError;

  return readWishlistItem(supabase, itemId);
}

export type WishlistDraft = {
  name?: string | null | undefined;
  brand?: string | null | undefined;
  price?: string | null | undefined;
  part?: string | null | undefined;
  url?: string | null | undefined;
  note?: string | null | undefined;
  color?: string | null | undefined;
  tags?: string[] | undefined;
};

export async function createWishlistItem(
  supabase: Client,
  userId: string,
  draft: WishlistDraft,
  status: Database["public"]["Enums"]["wishlist_status"] = "ready",
): Promise<WishlistItem> {
  const { data, error } = await supabase
    .from("wishlist_items")
    .insert({
      owner_id: userId,
      name: draft.name?.slice(0, 120) || "Wishlist piece",
      brand: draft.brand?.slice(0, 80) || null,
      price: draft.price?.slice(0, 40) || null,
      part: draft.part && (WISHLIST_PARTS as readonly string[]).includes(draft.part) ? draft.part : "upperbody",
      url: draft.url || null,
      note: draft.note || null,
      color: draft.color || null,
      tags: draft.tags ?? [],
      status,
    })
    .select("*")
    .single();
  if (error) throw error;
  const [item] = await hydrate(supabase, [data]);
  return item!;
}

export async function updateWishlistItem(
  supabase: Client,
  id: string,
  draft: WishlistDraft,
): Promise<WishlistItem> {
  const patch: Database["public"]["Tables"]["wishlist_items"]["Update"] = {};
  if (typeof draft.name === "string") patch.name = draft.name.trim().slice(0, 120) || "Wishlist piece";
  if (typeof draft.brand === "string") patch.brand = draft.brand.trim().slice(0, 80) || null;
  if (typeof draft.price === "string") patch.price = draft.price.trim().slice(0, 40) || null;
  if (draft.part && (WISHLIST_PARTS as readonly string[]).includes(draft.part)) patch.part = draft.part;
  if (typeof draft.url === "string" && /^https?:\/\//i.test(draft.url.trim())) patch.url = draft.url.trim();
  if (Array.isArray(draft.tags)) patch.tags = draft.tags.slice(0, 12);

  const { error } = await supabase.from("wishlist_items").update(patch).eq("id", id);
  if (error) throw error;
  return readWishlistItem(supabase, id);
}

export async function deleteWishlistItem(supabase: Client, id: string): Promise<void> {
  const { error } = await supabase.from("wishlist_items").delete().eq("id", id);
  if (error) throw error;
}

/* -------------------------------------------------------------------------- */
/* Product link reading — the original parser, without native dependencies.   */
/* -------------------------------------------------------------------------- */

function decodeEntities(value = "") {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function metaContent(html: string, property: string): string | null {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeEntities(match[1]);
  }
  return null;
}

function jsonLdProducts(html: string): Record<string, unknown>[] {
  const products: Record<string, unknown>[] = [];
  const scripts = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const match of scripts) {
    let parsed: unknown;
    try {
      parsed = JSON.parse((match[1] ?? "").trim());
    } catch {
      continue;
    }
    const queue = Array.isArray(parsed) ? [...parsed] : [parsed];
    while (queue.length) {
      const node = queue.shift() as Record<string, unknown> | null;
      if (!node || typeof node !== "object") continue;
      if (Array.isArray(node["@graph"])) queue.push(...(node["@graph"] as unknown[]));
      const type = node["@type"];
      if (type === "Product" || (Array.isArray(type) && type.includes("Product"))) products.push(node);
    }
  }
  return products;
}

function formatPrice(amount: unknown, currency: unknown): string | null {
  if (amount === null || amount === undefined || amount === "") return null;
  const numeric = Number(amount);
  const display = Number.isFinite(numeric)
    ? Number.isInteger(numeric)
      ? String(numeric)
      : numeric.toFixed(2)
    : String(amount);
  const code = String(currency || "").toUpperCase();
  if (CURRENCY_SYMBOLS[code]) return `${CURRENCY_SYMBOLS[code]}${display}`;
  return code ? `${display} ${code}` : display;
}

export function parseProductPage(html: string, pageUrl: string) {
  const product = jsonLdProducts(html)[0] ?? null;

  let name = product?.["name"] ? decodeEntities(String(product["name"])) : null;
  name =
    name ||
    metaContent(html, "og:title") ||
    decodeEntities((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "");
  name = (name || "").replace(/\s*[|–—-]\s*[^|–—-]{0,60}$/, "").trim() || name || "New wishlist piece";

  let brand: string | null = null;
  const rawBrand = product?.["brand"];
  if (typeof rawBrand === "string") brand = rawBrand;
  else if (rawBrand && typeof rawBrand === "object" && "name" in rawBrand) {
    brand = String((rawBrand as { name: unknown }).name);
  }
  brand = brand
    ? decodeEntities(brand)
    : (metaContent(html, "og:site_name") || new URL(pageUrl).hostname.replace(/^www\d?\./, ""));

  const offers = product?.["offers"];
  const offer = (Array.isArray(offers) ? offers[0] : offers) as
    | { price?: unknown; lowPrice?: unknown; priceCurrency?: unknown }
    | undefined;
  let price = offer ? formatPrice(offer.price ?? offer.lowPrice, offer.priceCurrency) : null;
  if (!price) {
    price = formatPrice(
      metaContent(html, "product:price:amount") || metaContent(html, "og:price:amount"),
      metaContent(html, "product:price:currency") || metaContent(html, "og:price:currency"),
    );
  }

  let imageUrl: string | null = null;
  const rawImage = product?.["image"];
  if (typeof rawImage === "string") imageUrl = rawImage;
  else if (Array.isArray(rawImage) && rawImage.length) {
    imageUrl = typeof rawImage[0] === "string" ? rawImage[0] : ((rawImage[0] as { url?: string })?.url ?? null);
  } else if (rawImage && typeof rawImage === "object" && "url" in rawImage) {
    imageUrl = String((rawImage as { url: unknown }).url);
  }
  imageUrl = imageUrl || metaContent(html, "og:image") || metaContent(html, "twitter:image");
  if (imageUrl) {
    try {
      imageUrl = new URL(decodeEntities(imageUrl), pageUrl).toString();
    } catch {
      imageUrl = null;
    }
  }

  return { name: name.slice(0, 120), brand: brand ? brand.slice(0, 80) : null, price, imageUrl };
}

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export async function fetchProductDetails(url: string) {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": BROWSER_UA, Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
    });
    if (!response.ok) return null;
    const html = await response.text();
    return parseProductPage(html, url);
  } catch {
    return null;
  }
}

/** Downloads the product photo the page advertised, as base64. */
export async function fetchRemoteImage(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { headers: { "User-Agent": BROWSER_UA }, redirect: "follow" });
    if (!response.ok) return null;
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (!buffer.length || buffer.length > 12_000_000) return null;
    let binary = "";
    const chunk = 0x8000;
    for (let index = 0; index < buffer.length; index += chunk) {
      binary += String.fromCharCode(...buffer.subarray(index, index + chunk));
    }
    return btoa(binary);
  } catch {
    return null;
  }
}
