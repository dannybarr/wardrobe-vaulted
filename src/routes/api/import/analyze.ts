import { createFileRoute } from "@tanstack/react-router";
import { json, withUser } from "@/lib/api/request-context";
import { requireVaultCapacity } from "@/lib/api/vault-gate";
import { chargeForAiRun, readAiRunContext, refundAiCharge } from "@/lib/ai/credits.server";
import { analyzePhoto } from "@/lib/ai/provider.server";
import { environmentFromRequest, insufficientCredit } from "@/lib/api/import-support";

/**
 * Stage one of an import: read the uploaded photo and return one record per
 * wearable item in it. The member is charged for this stage before it runs, and
 * refunded automatically if the read fails.
 */
export const Route = createFileRoute("/api/import/analyze")({
  server: {
    handlers: {
      POST: async ({ request }) =>
        withUser(request, async ({ supabase, user }) => {
          const capacity = await requireVaultCapacity(supabase, user.id, environmentFromRequest(request));
          if (!capacity.ok) return capacity.response;

          const body = (await request.json().catch(() => ({}))) as {
            imageBase64?: string;
            imageDataUrl?: string;
            mime?: string;
            byteSize?: number;
          };
          const raw = body.imageDataUrl || body.imageBase64;
          if (typeof raw !== "string" || !raw.length) return json({ error: "Please choose a photo." }, 400);

          const byteSize = Number.isFinite(body.byteSize) ? Number(body.byteSize) : Math.round(raw.length * 0.75);
          const run = await readAiRunContext(user.id);
          const charge = await chargeForAiRun({ userId: user.id, kinds: ["analyze"], byteSize, note: "Photo read" });
          if (!charge.ok) return insufficientCredit(charge);

          const match = raw.match(/^data:([^;]+);base64,(.+)$/s);
          const image = {
            base64: match?.[2] ?? raw,
            mime: match?.[1] ?? body.mime ?? "image/png",
            name: "photo.png",
          };

          try {
            const items = await analyzePhoto(run, image);
            return json({
              items,
              noClothingDetected: items.length === 0,
              mode: charge.mode,
              chargedPence: charge.chargedPence,
              balancePence: charge.balancePence,
            });
          } catch (caught) {
            await refundAiCharge(user.id, charge.chargedPence, "Refund: photo read failed");
            return json({ error: (caught as Error).message }, 502);
          }
        }),
    },
  },
});
