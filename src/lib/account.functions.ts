import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Makes sure the signed-in account has its profile, role, wardrobe, allowances
 * and plan in place. Safe to call on every visit; it never duplicates anything.
 */
export const ensureAccountReady = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = (context.claims as { email?: string }).email ?? "";

    const { error } = await supabaseAdmin.rpc("provision_account", {
      _user_id: context.userId,
      _email: email,
    });
    if (error) throw new Error("We couldn't finish setting up your account.");


    const { data: profile } = await context.supabase
      .from("profiles")
      .select("is_founder, onboarding_step, display_name, email")
      .eq("id", context.userId)
      .maybeSingle();

    return {
      isFounder: Boolean(profile?.is_founder),
      onboardingStep: profile?.onboarding_step ?? "start",
      displayName: profile?.display_name ?? null,
      email: profile?.email ?? email,
    };
  });
