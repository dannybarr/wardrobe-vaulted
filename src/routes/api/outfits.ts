import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { json, withUser } from "@/lib/api/request-context";
import { createOutfit, loadOutfits } from "@/lib/api/outfits.server";

const OutfitSchema = z.object({
  name: z.string().trim().max(80).optional().default(""),
  garmentIds: z.array(z.string().trim().min(1).max(120)).min(2).max(5),
});

/** The member's saved looks: read them all, or compose a new one. */
export const Route = createFileRoute("/api/outfits")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        withUser(request, async ({ supabase }) => json(await loadOutfits(supabase))),

      POST: async ({ request }) =>
        withUser(request, async ({ supabase, user }) => {
          const parsed = OutfitSchema.safeParse(await request.json().catch(() => ({})));
          if (!parsed.success) return json({ error: "Choose between two and five pieces." }, 400);

          try {
            const outfit = await createOutfit(supabase, user.id, {
              name: parsed.data.name,
              garmentIds: parsed.data.garmentIds,
            });
            return json(outfit, 201);
          } catch (caught) {
            const error = caught as Error & { status?: number };
            return json({ error: error.message || "Could not save the outfit." }, error.status ?? 500);
          }
        }),
    },
  },
});
