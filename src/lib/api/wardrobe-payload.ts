import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export const PRIVATE_BUCKET = "wardrobe-private";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

type GarmentRow = Database["public"]["Tables"]["garments"]["Row"];
type ImageRow = Database["public"]["Tables"]["garment_images"]["Row"];
type Client = ReturnType<typeof createClient<Database>>;

export type WardrobeItem = {
  id: string;
  name: string;
  part: string;
  brand: string;
  occasion: string;
  value: number | null;
  color: string | null;
  secondaryColor: string | null;
  palette: string[];
  tags: string[];
  image: string | null;
  thumbnail: string | null;
  modeledImage: string | null;
  importJobId: string | null;
};

/** Short-lived private links, one signing round-trip for the whole wardrobe. */
export async function signPaths(supabase: Client, paths: string[]) {
  const unique = [...new Set(paths.filter(Boolean))];
  const signed = new Map<string, string>();
  if (!unique.length) return signed;

  const { data, error } = await supabase.storage
    .from(PRIVATE_BUCKET)
    .createSignedUrls(unique, SIGNED_URL_TTL_SECONDS);
  if (error) throw error;

  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) signed.set(entry.path, entry.signedUrl);
  }
  return signed;
}

export function toWardrobeItem(
  garment: GarmentRow,
  images: ImageRow[],
  signed: Map<string, string>,
): WardrobeItem {
  const pick = (kind: string) => {
    const match = images.find((image) => image.kind === kind && image.is_current);
    return match ? (signed.get(match.storage_path) ?? null) : null;
  };

  const cutout = pick("cutout");
  return {
    id: garment.legacy_id ?? garment.id,
    name: garment.name,
    part: garment.part,
    brand: garment.brand ?? "",
    occasion: garment.occasion ?? "",
    value: garment.value_amount === null ? null : Number(garment.value_amount),
    color: garment.color,
    secondaryColor: garment.secondary_color,
    palette: Array.isArray(garment.palette) ? (garment.palette as string[]) : [],
    tags: garment.tags ?? [],
    image: cutout,
    thumbnail: pick("thumbnail") ?? cutout,
    modeledImage: pick("modeled"),
    importJobId: garment.legacy_id?.startsWith("import-")
      ? garment.legacy_id.slice("import-".length)
      : null,
  };
}

/** Loads the caller's wardrobe in the shape the existing UI already speaks. */
export async function loadWardrobe(supabase: Client): Promise<WardrobeItem[]> {
  const { data: garments, error } = await supabase
    .from("garments")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) throw error;
  if (!garments?.length) return [];

  const { data: images, error: imageError } = await supabase
    .from("garment_images")
    .select("*")
    .in(
      "garment_id",
      garments.map((garment) => garment.id),
    );
  if (imageError) throw imageError;

  const signed = await signPaths(supabase, (images ?? []).map((image) => image.storage_path));

  return garments.map((garment) =>
    toWardrobeItem(
      garment,
      (images ?? []).filter((image) => image.garment_id === garment.id),
      signed,
    ),
  );
}

/** Resolves a UI-facing id (legacy or uuid) to the caller's garment row. */
export async function findGarment(supabase: Client, publicId: string) {
  const isUuid = /^[0-9a-f-]{36}$/i.test(publicId);
  const query = supabase.from("garments").select("*").is("deleted_at", null);
  const { data, error } = isUuid
    ? await query.eq("id", publicId).maybeSingle()
    : await query.eq("legacy_id", publicId).maybeSingle();
  if (error) throw error;
  return data;
}
