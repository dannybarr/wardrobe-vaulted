import { supabase } from "@/integrations/supabase/client";
import { isGuestMode } from "@/lib/trial/mode";

/**
 * Same call signature as `fetch`, with the signed-in session attached so the
 * wardrobe API can apply per-account access rules.
 *
 * While the visitor is still a guest in the /try wardrobe there is no session, so
 * the call is answered from the browser-held trial wardrobe instead.
 */
export async function apiFetch(path: string, init: RequestInit = {}) {
  if (isGuestMode()) {
    const { handleTrialRequest } = await import("@/lib/trial/transport");
    const handled = await handleTrialRequest(path, init);
    if (handled) return handled;
  }

  const { data } = await supabase.auth.getSession();
  const headers = new Headers(init.headers);
  if (data.session?.access_token) {
    headers.set("Authorization", `Bearer ${data.session.access_token}`);
  }
  return fetch(path, { ...init, headers, cache: init.cache ?? "no-store" });
}
