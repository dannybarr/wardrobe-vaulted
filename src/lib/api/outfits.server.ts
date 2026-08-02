/**
 * Outfits: saved looks composed from pieces the member already owns.
 *
 * The UI speaks in the same shape the original app used — an id, a name, the
 * pieces it contains and an optional on-model photograph — so this module maps
 * the database rows into that shape and back again.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { PRIVATE_BUCKET, signPaths } from "@/lib/api/wardrobe-payload";

type Client = SupabaseClient<Database>;

export type OutfitPayload = {
  id: string;
  name: string;
  garmentIds: string[];
  colors: string[];
  modeledImage: string | null;
  generation: { status: string; error?: string } | null;
  createdAt: string;
};

const HEX = /^#[0-9a-f]{6}$/i;

/** The id the wardrobe UI uses for a piece: its legacy id when it has one. */
function publicId(row: { id: string; legacy_id: string | null }) {
  return row.legacy_id ?? row.id;
}

export function cleanOutfitName(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 80) : "";
}

function colorsFor(garments: Array<{ color: string | null; secondary_color: string | null; palette: unknown }>) {
  const all: string[] = [];
  for (const garment of garments) {
    const palette = Array.isArray(garment.palette) ? (garment.palette as unknown[]) : [];
    for (const value of [garment.color, garment.secondary_color, ...palette]) {
      if (typeof value === "string" && HEX.test(value) && !all.includes(value)) all.push(value);
    }
  }
  return all.slice(0, 8);
}

/** Resolves the UI's piece ids to the caller's own garment rows, in order. */
export async function resolveGarments(supabase: Client, ids: string[]) {
  const { data, error } = await supabase
    .from("garments")
    .select("id, legacy_id, name, part, color, secondary_color, palette")
    .is("deleted_at", null);
  if (error) throw error;

  const byPublicId = new Map((data ?? []).map((row) => [publicId(row), row]));
  return ids.map((id) => byPublicId.get(id)).filter(Boolean) as NonNullable<
    (typeof data)[number]
  >[];
}

async function toPayload(
  supabase: Client,
  outfit: Database["public"]["Tables"]["outfits"]["Row"],
  members: Array<{ garment_id: string; position: number }>,
  garments: Array<{ id: string; legacy_id: string | null }>,
  signed: Map<string, string>,
  modeledPath: string | null,
): Promise<OutfitPayload> {
  void supabase;
  const byId = new Map(garments.map((row) => [row.id, row]));
  const garmentIds = [...members]
    .sort((a, b) => a.position - b.position)
    .map((member) => byId.get(member.garment_id))
    .filter(Boolean)
    .map((row) => publicId(row!));

  return {
    id: outfit.id,
    name: outfit.name,
    garmentIds,
    colors: Array.isArray(outfit.colors) ? (outfit.colors as string[]) : [],
    modeledImage: modeledPath ? (signed.get(modeledPath) ?? null) : null,
    generation: null,
    createdAt: outfit.created_at,
  };
}

/** Every saved look belonging to the caller, newest first. */
export async function loadOutfits(supabase: Client): Promise<OutfitPayload[]> {
  const { data: outfits, error } = await supabase
    .from("outfits")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  if (!outfits?.length) return [];

  const ids = outfits.map((outfit) => outfit.id);
  const [{ data: members }, { data: garments }] = await Promise.all([
    supabase.from("outfit_garments").select("outfit_id, garment_id, position").in("outfit_id", ids),
    supabase.from("garments").select("id, legacy_id").is("deleted_at", null),
  ]);

  const modeledIds = outfits
    .map((outfit) => outfit.modeled_image_id)
    .filter((value): value is string => Boolean(value));

  const { data: images } = modeledIds.length
    ? await supabase.from("garment_images").select("id, storage_path").in("id", modeledIds)
    : { data: [] as Array<{ id: string; storage_path: string }> };

  const pathById = new Map((images ?? []).map((image) => [image.id, image.storage_path]));
  const signed = await signPaths(supabase, [...pathById.values()]);

  return Promise.all(
    outfits.map((outfit) =>
      toPayload(
        supabase,
        outfit,
        (members ?? []).filter((member) => member.outfit_id === outfit.id),
        garments ?? [],
        signed,
        outfit.modeled_image_id ? (pathById.get(outfit.modeled_image_id) ?? null) : null,
      ),
    ),
  );
}

