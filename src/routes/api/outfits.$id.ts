import { createFileRoute } from "@tanstack/react-router";
import { json, withUser } from "@/lib/api/request-context";
import { deleteOutfit, readOutfit } from "@/lib/api/outfits.server";

/** Removing a saved look. The pieces themselves stay in the wardrobe. */
export const Route = createFileRoute("/api/outfits/$id")({
  server: {
    handlers: {
      DELETE: async ({ request, params }) =>
        withUser(request, async ({ supabase }) => {
          const outfit = await readOutfit(supabase, params.id);
          if (!outfit) return json({ error: "That outfit is no longer saved." }, 404);
          await deleteOutfit(supabase, params.id);
          return json({ ok: true });
        }),
    },
  },
});
