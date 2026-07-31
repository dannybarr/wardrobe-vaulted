import { createFileRoute } from "@tanstack/react-router";
import { json, withUser } from "@/lib/api/request-context";
import { chargeForAiRun, readAiRunContext, refundAiCharge } from "@/lib/ai/credits.server";
import { editImage } from "@/lib/ai/provider.server";
import { MODELED_PROMPT } from "@/lib/ai/prompts";
import { readModelReference } from "@/lib/api/pieces.server";
import { insufficientCredit, safeDirection } from "@/lib/api/import-support";

/**
 * Optional stage three: an editorial photograph of the member wearing the piece.
 * It needs a saved photo of the member to work from, and is charged like any other
 * built-in AI run.
 */
export const Route = createFileRoute("/api/import/modeled")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        withUser(request, async ({ supabase, user }) => {
          const body = (await request.json().catch(() => ({}))) as {
            garmentBase64?: string;
            direction?: string;
          };
          if (typeof body.garmentBase64 !== "string" || !body.garmentBase64.length) {
            return json({ error: "The garment image was missing." }, 400);
          }

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
          const charge = await chargeForAiRun({ userId: user.id, kinds: ["on_model"], note: "On-model image" });
          if (!charge.ok) return insufficientCredit(charge);

          const direction = safeDirection(body.direction);
          const prompt = direction ? `${MODELED_PROMPT}\nUser regeneration direction: ${direction}` : MODELED_PROMPT;

          try {
            const imageBase64 = await editImage(run, {
              prompt,
              images: [
                { base64: reference.base64, mime: reference.mime, name: "model.png" },
                {
                  base64: body.garmentBase64.replace(/^data:[^,]+,/, ""),
                  mime: "image/png",
                  name: "garment.png",
                },
              ],
              size: "1536x1024",
            });
            return json({
              imageBase64,
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
