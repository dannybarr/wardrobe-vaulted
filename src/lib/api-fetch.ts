import { supabase } from "@/integrations/supabase/client";

/**
 * Same call signature as `fetch`, with the signed-in session attached so the
 * wardrobe API can apply per-account access rules.
 */
export async function apiFetch(path: string, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const headers = new Headers(init.headers);
  if (data.session?.access_token) {
    headers.set("Authorization", `Bearer ${data.session.access_token}`);
  }
  return fetch(path, { ...init, headers, cache: init.cache ?? "no-store" });
}
