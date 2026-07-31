import { createFileRoute } from "@tanstack/react-router";
import { withUser, json } from "@/lib/api/request-context";
import { loadWardrobe } from "@/lib/api/wardrobe-payload";

/** The caller's wardrobe, with private image links valid for one hour. */
export const Route = createFileRoute("/api/import/wardrobe")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        withUser(request, async ({ supabase }) => json(await loadWardrobe(supabase))),
    },
  },
});
