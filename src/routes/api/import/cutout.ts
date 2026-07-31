import { createFileRoute } from "@tanstack/react-router";
import { json, withUser } from "@/lib/api/request-context";
import { requireVaultCapacity } from "@/lib/api/vault-gate";
import { chargeForAiRun, readAiRunContext, refundAiCharge } from "@/lib/ai/credits.server";
import { editImage } from "@/lib/ai/provider.server";
import { buildGarmentPrompt } from "@/lib/ai/prompts";
import { environmentFromRequest, insufficientCredit, safeChromaKey, safeDirection } from "@/lib/api/import-support";

/**
 * Stage two: turn the cropped photo into a catalog-style garment image on a flat
 * chroma background. The browser then lifts that background, which is what gives
 * the transparent cutout its clean edge.
 */
export const Route = createFileRoute("/api/import/cutout")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        withUser(request, async ({ supabase, user }) => {
          const capacity = await requireVaultCapacity(supabase, user.id, environmentFromRequest(request));
          if (!capacity.ok) return capacity.response;

          const body = (await request.json().catch(() => ({}))) as {
            imageBase64?: string;
            chromaKey?: string;
            metadata?: Record<string, unknown>;
            direction?: string;
            byteSize?: number;
          };
          if (typeof body.imageBase64 !== "string" || !body.imageBase64.length) {
            return json({ error: "The cropped image was missing." }, 400);
          }

          const chromaKey = safeChromaKey(body.chromaKey);
          const direction = safeDirection(body.direction);
          const metadata = (body.metadata ?? {}) as {
            name?: string;
            part?: string;
            color?: string | null;
            secondaryColor?: string | null;
            tags?: string[];
          };

          const byteSize = Number.isFinite(body.byteSize)
            ? Number(body.byteSize)
            : Math.round(body.imageBase64.length * 0.75);

          const run = await readAiRunContext(user.id);
          const charge = await chargeForAiRun({
            userId: user.id,
            kinds: ["cutout"],
            byteSize,
            note: `Garment image: ${metadata.name ?? "new piece"}`,
          });
          if (!charge.ok) return insufficientCredit(charge);

          const basePrompt = buildGarmentPrompt(metadata, chromaKey);
          const prompt = direction ? `${basePrompt}\nUser regeneration direction: ${direction}` : basePrompt;

          try {
            const imageBase64 = await editImage(run, {
              prompt,
              images: [{ base64: body.imageBase64.replace(/^data:[^,]+,/, ""), mime: "image/png", name: "crop.png" }],
              size: "1024x1024",
            });
            return json({
              imageBase64,
              chromaKey,
              mode: charge.mode,
              chargedPence: charge.chargedPence,
              balancePence: charge.balancePence,
            });
          } catch (caught) {
            await refundAiCharge(user.id, charge.chargedPence, "Refund: garment image failed");
            return json({ error: (caught as Error).message }, 502);
          }
        }),
    },
  },
});
