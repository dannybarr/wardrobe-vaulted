import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { json, withUser } from "@/lib/api/request-context";
import { requireVaultCapacity } from "@/lib/api/vault-gate";
import { persistPiece } from "@/lib/api/pieces.server";
import { environmentFromRequest } from "@/lib/api/import-support";

const DirectAddSchema = z.object({
  imageDataUrl: z.string().min(32),
  metadata: z
    .object({
      name: z.string().trim().max(160).optional().default(""),
      part: z.enum(["upperbody", "wholebody_up", "lowerbody", "accessories_up", "shoes"]),
      value: z.union([z.string(), z.number()]).optional(),
      tags: z.array(z.string().trim().max(40)).max(24).optional().default([]),
    })
    .default({ part: "upperbody" }),
});

function parseValue(input: string | number | undefined): number | null {
  if (input === undefined || input === "") return null;
  const parsed = typeof input === "number" ? input : Number(String(input).replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * Adding a piece by hand: the member's own photo is stored as-is, with no AI
 * step and no AI charge. Still counted against the vault allowance.
 */
export const Route = createFileRoute("/api/wardrobe/direct-add")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        withUser(request, async ({ supabase, user }) => {
          const capacity = await requireVaultCapacity(
            supabase,
            user.id,
            environmentFromRequest(request),
          );
          if (!capacity.ok) return capacity.response;

          const parsed = DirectAddSchema.safeParse(await request.json().catch(() => ({})));
          if (!parsed.success) return json({ error: "That piece could not be added." }, 400);

          const { metadata, imageDataUrl } = parsed.data;
          const item = await persistPiece(supabase, user.id, {
            name: metadata.name || "New piece",
            part: metadata.part,
            color: null,
            secondaryColor: null,
            tags: metadata.tags ?? [],
            value: parseValue(metadata.value),
            cutout: imageDataUrl,
            modeled: null,
            importJobId: null,
          });

          return json(item, 201);
        }),
    },
  },
});
