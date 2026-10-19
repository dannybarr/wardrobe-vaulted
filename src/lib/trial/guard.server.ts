/**
 * Spend guard for the guest trial.
 *
 * The free first pieces run on the built-in AI, which costs real money. A browser
 * is identified by a server-signed cookie, not by an id it chooses. Each network
 * address, and the whole product, have a daily ceiling.
 */
import { estimateStage } from "@/lib/ai/pricing";
import { mintTrialCookie, readTrialDevice, trialCookieConfigured } from "@/lib/trial/cookie.server";
import { decideTrialRun, type TrialKind } from "@/lib/trial/policy";
import { verifyTurnstile } from "@/lib/security/turnstile.server";

export type { TrialKind };

function json(body: unknown, status: number, extra?: HeadersInit) {
  const headers = new Headers(extra);
  headers.set("Content-Type", "application/json");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(body), { status, headers });
}

async function addressHash(request: Request): Promise<string> {
  const address =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  const bytes = new TextEncoder().encode(`wardrobe-trial:${address}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

const tooMany = (setCookie?: string) =>
  json(
    {
      error:
        "The free trial for this browser is used up. Create your free account to carry on adding pieces.",
      code: "signup_required",
    },
    429,
    setCookie ? { "Set-Cookie": setCookie } : undefined,
  );

const busy = (setCookie?: string) =>
  json(
    {
      error: "The free trial is very busy right now. Create your account to carry on.",
      code: "signup_required",
    },
    429,
    setCookie ? { "Set-Cookie": setCookie } : undefined,
  );

export type TrialClaim = { ok: true; setCookie: string | null } | { ok: false; response: Response };

/**
 * Records one free run and returns whether it is allowed. Call it before spending
 * anything on the AI. A client-supplied device header is ignored.
 */
export async function claimTrialRun(request: Request, kind: TrialKind): Promise<TrialClaim> {
  if (!trialCookieConfigured()) {
    return {
      ok: false,
      response: json(
        { error: "The free trial is not available just now.", code: "signup_required" },
        503,
      ),
    };
  }

  const human = await verifyTurnstile(request);
  if (!human.ok) return human;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const hash = await addressHash(request);
  const existing = await readTrialDevice(request);
  const nextCost = Math.ceil(estimateStage(kind, 0));

  const [byDevice, byAddress, globalRows, mints] = await Promise.all([
    existing
      ? supabaseAdmin
          .from("trial_runs")
          .select("id", { count: "exact", head: true })
          .eq("device_id", existing)
          .eq("kind", kind)
      : Promise.resolve({ count: 0 }),
    supabaseAdmin
      .from("trial_runs")
      .select("id", { count: "exact", head: true })
      .eq("address_hash", hash)
      .eq("kind", kind)
      .gte("created_at", since),
    supabaseAdmin.from("trial_runs").select("cost_pence").gte("created_at", since).limit(2000),
    existing
      ? Promise.resolve({ count: 0 })
      : supabaseAdmin
          .from("trial_runs")
          .select("id", { count: "exact", head: true })
          .eq("address_hash", hash)
          .eq("kind", "session")
          .gte("created_at", since),
  ]);

  const globalSpend = (globalRows.data ?? []).reduce(
    (total, row) => total + (row.cost_pence ?? 0),
    0,
  );
  const decision = decideTrialRun({
    deviceCount: byDevice.count ?? 0,
    addressCount: byAddress.count ?? 0,
    globalCount: globalRows.data?.length ?? 0,
    globalSpendPence: globalSpend,
    nextCostPence: nextCost,
    kind,
    hasDevice: Boolean(existing),
    sessionMints: mints.count ?? 0,
  });

  let device = existing;
  let setCookie: string | null = null;
  if (!device) {
    device = crypto.randomUUID();
    setCookie = await mintTrialCookie(device);
    if (!setCookie) {
      return {
        ok: false,
        response: json({ error: "The free trial is not available just now." }, 503),
      };
    }
  }

  if (!decision.ok) {
    const response =
      decision.reason === "busy" ? busy(setCookie ?? undefined) : tooMany(setCookie ?? undefined);
    return { ok: false, response };
  }

  if (!existing) {
    await supabaseAdmin.from("trial_runs").insert({
      device_id: device,
      address_hash: hash,
      kind: "session",
      cost_pence: 0,
    });
  }

  await supabaseAdmin.from("trial_runs").insert({
    device_id: device,
    address_hash: hash,
    kind,
    cost_pence: nextCost,
  });

  return { ok: true, setCookie };
}

export function withTrialCookie(response: Response, setCookie: string | null): Response {
  if (!setCookie) return response;
  const headers = new Headers(response.headers);
  headers.append("Set-Cookie", setCookie);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/** Guests always run on the built-in AI, with no wallet attached. */
export const TRIAL_RUN_CONTEXT = { mode: "builtin" as const, apiKey: null, founder: false };