/** Saves a new look from two to five pieces the member owns. */
export async function createOutfit(
  supabase: Client,
  userId: string,
  input: { name: string; garmentIds: string[] },
): Promise<OutfitPayload> {
  const garments = await resolveGarments(supabase, input.garmentIds);
  if (garments.length < 2) throw Object.assign(new Error("Choose at least two pieces you own."), { status: 400 });

  const wardrobeId = await outfitWardrobeId(supabase, userId);
  const name =
    cleanOutfitName(input.name) ||
    `${garments[0]?.name ?? "New"} + ${garments[1]?.name ?? "look"}`.slice(0, 80);

  const { data: outfit, error } = await supabase
    .from("outfits")
    .insert({
      owner_id: userId,
      wardrobe_id: wardrobeId,
      name,
      colors: colorsFor(garments),
    })
    .select("*")
    .single();
  if (error) throw error;

  const { error: memberError } = await supabase.from("outfit_garments").insert(
    garments.map((garment, index) => ({
      outfit_id: outfit.id,
      garment_id: garment.id,
      owner_id: userId,
      position: index,
    })),
  );
  if (memberError) throw memberError;

  return toPayload(
    supabase,
    outfit,
    garments.map((garment, index) => ({ garment_id: garment.id, position: index })),
    garments,
    new Map(),
    null,
  );
}

async function outfitWardrobeId(supabase: Client, userId: string): Promise<string> {
  const { data } = await supabase
    .from("wardrobes")
    .select("id, is_primary")
    .eq("owner_id", userId)
    .order("is_primary", { ascending: false })
    .limit(1);

  const existing = data?.[0]?.id;
  if (existing) return existing;

  const { data: created, error } = await supabase
    .from("wardrobes")
    .insert({ owner_id: userId, name: "My wardrobe", is_primary: true })
    .select("id")
    .single();
  if (error) throw error;
  return created.id;
}

export async function readOutfit(supabase: Client, id: string) {
  const { data, error } = await supabase.from("outfits").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function deleteOutfit(supabase: Client, id: string) {
  const { error } = await supabase.from("outfits").delete().eq("id", id);
  if (error) throw error;
}

/** The cutouts of the pieces in a look, ready to hand to the image model. */
export async function readOutfitPieces(supabase: Client, outfitId: string) {
  const { data: members } = await supabase
    .from("outfit_garments")
    .select("garment_id, position")
    .eq("outfit_id", outfitId)
    .order("position", { ascending: true });

  const garmentIds = (members ?? []).map((member) => member.garment_id);
  if (!garmentIds.length) return [];

  const { data: images } = await supabase
    .from("garment_images")
    .select("garment_id, bucket, storage_path, kind, is_current")
    .in("garment_id", garmentIds)
    .eq("kind", "cutout")
    .eq("is_current", true);

  return garmentIds
    .map((garmentId) => (images ?? []).find((image) => image.garment_id === garmentId))
    .filter(Boolean)
    .map((image) => ({
      bucket: image!.bucket || PRIVATE_BUCKET,
      path: image!.storage_path,
    }));
}

/** Files a freshly generated on-model image against the look. */
export async function attachOutfitModeled(
  supabase: Client,
  userId: string,
  outfitId: string,
  storagePath: string,
  byteSize: number,
): Promise<string> {
  const { data: image, error } = await supabase
    .from("garment_images")
    .insert({
      owner_id: userId,
      kind: "modeled",
      bucket: PRIVATE_BUCKET,
      storage_path: storagePath,
      byte_size: byteSize,
      is_current: true,
    })
    .select("id, storage_path")
    .single();
  if (error) throw error;

  const { error: updateError } = await supabase
    .from("outfits")
    .update({ modeled_image_id: image.id })
    .eq("id", outfitId);
  if (updateError) throw updateError;

  const signed = await signPaths(supabase, [image.storage_path]);
  return signed.get(image.storage_path) ?? "";
}
