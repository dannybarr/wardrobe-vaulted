import { createFileRoute } from "@tanstack/react-router";
import { withUser, json } from "@/lib/api/request-context";
import { readAiRunContext } from "@/lib/ai/credits.server";
import { readModelReference } from "@/lib/api/pieces.server";

/**
 * Tells the app whether AI-powered import is available for this account, which
 * AI path it will use, and whether on-model photography can be offered yet.
 */
export const Route = createFileRoute("/api/import/config")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        withUser(request, async ({ supabase, user }) => {
          const run = await readAiRunContext(user.id);
          const ready = run.mode === "byok" ? Boolean(run.apiKey) : Boolean(process.env["LOVABLE_API_KEY"]);
          const reference = await readModelReference(supabase, user.id);

          return json({
            ready,
            mode: run.mode,
            founder: run.founder,
            metered: run.mode === "builtin" && !run.founder,
            canModel: Boolean(reference),
          });
        }),
    },
  },
});
