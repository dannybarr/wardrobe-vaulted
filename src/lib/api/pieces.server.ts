/**
 * Saving a finished piece: the image files go to the member's private storage
 * folder, the details go to the database, and the caller gets back the same shape
 * the wardrobe UI already speaks, with private links valid for the hour.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { PRIVATE_BUCKET, signPaths, toWardrobeItem, type WardrobeItem } from "@/lib/api/wardrobe-payload";

type Client = SupabaseClient<Database>;

export function decodeBase64Image(input: string): { bytes: Uint8Array; mime: string } {
  const match = input.match(/^data:([^;]+);base64,(.+)$/s);
  const mime = match?.[1] ?? "image/png";
  const encoded = match?.[2] ?? input;
  const binary = atob(encoded.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  if (!bytes.length) throw new Error("That image was empty.");
  return { bytes, mime };
}

async function uploadPng(supabase: Client, path: string, base64: string) {
  const { bytes } = decodeBase64Image(base64);
  const { error } = await supabase.storage.from(PRIVATE_BUCKET).upload(path, bytes, {
    contentType: "image/png",
    upsert: true,
  });
  if (error) throw error;
  return { path, byteSize: bytes.byteLength };
}

async function primaryWardrobeId(supabase: Client, userId: string): Promise<string> {
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

export type PieceInput = {
  name: string;
  part: string;
  color: string | null;
  secondaryColor: string | null;
  tags: string[];
  value: number | null;
  brand?: string | null;
  cutout: string;
  modeled?: string | null;
  importJobId?: string | null;
};

/** Creates the piece, its cutout, and its on-model image if one was approved. */
export async function persistPiece(
  supabase: Client,
  userId: string,
  input: PieceInput,
): Promise<WardrobeItem> {
  const wardrobeId = await primaryWardrobeId(supabase, userId);
  const legacyId = input.importJobId ? `import-${input.importJobId}` : null;

  const { data: garment, error } = await supabase
    .from("garments")
    .insert({
      owner_id: userId,
      wardrobe_id: wardrobeId,
      legacy_id: legacyId,
      name: input.name || "New piece",
      part: input.part,
      brand: input.brand ?? null,
      color: input.color,
      secondary_color: input.secondaryColor,
      palette: [input.color, input.secondaryColor].filter(Boolean),
      tags: input.tags,
      value_amount: input.value,
      source: "import",
    })
    .select("*")
    .single();
  if (error) throw error;

  const images: Database["public"]["Tables"]["garment_images"]["Insert"][] = [];
  const cutout = await uploadPng(supabase, `${userId}/pieces/${garment.id}/cutout.png`, input.cutout);
  images.push({
    owner_id: userId,
    garment_id: garment.id,
    kind: "cutout",
    bucket: PRIVATE_BUCKET,
    storage_path: cutout.path,
    byte_size: cutout.byteSize,
    is_current: true,
  });

  if (input.modeled) {
    const modeled = await uploadPng(supabase, `${userId}/pieces/${garment.id}/modeled.png`, input.modeled);
    images.push({
      owner_id: userId,
      garment_id: garment.id,
      kind: "modeled",
      bucket: PRIVATE_BUCKET,
      storage_path: modeled.path,
      byte_size: modeled.byteSize,
      is_current: true,
    });
  }

  const { data: rows, error: imageError } = await supabase.from("garment_images").insert(images).select("*");
  if (imageError) throw imageError;

  const signed = await signPaths(supabase, (rows ?? []).map((row) => row.storage_path));
  return toWardrobeItem(garment, rows ?? [], signed);
}

/** Attaches a freshly generated on-model image to a piece that already exists. */
export async function attachModeledImage(
  supabase: Client,
  userId: string,
  garmentId: string,
  base64: string,
): Promise<string> {
  const upload = await uploadPng(supabase, `${userId}/pieces/${garmentId}/modeled.png`, base64);

  await supabase
    .from("garment_images")
    .update({ is_current: false })
    .eq("garment_id", garmentId)
    .eq("kind", "modeled");

  const { error } = await supabase.from("garment_images").insert({
    owner_id: userId,
    garment_id: garmentId,
    kind: "modeled",
    bucket: PRIVATE_BUCKET,
    storage_path: upload.path,
    byte_size: upload.byteSize,
    is_current: true,
  });
  if (error) throw error;

  const signed = await signPaths(supabase, [upload.path]);
  return signed.get(upload.path) ?? "";
}

/** The member's own photo, used as the person in on-model images. */
export async function readModelReference(
  supabase: Client,
  userId: string,
): Promise<{ base64: string; mime: string } | null> {
  const { data } = await supabase
    .from("model_profiles")
    .select("bucket, storage_path, is_default")
    .eq("owner_id", userId)
    .order("is_default", { ascending: false })
    .limit(1);

  const profile = data?.[0];
  if (!profile) return null;

  const { data: file, error } = await supabase.storage.from(profile.bucket).download(profile.storage_path);
  if (error || !file) return null;

  const buffer = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (const byte of buffer) binary += String.fromCharCode(byte);
  return { base64: btoa(binary), mime: file.type || "image/png" };
}

/** Reads a stored image back out as base64, for a follow-up AI stage. */
export async function readImageAsBase64(
  supabase: Client,
  bucket: string,
  path: string,
): Promise<string | null> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) return null;
  const buffer = new Uint8Array(await data.arrayBuffer());
  let binary = "";
  for (const byte of buffer) binary += String.fromCharCode(byte);
  return btoa(binary);
}
