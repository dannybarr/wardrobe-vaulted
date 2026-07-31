import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { User } from "@supabase/supabase-js";

/**
 * Builds a Supabase client that acts as the caller of an HTTP API route, using
 * the bearer token from the request. Row level security therefore applies as
 * that person — an API route can never see somebody else's wardrobe.
 */
export function clientForRequest(request: Request) {
  const url = process.env["SUPABASE_URL"]!;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";

  const supabase = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set("apikey", key);
        if (token) headers.set("Authorization", `Bearer ${token}`);
        else headers.delete("Authorization");
        return fetch(input, { ...init, headers });
      },
    },
  });

  return { supabase, token };
}

export type ApiContext = {
  supabase: ReturnType<typeof clientForRequest>["supabase"];
  user: User;
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

/** Runs `handler` only for a signed-in caller; otherwise answers 401. */
export async function withUser(
  request: Request,
  handler: (context: ApiContext) => Promise<Response>,
): Promise<Response> {
  const { supabase, token } = clientForRequest(request);
  if (!token) return json({ error: "Please sign in." }, 401);

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return json({ error: "Please sign in.", debug: { hasToken: Boolean(token), url: process.env["SUPABASE_URL"] ?? null, keyPrefix: (process.env["SUPABASE_PUBLISHABLE_KEY"] ?? "").slice(0, 12), message: error?.message ?? null, status: (error as { status?: number } | null)?.status ?? null } }, 401);
  if (error || !data.user) return json({ error: "Please sign in." }, 401);

  try {
    return await handler({ supabase, user: data.user });
  } catch (caught) {
    console.error("wardrobe api failure", caught);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
}
