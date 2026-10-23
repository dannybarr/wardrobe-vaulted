/**
 * Copies the public founder catalogue into one real account.
 *
 * Required environment variables (never committed):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   FOUNDER_EMAIL
 *
 * The script looks up that auth user and inserts library items, outfits and
 * wishlist rows they do not already have. A re-run does not insert duplicates.
 * It does not delete or rewrite rows, and it does not change is_founder or
 * any other privilege. The account wardrobe stays private (is_demo = false).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { founderOutfits, founderPieces, founderWishlist } from "../src/lib/demo/founder.ts";
import { planImports, type OwnedRow } from "../src/lib/demo/founder-plan.ts";

const BUCKET = "wardrobe-private";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function required(name: string): string {
  const value = process.env[name]?.trim() ?? "";
  if (!value) {
    console.error(`Set ${name} before running this script.`);
    process.exit(1);
  }
  return value;
}

function rowsOf(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (row): row is Record<string, unknown> => typeof row === "object" && row !== null,
  );
}

function text(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  return typeof value === "string" ? value : null;
}

function ownedFrom(value: unknown, imageIds: ReadonlySet<string>): OwnedRow[] {
  return rowsOf(value).flatMap((row) => {
    const id = text(row, "id");
    const name = text(row, "name") ?? "";
    if (!id) return [];
    return [
      {
        id,
        legacyId: text(row, "legacy_id"),
        name,
        hasImage: imageIds.has(id) || text(row, "image_id") !== null,
      },
    ];
  });
}

function isUniqueViolation(error: { code?: string; message?: string }): boolean {
  return error.code === "23505" || /duplicate key/i.test(error.message ?? "");
}

function storageAlreadyThere(message: string): boolean {
  return /already exists|duplicate/i.test(message);
}

async function findUserId(supabase: SupabaseClient, email: string): Promise<string> {
  const target = email.toLowerCase();
  for (let page = 1; page <= 50; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error("The auth user list could not be read.");
    const match = data.users.find((user) => user.email?.trim().toLowerCase() === target);
    if (match) return match.id;
    if (data.users.length < 200) break;
  }
  console.error(
    "No auth user matches FOUNDER_EMAIL. Create that account, then run the script again.",
  );
  process.exit(1);
}

async function wardrobeId(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from("wardrobes")
    .select("id, is_primary, is_demo")
    .eq("owner_id", userId);
  if (error) throw new Error("The account wardrobe could not be read.");
  const wardrobes = rowsOf(data);
  const usable = wardrobes.filter((row) => row["is_demo"] !== true);
  const primary = usable.find((row) => row["is_primary"] === true) ?? usable[0];
  const existing = primary ? text(primary, "id") : null;
  if (existing) return existing;

  const { data: created, error: insertError } = await supabase
    .from("wardrobes")
    .insert({
      owner_id: userId,
      name: "My wardrobe",
      is_primary: true,
      is_demo: false,
    })
    .select("id")
    .single();
  if (insertError) throw new Error("A private wardrobe could not be created.");
  const id = text(rowsOf([created])[0] ?? {}, "id");
  if (!id) throw new Error("A private wardrobe could not be created.");
  return id;
}

async function putSvg(
  supabase: SupabaseClient,
  storagePath: string,
  fileName: string,
): Promise<void> {
  const bytes = readFileSync(join(root, "public", "demo", "library", fileName));
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: "image/svg+xml",
    upsert: false,
  });
  if (error && !storageAlreadyThere(error.message)) {
    throw new Error("A catalogue image could not be stored.");
  }
}

async function ensureGarmentImage(
  supabase: SupabaseClient,
  userId: string,
  garmentId: string,
  kind: "cutout" | "thumbnail" | "modeled",
  fileName: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("garment_images")
    .select("id")
    .eq("garment_id", garmentId)
    .eq("kind", kind)
    .limit(1);
  if (error) throw new Error("Existing images could not be read.");
  if (rowsOf(data).length) return false;

  const storagePath = `${userId}/pieces/${garmentId}/${kind}.svg`;
  await putSvg(supabase, storagePath, fileName);
  const bytes = readFileSync(join(root, "public", "demo", "library", fileName));
  const { error: insertError } = await supabase.from("garment_images").insert({
    owner_id: userId,
    garment_id: garmentId,
    kind,
    bucket: BUCKET,
    storage_path: storagePath,
    byte_size: bytes.byteLength,
    is_current: true,
  });
  if (insertError && !isUniqueViolation(insertError)) {
    throw new Error("An image row could not be saved.");
  }
  return !insertError;
}

async function attachPieceImages(
  supabase: SupabaseClient,
  userId: string,
  garmentId: string,
  piece: (typeof founderPieces)[number],
): Promise<number> {
  const fileName = piece.image?.split("/").pop();
  if (!fileName) return 0;
  let wrote = 0;
  if (await ensureGarmentImage(supabase, userId, garmentId, "cutout", fileName)) wrote += 1;
  if (await ensureGarmentImage(supabase, userId, garmentId, "thumbnail", fileName)) wrote += 1;
  const modeled = piece.modeledImage?.split("/").pop();
  if (modeled && (await ensureGarmentImage(supabase, userId, garmentId, "modeled", modeled))) {
    wrote += 1;
  }
  return wrote;
}

async function main(): Promise<void> {
  const url = required("SUPABASE_URL");
  const serviceKey = required("SUPABASE_SERVICE_ROLE_KEY");
  const email = required("FOUNDER_EMAIL");
  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const userId = await findUserId(supabase, email);
  const wardrobe = await wardrobeId(supabase, userId);

  const [{ data: garments, error: garmentError }, { data: images, error: imageError }] =
    await Promise.all([
      supabase
        .from("garments")
        .select("id, legacy_id, name")
        .eq("owner_id", userId)
        .is("deleted_at", null),
      supabase.from("garment_images").select("garment_id").eq("owner_id", userId),
    ]);
  if (garmentError || imageError) throw new Error("Existing pieces could not be read.");
  const imageIds = new Set(
    rowsOf(images)
      .map((row) => text(row, "garment_id"))
      .filter((id): id is string => Boolean(id)),
  );
  const garmentPlan = planImports(ownedFrom(garments, imageIds), founderPieces);
  const garmentIds = new Map<string, string>();
  let garmentsInserted = 0;
  let garmentsKept = 0;
  let imagesWritten = 0;

  for (const action of garmentPlan) {
    const piece = founderPieces.find((item) => item.id === action.founderId);
    if (!piece) continue;
    if (action.kind === "keep") {
      garmentsKept += 1;
      garmentIds.set(action.founderId, action.existingId);
      if (action.attachImage) {
        imagesWritten += await attachPieceImages(supabase, userId, action.existingId, piece);
      }
      continue;
    }

    const low = typeof piece.valueLow === "number" ? piece.valueLow : null;
    const high = typeof piece.valueHigh === "number" ? piece.valueHigh : null;
    const priced = low !== null && high !== null;
    const { data, error } = await supabase
      .from("garments")
      .insert({
        owner_id: userId,
        wardrobe_id: wardrobe,
        legacy_id: piece.id,
        name: piece.name,
        part: piece.part,
        brand: piece.brand || null,
        color: piece.color ?? null,
        secondary_color: piece.secondaryColor ?? null,
        palette: piece.palette ?? [],
        tags: piece.tags ?? [],
        source: "import",
        currency: "GBP",
        value_low: low,
        value_high: high,
        value_source: priced ? "market_band" : null,
        value_confidence: priced ? (piece.valueConfidence ?? "low") : "unknown",
        estimated_resale_value: priced ? Math.round(((low + high) / 2) * 100) / 100 : null,
        valued_at: priced ? new Date().toISOString() : null,
        value_overridden: false,
      })
      .select("id")
      .single();
    if (error) {
      if (!isUniqueViolation(error)) throw new Error("A piece could not be saved.");
      const { data: existing, error: readError } = await supabase
        .from("garments")
        .select("id")
        .eq("owner_id", userId)
        .eq("legacy_id", piece.id)
        .maybeSingle();
      if (readError) throw new Error("A piece could not be saved.");
      const existingId = text(rowsOf([existing])[0] ?? {}, "id");
      if (existingId) garmentIds.set(piece.id, existingId);
      garmentsKept += 1;
      continue;
    }
    const id = text(rowsOf([data])[0] ?? {}, "id");
    if (!id) throw new Error("A piece could not be saved.");
    garmentsInserted += 1;
    garmentIds.set(piece.id, id);
    imagesWritten += await attachPieceImages(supabase, userId, id, piece);
  }

  const { data: outfits, error: outfitError } = await supabase
    .from("outfits")
    .select("id, legacy_id, name")
    .eq("owner_id", userId);
  if (outfitError) throw new Error("Existing outfits could not be read.");
  const outfitPlan = planImports(ownedFrom(outfits, new Set()), founderOutfits);
  let outfitsInserted = 0;
  let outfitsKept = 0;
  for (const action of outfitPlan) {
    const outfit = founderOutfits.find((item) => item.id === action.founderId);
    if (!outfit) continue;
    if (action.kind === "keep") {
      outfitsKept += 1;
      continue;
    }
    const { data, error } = await supabase
      .from("outfits")
      .insert({
        owner_id: userId,
        wardrobe_id: wardrobe,
        legacy_id: outfit.id,
        name: outfit.name,
        colors: outfit.colors,
      })
      .select("id")
      .single();
    if (error) {
      if (!isUniqueViolation(error)) throw new Error("An outfit could not be saved.");
      outfitsKept += 1;
      continue;
    }
    const outfitId = text(rowsOf([data])[0] ?? {}, "id");
    if (!outfitId) throw new Error("An outfit could not be saved.");
    const links = outfit.garmentIds.flatMap((founderId, position) => {
      const garmentId = garmentIds.get(founderId);
      if (!garmentId) return [];
      return [{ outfit_id: outfitId, garment_id: garmentId, owner_id: userId, position }];
    });
    if (links.length) {
      const { error: linkError } = await supabase.from("outfit_garments").insert(links);
      if (linkError && !isUniqueViolation(linkError)) {
        throw new Error("Outfit pieces could not be linked.");
      }
    }
    outfitsInserted += 1;
  }

  const { data: wishes, error: wishError } = await supabase
    .from("wishlist_items")
    .select("id, legacy_id, name, image_id")
    .eq("owner_id", userId);
  if (wishError) throw new Error("The wishlist could not be read.");
  const wishPlan = planImports(ownedFrom(wishes, new Set()), founderWishlist);
  let wishlistInserted = 0;
  let wishlistKept = 0;
  for (const action of wishPlan) {
    const item = founderWishlist.find((entry) => entry.id === action.founderId);
    if (!item) continue;
    if (action.kind === "keep") {
      wishlistKept += 1;
      if (action.attachImage) {
        imagesWritten += await attachWishlistImage(supabase, userId, action.existingId, item);
      }
      continue;
    }
    const { data, error } = await supabase
      .from("wishlist_items")
      .insert({
        owner_id: userId,
        wardrobe_id: wardrobe,
        legacy_id: item.id,
        url: item.url,
        name: item.name,
        brand: item.brand,
        price: item.price,
        part: item.part,
        tags: [],
        status: "ready",
        added_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error) {
      if (!isUniqueViolation(error)) throw new Error("A wishlist item could not be saved.");
      wishlistKept += 1;
      continue;
    }
    const id = text(rowsOf([data])[0] ?? {}, "id");
    if (!id) throw new Error("A wishlist item could not be saved.");
    wishlistInserted += 1;
    imagesWritten += await attachWishlistImage(supabase, userId, id, item);
  }

  console.log("Founder import finished.");
  console.log(`Pieces: ${garmentsInserted} added, ${garmentsKept} already there.`);
  console.log(`Outfits: ${outfitsInserted} added, ${outfitsKept} already there.`);
  console.log(`Wishlist: ${wishlistInserted} added, ${wishlistKept} already there.`);
  console.log(`Images stored: ${imagesWritten}.`);
}

async function attachWishlistImage(
  supabase: SupabaseClient,
  userId: string,
  itemId: string,
  item: (typeof founderWishlist)[number],
): Promise<number> {
  const fileName = item.image?.split("/").pop();
  if (!fileName) return 0;
  const { data: current, error: readError } = await supabase
    .from("wishlist_items")
    .select("image_id")
    .eq("id", itemId)
    .maybeSingle();
  if (readError) throw new Error("The wishlist image could not be read.");
  if (text(rowsOf([current])[0] ?? {}, "image_id")) return 0;

  const storagePath = `${userId}/wishlist/${itemId}/cutout.svg`;
  await putSvg(supabase, storagePath, fileName);
  const bytes = readFileSync(join(root, "public", "demo", "library", fileName));
  const { data: image, error } = await supabase
    .from("garment_images")
    .insert({
      owner_id: userId,
      kind: "cutout",
      bucket: BUCKET,
      storage_path: storagePath,
      byte_size: bytes.byteLength,
      is_current: true,
    })
    .select("id")
    .single();
  if (error) throw new Error("A wishlist image could not be saved.");
  const imageId = text(rowsOf([image])[0] ?? {}, "id");
  if (!imageId) throw new Error("A wishlist image could not be saved.");
  const { error: updateError } = await supabase
    .from("wishlist_items")
    .update({ image_id: imageId })
    .eq("id", itemId)
    .is("image_id", null);
  if (updateError) throw new Error("A wishlist image could not be attached.");
  return 1;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "The import failed.";
  console.error(message);
  process.exit(1);
});
