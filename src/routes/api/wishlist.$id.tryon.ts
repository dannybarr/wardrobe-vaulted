import { createFileRoute } from "@tanstack/react-router";
import { json, withUser } from "@/lib/api/request-context";
import { chargeForAiRun, readAiRunContext, refundAiCharge } from "@/lib/ai/credits.server";
import { editImage } from "@/lib/ai/provider.server";
import { MODELED_PROMPT } from "@/lib/ai/prompts";
import { readModelReference } from "@/lib/api/pieces.server";
import { insufficientCredit } from "@/lib/api/import-support";
import { attachWishlistImage, readWishlistImageBase64 } from "@/lib/api/wishlist.server";

/** Seeing a wishlist piece on yourself, charged like any other built-in AI run. */
export const Route = createFileRoute("/api/wishlist/$id/tryon")({
  server: {
    handlers: {
      POST: async ({ request, params }) =>
        withUser(request, async ({ supabase, user }) => {
          const garment = await readWishlistImageBase64(supabase, params.id);
          if (!garment) return json({ error: "Add a product image before trying it on." }, 409);

          const reference = await readModelReference(supabase, user.id);
          if (!reference) {
            return json(
              {
                error: "Add a photo of yourself in your account settings to create try-on images.",
                code: "model_reference_required",
              },
              409,
            );
          }

          const run = await readAiRunContext(user.id);
          const charge = await chargeForAiRun({
            userId: user.id,
            kinds: ["on_model"],
            note: "Wishlist try-on",
          });
          if (!charge.ok) return insufficientCredit(charge);

          try {
            const imageBase64 = await editImage(run, {
              prompt: MODELED_PROMPT,
              images: [
                { base64: reference.base64, mime: reference.mime, name: "model.png" },
                { base64: garment.base64, mime: garment.mime, name: "garment.png" },
              ],
              size: "1536x1024",
            });
            const item = await attachWishlistImage(
              supabase,
              user.id,
              params.id,
              imageBase64,
              "modeled",
            );
            return json(item);
          } catch (caught) {
            await refundAiCharge(user.id, charge.chargedPence, "Refund: wishlist try-on failed");
            return json({ error: (caught as Error).message }, 502);
          }
        }),
    },
  },
});
