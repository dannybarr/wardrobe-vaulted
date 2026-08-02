import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** Pieces anyone may add before the Vault subscription is required. */
export const FREE_PIECE_ALLOWANCE = 4;

export type VaultGate = {
  subscribed: boolean;
  pieces: number;
  canAddPieces: boolean;
  freePieceRemaining: boolean;
};

/**
 * The add-a-piece rule in one place: founders and paying members always may,
 * everyone else gets four free pieces. Members whose payment is being retried, or
 * who cancelled but are still inside the paid period, keep full access — the
 * database routine `has_vault_access` decides that part.
 */
export async function readVaultGate(
  supabase: SupabaseClient<Database>,
  userId: string,
  environment: "sandbox" | "live",
): Promise<VaultGate> {
  const [{ data: hasAccess }, { data: count }] = await Promise.all([
    supabase.rpc("has_vault_access", { _user_id: userId, _environment: environment }),
    supabase.rpc("garment_count", { _user_id: userId }),
  ]);

  const pieces = count ?? 0;
  const subscribed = hasAccess === true;

  return {
    subscribed,
    pieces,
    canAddPieces: subscribed || pieces < FREE_PIECE_ALLOWANCE,
    freePieceRemaining: !subscribed && pieces < FREE_PIECE_ALLOWANCE,
  };
}

/** Guard for any API route that creates pieces; returns a 402 body when locked. */
export async function requireVaultCapacity(
  supabase: SupabaseClient<Database>,
  userId: string,
  environment: "sandbox" | "live",
): Promise<{ ok: true; gate: VaultGate } | { ok: false; response: Response }> {
  const gate = await readVaultGate(supabase, userId, environment);
  if (gate.canAddPieces) return { ok: true, gate };

  return {
    ok: false,
    response: new Response(
      JSON.stringify({
        error: "Your free piece is used. Subscribe to Vault to keep adding and storing pieces.",
        code: "vault_required",
        gate,
      }),
      { status: 402, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
    ),
  };
}
