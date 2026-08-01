import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { json, withUser } from "@/lib/api/request-context";
import {
  attachWishlistImage,
  createWishlistItem,
  loadWishlist,
  WISHLIST_PARTS,
} from "@/lib/api/wishlist.server";

const CreateSchema = z.object({
  name: z.string().trim().max(160).optional(),
  brand: z.string().trim().max(80).nullable().optional(),
  price: z.string().trim().max(40).nullable().optional(),
  part: z.enum(WISHLIST_PARTS).default("upperbody"),
  url: z.string().trim().max(2000).nullable().optional(),
  color: z.string().trim().max(9).nullable().optional(),
  tags: z.array(z.string().trim().max(40)).max(12).default([]),
  imageDataUrl: z.string().min(32).optional(),
});

/**
 * The member's wishlist. A POST creates an item directly — used when a photo has
 * been through the wardrobe's extraction pipeline in the browser and the finished
 * cut-out is being filed as something the member wants rather than owns.
 */
export const Route = createFileRoute("/api/wishlist")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        withUser(request, async ({ supabase }) => json(await loadWishlist(supabase))),

      POST: async ({ request }) =>
        withUser(request, async ({ supabase, user }) => {
          const parsed = CreateSchema.safeParse(await request.json().catch(() => ({})));
          if (!parsed.success) return json({ error: "That wishlist item could not be read." }, 400);
          const { imageDataUrl, ...draft } = parsed.data;

          let item = await createWishlistItem(
            supabase,
            user.id,
            draft,
            imageDataUrl ? "ready" : "pending",
          );
          if (imageDataUrl) {
            item = await attachWishlistImage(supabase, user.id, item.id, imageDataUrl, "cutout");
          }
          return json(item, 201);
        }),
    },
  },
});
