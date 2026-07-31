import { createFileRoute } from "@tanstack/react-router";
import { withUser, json } from "@/lib/api/request-context";
import { readVaultGate } from "@/lib/api/vault-gate";

function envFromRequest(request: Request): "sandbox" | "live" {
  const value = new URL(request.url).searchParams.get("env");
  return value === "live" ? "live" : "sandbox";
}

/** Whether the caller may still add pieces, for the wardrobe screen. */
export const Route = createFileRoute("/api/import/gate")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        withUser(request, async ({ supabase, user }) =>
          json(await readVaultGate(supabase, user.id, envFromRequest(request))),
        ),
    },
  },
});
