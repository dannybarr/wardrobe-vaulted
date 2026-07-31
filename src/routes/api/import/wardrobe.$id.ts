import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { withUser, json } from "@/lib/api/request-context";
import { findGarment } from "@/lib/api/wardrobe-payload";

const EditSchema = z.object({
  name: z.string().trim().max(160).optional(),
  brand: z.string().trim().max(80).optional(),
  occasion: z.string().trim().max(80).optional(),
  part: z.enum(["upperbody", "wholebody_up", "lowerbody", "accessories_up", "shoes"]).optional(),
  color: z.string().trim().max(9).nullable().optional(),
  secondaryColor: z.string().trim().max(9).nullable().optional(),
  tags: z.array(z.string().trim().max(40)).max(24).optional(),
  value: z.number().min(0).max(1_000_000).nullable().optional(),
});

/**
 * Edits and removals for a single piece. Replaces the original browser-only
 * storage, so changes now follow the account across devices.
 */
export const Route = createFileRoute("/api/import/wardrobe/$id")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) =>
        withUser(request, async ({ supabase }) => {
          const parsed = EditSchema.safeParse(await request.json());
          if (!parsed.success) return json({ error: "Those details couldn't be saved." }, 400);

          const garment = await findGarment(supabase, params.id);
          if (!garment) return json({ error: "That piece no longer exists." }, 404);

          const edit = parsed.data;
          const { error } = await supabase
            .from("garments")
            .update({
              ...(edit.name !== undefined ? { name: edit.name || "Untitled piece" } : {}),
              ...(edit.brand !== undefined ? { brand: edit.brand || null } : {}),
              ...(edit.occasion !== undefined ? { occasion: edit.occasion || null } : {}),
              ...(edit.part !== undefined ? { part: edit.part } : {}),
              ...(edit.color !== undefined ? { color: edit.color } : {}),
              ...(edit.secondaryColor !== undefined ? { secondary_color: edit.secondaryColor } : {}),
              ...(edit.tags !== undefined ? { tags: edit.tags } : {}),
              ...(edit.value !== undefined ? { value_amount: edit.value } : {}),
              updated_at: new Date().toISOString(),
            })
            .eq("id", garment.id);
          if (error) throw error;

          return json({ ok: true });
        }),

      DELETE: async ({ request, params }) =>
        withUser(request, async ({ supabase }) => {
          const garment = await findGarment(supabase, params.id);
          if (!garment) return json({ error: "That piece no longer exists." }, 404);

          const { error } = await supabase
            .from("garments")
            .update({ deleted_at: new Date().toISOString() })
            .eq("id", garment.id);
          if (error) throw error;

          return json({ ok: true });
        }),
    },
  },
});
