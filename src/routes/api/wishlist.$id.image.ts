import { createFileRoute } from "@tanstack/react-router";
import { json, withUser } from "@/lib/api/request-context";
import { attachWishlistImage } from "@/lib/api/wishlist.server";

/** The member supplying the product photo themselves, when the site blocked us. */
export const Route = createFileRoute("/api/wishlist/$id/image")({
  server: {
    handlers: {
      POST: async ({ request, params }) =>
        withUser(request, async ({ supabase, user }) => {
          const body = (await request.json().catch(() => ({}))) as { imageDataUrl?: string };
          if (typeof body.imageDataUrl !== "string" || body.imageDataUrl.length < 32) {
            return json({ error: "Please choose an image." }, 400);
          }
          if (body.imageDataUrl.length > 14_000_000) {
            return json({ error: "That image is too large. Please try a smaller one." }, 413);
          }
          return json(
            await attachWishlistImage(supabase, user.id, params.id, body.imageDataUrl, "cutout"),
          );
        }),
    },
  },
});
