import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { withUser, json } from "@/lib/api/request-context";
import { findGarment } from "@/lib/api/wardrobe-payload";

const EditSchema = z.object({
  name: z.string().trim().max(160).optional(),
  brand: z.string().trim().max(80).optional(),
  occasion: z.string().trim().max(80).optional(),
  part: z
    .enum([
      "upperbody",
      "wholebody_up",
      "lowerbody",
      "accessories_up",
      "shoes",
      "bags",
      "watches",
      "jewellery",
    ])
    .optional(),
  color: z.string().trim().max(9).nullable().optional(),
  secondaryColor: z.string().trim().max(9).nullable().optional(),
  tags: z.array(z.string().trim().max(40)).max(24).optional(),
  value: z.number().min(0).max(1_000_000).nullable().optional(),
  size: z.string().trim().max(40).nullable().optional(),
  condition: z.enum(["new_with_tags", "like_new", "good", "fair"]).nullable().optional(),
  purchasePrice: z.number().min(0).max(1_000_000).nullable().optional(),
  purchaseDate: z.string().trim().max(10).nullable().optional(),
  valueLow: z.number().min(0).max(1_000_000).nullable().optional(),
  valueHigh: z.number().min(0).max(1_000_000).nullable().optional(),
  lastWornAt: z.string().trim().max(40).nullable().optional(),
  wearCount: z.number().int().min(0).max(100000).optional(),
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
              ...(edit.secondaryColor !== undefined
                ? { secondary_color: edit.secondaryColor }
                : {}),
              ...(edit.tags !== undefined ? { tags: edit.tags } : {}),
              ...(edit.value !== undefined ? { value_amount: edit.value } : {}),
              ...(edit.size !== undefined ? { size_label: edit.size } : {}),
              ...(edit.condition !== undefined ? { condition: edit.condition } : {}),
              ...(edit.purchasePrice !== undefined ? { purchase_price: edit.purchasePrice } : {}),
              ...(edit.purchaseDate !== undefined ? { purchase_date: edit.purchaseDate } : {}),
              ...(edit.lastWornAt !== undefined ? { last_worn_at: edit.lastWornAt } : {}),
              ...(edit.wearCount !== undefined ? { wear_count: edit.wearCount } : {}),
              ...(edit.valueLow !== undefined || edit.valueHigh !== undefined
                ? {
                    value_low: edit.valueLow ?? edit.valueHigh ?? null,
                    value_high: edit.valueHigh ?? edit.valueLow ?? null,
                    value_source: "user",
                    value_confidence: "high",
                    value_overridden: true,
                    valued_at: new Date().toISOString(),
                    estimated_resale_value:
                      edit.valueLow !== undefined && edit.valueHigh !== undefined
                        ? (Number(edit.valueLow) + Number(edit.valueHigh)) / 2
                        : (edit.valueLow ?? edit.valueHigh ?? null),
                  }
                : {}),
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
