import { createFileRoute } from "@tanstack/react-router";
import { json, withUser } from "@/lib/api/request-context";
import { requireVaultCapacity } from "@/lib/api/vault-gate";
import { persistPiece } from "@/lib/api/pieces.server";
import { environmentFromRequest } from "@/lib/api/import-support";
import {
  deleteWishlistItem,
  readWishlistImageBase64,
  readWishlistItem,
} from "@/lib/api/wishlist.server";

/** "I bought it": the wishlist piece becomes a real piece in the wardrobe. */
export const Route = createFileRoute("/api/wishlist/$id/purchase")({
  server: {
    handlers: {
      POST: async ({ request, params }) =>
        withUser(request, async ({ supabase, user }) => {
          const item = await readWishlistItem(supabase, params.id);
          const image = await readWishlistImageBase64(supabase, params.id);
          if (!image) return json({ error: "Add a product image before moving this over." }, 409);

          const gate = await requireVaultCapacity(
            supabase,
            user.id,
            environmentFromRequest(request),
          );
          if (!gate.ok) return gate.response;

          const record = await persistPiece(supabase, user.id, {
            name: item.name,
            part: item.part,
            brand: item.brand,
            color: item.color,
            secondaryColor: null,
            tags: item.tags,
            value: null,
            cutout: `data:${image.mime};base64,${image.base64}`,
          });

          await deleteWishlistItem(supabase, params.id);
          return json({ record });
        }),
    },
  },
});
