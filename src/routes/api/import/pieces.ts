import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { json, withUser } from "@/lib/api/request-context";
import { requireVaultCapacity } from "@/lib/api/vault-gate";
import { persistPiece } from "@/lib/api/pieces.server";
import { environmentFromRequest } from "@/lib/api/import-support";

const PieceSchema = z.object({
  name: z.string().trim().max(160).default("New piece"),
  part: z.enum(["upperbody", "wholebody_up", "lowerbody", "accessories_up", "shoes"]),
  color: z.string().trim().max(9).nullable().default(null),
  secondaryColor: z.string().trim().max(9).nullable().default(null),
  tags: z.array(z.string().trim().max(40)).max(24).default([]),
  value: z.number().min(0).max(1_000_000).nullable().default(null),
  cutout: z.string().min(32),
  modeled: z.string().min(32).nullable().optional(),
  importJobId: z.string().trim().max(64).nullable().optional(),
});

/**
 * The final step of an import: the approved piece is stored in the member's own
 * private folder and wardrobe. Nothing reaches this route until the member has
 * seen and approved the images.
 */
export const Route = createFileRoute("/api/import/pieces")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        withUser(request, async ({ supabase, user }) => {
          const capacity = await requireVaultCapacity(supabase, user.id, environmentFromRequest(request));
          if (!capacity.ok) return capacity.response;

          const parsed = PieceSchema.safeParse(await request.json().catch(() => ({})));
          if (!parsed.success) return json({ error: "That piece couldn't be saved." }, 400);

          const item = await persistPiece(supabase, user.id, {
            ...parsed.data,
            modeled: parsed.data.modeled ?? null,
            importJobId: parsed.data.importJobId ?? null,
          });

          return json({ item }, 201);
        }),
    },
  },
});
