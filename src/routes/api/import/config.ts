import { createFileRoute } from "@tanstack/react-router";
import { withUser, json } from "@/lib/api/request-context";

/**
 * Tells the app whether AI-powered import is available for this account.
 * Mirrors the original /api/import/config contract.
 */
export const Route = createFileRoute("/api/import/config")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        withUser(request, async () => json({ ready: Boolean(process.env["OPENAI_API_KEY"]) })),
    },
  },
});
