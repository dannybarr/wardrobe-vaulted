import { createFileRoute } from "@tanstack/react-router";
import { analyzePhoto } from "@/lib/ai/provider.server";
import { claimTrialRun, TRIAL_RUN_CONTEXT } from "@/lib/trial/guard.server";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/**
 * The photo read for a guest's first piece, free and strictly capped. Same model
 * and same prompt as the member pipeline, so the result a visitor sees before
 * signing up is the result they get afterwards.
 */
export const Route = createFileRoute("/api/public/trial/analyze")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const claim = await claimTrialRun(request, "analyze");
        if (!claim.ok) return claim.response;

        const body = (await request.json().catch(() => ({}))) as {
          imageBase64?: string;
          imageDataUrl?: string;
          mime?: string;
        };
        const raw = body.imageDataUrl || body.imageBase64;
        if (typeof raw !== "string" || !raw.length) return json({ error: "Please choose a photo." }, 400);
        if (raw.length > 14_000_000) return json({ error: "That photo is too large. Please try a smaller one." }, 413);

        const match = raw.match(/^data:([^;]+);base64,(.+)$/s);
        const image = {
          base64: match?.[2] ?? raw,
          mime: match?.[1] ?? body.mime ?? "image/png",
          name: "photo.png",
        };

        try {
          const items = await analyzePhoto(TRIAL_RUN_CONTEXT, image);
          // A guest builds one piece, so only the clearest detection is offered.
          const trimmed = items.slice(0, 1);
          return json({
            items: trimmed,
            noClothingDetected: trimmed.length === 0,
            mode: "trial",
            chargedPence: 0,
            balancePence: null,
          });
        } catch (caught) {
          return json({ error: (caught as Error).message }, 502);
        }
      },
    },
  },
});
