import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { PRIVATE_BUCKET } from "@/lib/api/wardrobe-payload";

/** A copy of the wardrobe the member can download. Secrets and card details are left out. */
export const exportMyData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [profile, garments, outfits, wishlist] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, email, display_name, created_at, marketing_opt_in")
        .eq("id", userId)
        .maybeSingle(),
      supabase.from("garments").select("*").eq("owner_id", userId),
      supabase.from("outfits").select("*").eq("owner_id", userId),
      supabase.from("wishlist_items").select("*").eq("owner_id", userId),
    ]);

    return {
      exportedAt: new Date().toISOString(),
      profile: profile.data,
      garments: garments.data ?? [],
      outfits: outfits.data ?? [],
      wishlist: wishlist.data ?? [],
    };
  });

/** Deletes the account, its private photos, and the rows that hang off it. */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { confirmation?: string }) => {
    if (data.confirmation !== "DELETE") throw new Error("Type DELETE to confirm.");
    return data;
  })
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: images } = await supabaseAdmin
      .from("garment_images")
      .select("storage_path")
      .eq("owner_id", context.userId);
    const paths = (images ?? []).map((image) => image.storage_path).filter(Boolean);
    if (paths.length) await supabaseAdmin.storage.from(PRIVATE_BUCKET).remove(paths);

    const { error } = await supabaseAdmin.auth.admin.deleteUser(context.userId);
    if (error)
      throw new Error("The account could not be deleted. Email support and we will do it by hand.");
    return { ok: true as const };
  });
