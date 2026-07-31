/**
 * Server-only helpers for paying for built-in AI.
 *
 * Two paths exist, and this module decides which one a run takes:
 *  - "builtin": the app's own AI is used, and the member's prepaid balance is
 *    charged the measured cost plus the 20% markup before the run starts.
 *  - "byok": the member's own OpenAI key is used, and nothing is charged.
 *
 * Founder accounts always run on the built-in AI, free of charge.
 */
import type { AiJobKind } from "@/lib/ai/pricing";
import { estimateAiCost } from "@/lib/ai/pricing";

export type AiMode = "builtin" | "byok";

export type AiRunContext = {
  mode: AiMode;
  /** Present only when the member is on their own key. */
  apiKey: string | null;
  founder: boolean;
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Which AI path this member is on, plus their key when they brought one. */
export async function readAiRunContext(userId: string): Promise<AiRunContext> {
  const db = await admin();
  const { data: profile } = await db
    .from("profiles")
    .select("ai_mode, is_founder")
    .eq("id", userId)
    .maybeSingle();

  const founder = profile?.is_founder === true;
  if (profile?.ai_mode !== "byok" || founder) {
    return { mode: "builtin", apiKey: null, founder };
  }

  const { data: credential } = await db
    .from("ai_credentials")
    .select("secret")
    .eq("owner_id", userId)
    .maybeSingle();

  if (!credential?.secret) return { mode: "builtin", apiKey: null, founder };
  return { mode: "byok", apiKey: credential.secret, founder };
}

export type AiChargeResult =
  | { ok: true; mode: AiMode; chargedPence: number; balancePence: number | null }
  | { ok: false; reason: "insufficient_credit"; requiredPence: number; balancePence: number };

/**
 * Takes payment for a run up front so a member can never end up in arrears.
 * Refund with `refundAiCharge` if the run then fails.
 */
export async function chargeForAiRun(options: {
  userId: string;
  kinds: AiJobKind[];
  byteSize?: number;
  note?: string;
  aiJobId?: string | null;
}): Promise<AiChargeResult> {
  const context = await readAiRunContext(options.userId);
  if (context.mode === "byok" || context.founder) {
    return { ok: true, mode: context.mode, chargedPence: 0, balancePence: null };
  }

  const estimate = estimateAiCost(options.kinds, options.byteSize ?? 0);
  const db = await admin();

  const { data: balance } = await db.rpc("charge_ai_wallet", {
    _user_id: options.userId,
    _charged_pence: estimate.chargedPence,
    _cost_pence: estimate.costPence,
    _kind: options.kinds.join("+"),
    _model: estimate.stages.map((stage) => stage.model).join(", "),
    _markup_bps: estimate.markupBps,
    ...(options.note ? { _note: options.note } : {}),
  });

  if (balance === null || balance === undefined || balance < 0) {
    const { data: wallet } = await db
      .from("ai_wallets")
      .select("balance_pence")
      .eq("owner_id", options.userId)
      .maybeSingle();
    return {
      ok: false,
      reason: "insufficient_credit",
      requiredPence: estimate.chargedPence,
      balancePence: wallet?.balance_pence ?? 0,
    };
  }

  return { ok: true, mode: "builtin", chargedPence: estimate.chargedPence, balancePence: balance };
}

/** Puts credit back when a paid run failed, and records it in the history. */
export async function refundAiCharge(userId: string, chargedPence: number, note: string) {
  if (chargedPence <= 0) return;
  const db = await admin();

  const { data: wallet } = await db
    .from("ai_wallets")
    .select("balance_pence")
    .eq("owner_id", userId)
    .maybeSingle();

  await db
    .from("ai_wallets")
    .update({ balance_pence: (wallet?.balance_pence ?? 0) + chargedPence })
    .eq("owner_id", userId);

  await db.from("ai_usage").insert({
    owner_id: userId,
    kind: "refund",
    mode: "builtin",
    cost_pence: 0,
    markup_bps: 0,
    charged_pence: -chargedPence,
    note,
  });
}
