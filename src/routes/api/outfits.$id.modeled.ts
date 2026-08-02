import { createFileRoute } from "@tanstack/react-router";
import { json, withUser } from "@/lib/api/request-context";
import { PRIVATE_BUCKET } from "@/lib/api/wardrobe-payload";
import { decodeBase64Image, readImageAsBase64, readModelReference } from "@/lib/api/pieces.server";
import {
  attachOutfitModeled,
  loadOutfits,
  readOutfit,
  readOutfitPieces,
} from "@/lib/api/outfits.server";
import { chargeForAiRun, readAiRunContext, refundAiCharge } from "@/lib/ai/credits.server";
import { editImage } from "@/lib/ai/provider.server";
import { MODELED_PROMPT } from "@/lib/ai/prompts";
import { insufficientCredit, safeDirection } from "@/lib/api/import-support";

const OUTFIT_PROMPT = `${MODELED_PROMPT} The person must wear every garment supplied after Image 1 together as one complete coordinated outfit, each piece kept exactly as photographed.`;

/** Creates the on-model photograph of a whole saved look. */
export const Route = createFileRoute("/api/outfits/$id/modeled")({
  server: {
    handlers: {
      POST: async ({ request, params }) =>
        withUser(request, async ({ supabase, user }) => {
          const outfit = await readOutfit(supabase, params.id);
          if (!outfit) return json({ error: "That outfit is no longer saved." }, 404);

          const pieces = await readOutfitPieces(supabase, outfit.id);
          if (pieces.length < 2) {
            return json({ error: "This look needs at least two pieces with images." }, 409);
          }

          const images: Array<{ base64: string; mime: string; name: string }> = [];
          const reference = await readModelReference(supabase, user.id);
          if (!reference) {
            return json(
              {
                error: "Add a photo of yourself in your account settings to create on-model images.",
                code: "model_reference_required",
              },
              409,
            );
          }
          images.push({ base64: reference.base64, mime: reference.mime, name: "model.png" });

          for (const [index, piece] of pieces.entries()) {
            const base64 = await readImageAsBase64(supabase, piece.bucket, piece.path);
            if (!base64) return json({ error: "One piece's image could not be read." }, 502);
            images.push({ base64, mime: "image/png", name: `garment-${index + 1}.png` });
          }

          const run = await readAiRunContext(user.id);
          const charge = await chargeForAiRun({
            userId: user.id,
            kinds: ["on_model"],
            note: `On-model outfit: ${outfit.name}`,
          });
          if (!charge.ok) return insufficientCredit(charge);

          const body = (await request.json().catch(() => ({}))) as { direction?: string };
          const direction = safeDirection(body.direction);
          const prompt = direction
            ? `${OUTFIT_PROMPT}\nUser regeneration direction: ${direction}`
            : OUTFIT_PROMPT;

          try {
            const imageBase64 = await editImage(run, { prompt, images, size: "1536x1024" });
            const { bytes } = decodeBase64Image(imageBase64);
            const path = `${user.id}/outfits/${outfit.id}/modeled-${Date.now()}.png`;
            const { error: uploadError } = await supabase.storage
              .from(PRIVATE_BUCKET)
              .upload(path, bytes, { contentType: "image/png", upsert: true });
            if (uploadError) throw uploadError;

            await attachOutfitModeled(supabase, user.id, outfit.id, path, bytes.byteLength);

            const all = await loadOutfits(supabase);
            const updated = all.find((entry) => entry.id === outfit.id);
            return json(updated ?? { id: outfit.id, generation: null });
          } catch (caught) {
            await refundAiCharge(user.id, charge.chargedPence, "Refund: on-model outfit failed");
            return json({ error: (caught as Error).message }, 502);
          }
        }),
    },
  },
});
