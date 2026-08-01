import { createFileRoute } from "@tanstack/react-router";
import { json, withUser } from "@/lib/api/request-context";
import { deleteWishlistItem, updateWishlistItem } from "@/lib/api/wishlist.server";

export const Route = createFileRoute("/api/wishlist/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) =>
        withUser(request, async ({ supabase }) => {
          const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
          const item = await updateWishlistItem(supabase, params.id, {
            name: typeof body["name"] === "string" ? body["name"] : undefined,
            brand: typeof body["brand"] === "string" ? body["brand"] : undefined,
            price: typeof body["price"] === "string" ? body["price"] : undefined,
            part: typeof body["part"] === "string" ? body["part"] : undefined,
            url: typeof body["url"] === "string" ? body["url"] : undefined,
          });
          return json(item);
        }),

      DELETE: async ({ request, params }) =>
        withUser(request, async ({ supabase }) => {
          await deleteWishlistItem(supabase, params.id);
          return json({ ok: true });
        }),
    },
  },
});
