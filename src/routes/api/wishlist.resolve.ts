import { createFileRoute } from "@tanstack/react-router";
import { json, withUser } from "@/lib/api/request-context";
import {
  attachWishlistImage,
  createWishlistItem,
  fetchProductDetails,
  fetchRemoteImage,
  loadWishlist,
} from "@/lib/api/wishlist.server";

/** Reads a product link and files what it advertises as a wishlist item. */
export const Route = createFileRoute("/api/wishlist/resolve")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        withUser(request, async ({ supabase, user }) => {
          const body = (await request.json().catch(() => ({}))) as { url?: string };
          const url = (body.url || "").trim();
          if (!/^https?:\/\//i.test(url)) return json({ error: "Please paste a full product link." }, 400);

          const existing = await loadWishlist(supabase);
          const duplicate = existing.find((item) => item.url === url);
          if (duplicate) return json({ item: duplicate, duplicate: true });

          const details = await fetchProductDetails(url);
          const item = await createWishlistItem(
            supabase,
            user.id,
            {
              name: details?.name || "New wishlist piece",
              brand: details?.brand ?? null,
              price: details?.price ?? null,
              url,
              note: details
                ? null
                : "This site blocked automatic fetching. Add the product details yourself.",
            },
            "pending",
          );

          const remote = details?.imageUrl ? await fetchRemoteImage(details.imageUrl) : null;
          if (!remote) return json({ item: { ...item, status: "needs-image" }, duplicate: false }, 201);

          const withImage = await attachWishlistImage(
            supabase,
            user.id,
            item.id,
            `data:image/jpeg;base64,${remote}`,
            "cutout",
          );
          return json({ item: withImage, duplicate: false }, 201);
        }),
    },
  },
});
