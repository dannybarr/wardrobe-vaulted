import { createFileRoute } from "@tanstack/react-router";
import { json, withUser } from "@/lib/api/request-context";
import { findGarment, PRIVATE_BUCKET } from "@/lib/api/wardrobe-payload";
import { attachModeledImage, readImageAsBase64, readModelReference } from "@/lib/api/pieces.server";
import { chargeForAiRun, readAiRunContext, refundAiCharge } from "@/lib/ai/credits.server";
import { editImage } from "@/lib/ai/provider.server";
import { MODELED_PROMPT } from "@/lib/ai/prompts";
import { insufficientCredit, safeDirection } from "@/lib/api/import-support";

/**
 * Creates (or replaces) the on-model photograph for a piece already in the
 * wardrobe, working from its stored cutout so the garment stays identical.
 */
export const Route = createFileRoute("/api/import/wardrobe/$id/modeled")({
  server: {
    handlers: {
      POST: async ({ request, params }) =>
        withUser(request, async ({ supabase, user }) => {
          const garment = await findGarment(supabase, params.id);
          if (!garment) return json({ error: "That piece is no longer in your wardrobe." }, 404);

          const { data: images } = await supabase
            .from("garment_images")
            .select("storage_path, bucket, kind, is_current")
            .eq("garment_id", garment.id)
            .eq("kind", "cutout")
            .eq("is_current", true)
            .limit(1);

          const cutout = images?.[0];
          if (!cutout) return json({ error: "That piece has no garment image to work from." }, 409);

          const garmentBase64 = await readImageAsBase64(
            supabase,
            cutout.bucket || PRIVATE_BUCKET,
            cutout.storage_path,
          );
          if (!garmentBase64) return json({ error: "That piece's image could not be read." }, 502);

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

          const run = await readAiRunContext(user.id);
          const charge = await chargeForAiRun({
            userId: user.id,
            kinds: ["on_model"],
            note: `On-model image: ${garment.name}`,
          });
          if (!charge.ok) return insufficientCredit(charge);

          const body = (await request.json().catch(() => ({}))) as { direction?: string };
          const direction = safeDirection(body.direction);
          const prompt = direction ? `${MODELED_PROMPT}\nUser regeneration direction: ${direction}` : MODELED_PROMPT;

          try {
            const imageBase64 = await editImage(run, {
              prompt,
              images: [
                { base64: reference.base64, mime: reference.mime, name: "model.png" },
                { base64: garmentBase64, mime: "image/png", name: "garment.png" },
              ],
              size: "1536x1024",
            });
            const modeledImage = await attachModeledImage(supabase, user.id, garment.id, imageBase64);
            return json({
              modeledImage,
              mode: charge.mode,
              chargedPence: charge.chargedPence,
              balancePence: charge.balancePence,
            });
          } catch (caught) {
            await refundAiCharge(user.id, charge.chargedPence, "Refund: on-model image failed");
            return json({ error: (caught as Error).message }, 502);
          }
        }),
    },
  },
});
