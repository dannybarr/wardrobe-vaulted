/**
 * Member-facing actions for AI credit: reading the balance, quoting a run before
 * it happens, switching between the built-in AI and a member's own OpenAI key,
 * and buying a prepaid pack.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { estimateAiCost, IMPORT_STAGES, type AiJobKind } from "@/lib/ai/pricing";

const JOB_KINDS = new Set<AiJobKind>(["analyze", "cutout", "on_model", "wishlist_resolve"]);

/** Balance, mode and recent history for the billing screen. */
export const getAiCreditState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const [{ data: wallet }, { data: profile }, { data: usage }] = await Promise.all([
      supabase
        .from("ai_wallets")
        .select("balance_pence, topped_up_pence, spent_pence")
        .eq("owner_id", userId)
        .maybeSingle(),
      supabase.from("profiles").select("ai_mode, ai_key_hint, is_founder").eq("id", userId).maybeSingle(),
      supabase
        .from("ai_usage")
        .select("id, kind, model, charged_pence, created_at")
        .eq("owner_id", userId)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    return {
      balancePence: wallet?.balance_pence ?? 0,
      toppedUpPence: wallet?.topped_up_pence ?? 0,
      spentPence: wallet?.spent_pence ?? 0,
      mode: (profile?.ai_mode as "builtin" | "byok") ?? "builtin",
      keyHint: profile?.ai_key_hint ?? null,
      founder: profile?.is_founder === true,
      usage: usage ?? [],
    };
  });

/**
 * Quotes a run before it starts. The wardrobe shows this figure and asks the
 * member to confirm, so nothing is ever charged without being seen first.
 */
export const quoteAiRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { kinds?: string[]; byteSize?: number }) => {
    const kinds = (data.kinds ?? IMPORT_STAGES).filter((kind): kind is AiJobKind =>
      JOB_KINDS.has(kind as AiJobKind),
    );
    if (!kinds.length) throw new Error("Nothing to quote");
    const byteSize = Number.isFinite(data.byteSize) ? Math.max(0, Number(data.byteSize)) : 0;
    return { kinds, byteSize };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const estimate = estimateAiCost(data.kinds, data.byteSize);

    const [{ data: wallet }, { data: profile }] = await Promise.all([
      supabase.from("ai_wallets").select("balance_pence").eq("owner_id", userId).maybeSingle(),
      supabase.from("profiles").select("ai_mode, is_founder").eq("id", userId).maybeSingle(),
    ]);

    const founder = profile?.is_founder === true;
    const mode = founder ? "builtin" : ((profile?.ai_mode as "builtin" | "byok") ?? "builtin");
    const balancePence = wallet?.balance_pence ?? 0;
    const chargedPence = mode === "byok" || founder ? 0 : estimate.chargedPence;

    return {
      mode,
      founder,
      chargedPence,
      costPence: estimate.costPence,
      markupBps: estimate.markupBps,
      stages: estimate.stages,
      balancePence,
      affordable: chargedPence === 0 || balancePence >= chargedPence,
    };
  });

/** Saves a member's own OpenAI key and switches them onto it. */
export const saveOwnAiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { key: string }) => {
    const key = (data.key ?? "").trim();
    if (!key.startsWith("sk-") || key.length < 20) {
      throw new Error("That does not look like an OpenAI key — it should begin with “sk-”.");
    }
    return { key };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const hint = `sk-…${data.key.slice(-4)}`;

    const { error: keyError } = await supabase
      .from("ai_credentials")
      .upsert({ owner_id: userId, provider: "openai", secret: data.key }, { onConflict: "owner_id" });
    if (keyError) throw new Error("Your key could not be saved. Please try again.");

    const { error } = await supabase
      .from("profiles")
      .update({ ai_mode: "byok", ai_key_hint: hint })
      .eq("id", userId);
    if (error) throw new Error("Your key was saved but the setting could not be changed.");

    return { mode: "byok" as const, keyHint: hint };
  });

/** Removes the member's key and puts them back on the built-in AI. */
export const removeOwnAiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await supabase.from("ai_credentials").delete().eq("owner_id", userId);
    await supabase.from("profiles").update({ ai_mode: "builtin", ai_key_hint: null }).eq("id", userId);
    return { mode: "builtin" as const };
  });

/** Switches between paths without touching a saved key. */
export const setAiMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { mode: "builtin" | "byok" }) => {
    if (data.mode !== "builtin" && data.mode !== "byok") throw new Error("Unknown AI setting");
    return data;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    if (data.mode === "byok") {
      // Saved keys are server-only, so the profile's masked hint is what tells
      // us a key exists.
      const { data: profile } = await supabase
        .from("profiles")
        .select("ai_key_hint")
        .eq("id", userId)
        .maybeSingle();
      if (!profile?.ai_key_hint) throw new Error("Add your OpenAI key first.");
    }

    await supabase.from("profiles").update({ ai_mode: data.mode }).eq("id", userId);
    return { mode: data.mode };
  });
