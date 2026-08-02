/**
 * The spend guard on the guest trial.
 *
 * The free first piece runs on the built-in AI, which costs real money, so every
 * free run is counted: a browser gets enough for one photo, and any single
 * network address is capped for the day. Nothing here identifies a person — only
 * a random browser id and a one-way hash of the address are stored.
 */
export type TrialKind = "analyze" | "cutout";

const DEVICE_CAP: Record<TrialKind, number> = { analyze: 7, cutout: 11 };
const ADDRESS_DAILY_CAP: Record<TrialKind, number> = { analyze: 40, cutout: 70 };
const GLOBAL_DAILY_CAP = 600;

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function deviceFrom(request: Request): string | null {
  const value = request.headers.get("x-wardrobe-device")?.trim() ?? "";
  return /^[a-z0-9-]{8,64}$/i.test(value) ? value : null;
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

const tooMany = () =>
  json(
    {
      error:
        "The free trial for this browser is used up. Create your free account to carry on adding pieces.",
      code: "signup_required",
    },
    429,
  );

/**
 * Records one free run and returns whether it is allowed. Call it before spending
 * anything on the AI.
 */
export async function claimTrialRun(
  request: Request,
  kind: TrialKind,
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const device = deviceFrom(request);
  if (!device) return { ok: false, response: json({ error: "Please reload the page." }, 400) };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const hash = await addressHash(request);

  const [byDevice, byAddress, global] = await Promise.all([
    supabaseAdmin
      .from("trial_runs")
      .select("id", { count: "exact", head: true })
      .eq("device_id", device)
      .eq("kind", kind),
    supabaseAdmin
      .from("trial_runs")
      .select("id", { count: "exact", head: true })
      .eq("address_hash", hash)
      .eq("kind", kind)
      .gte("created_at", since),
    supabaseAdmin
      .from("trial_runs")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since),
  ]);

  if ((byDevice.count ?? 0) >= DEVICE_CAP[kind]) return { ok: false, response: tooMany() };
  if ((byAddress.count ?? 0) >= ADDRESS_DAILY_CAP[kind]) return { ok: false, response: tooMany() };
  if ((global.count ?? 0) >= GLOBAL_DAILY_CAP) {
    return {
      ok: false,
      response: json(
        {
          error: "The free trial is very busy right now. Create your account to carry on.",
          code: "signup_required",
        },
        429,
      ),
    };
  }

  await supabaseAdmin.from("trial_runs").insert({ device_id: device, address_hash: hash, kind });
  return { ok: true };
}

/** Guests always run on the built-in AI, with no wallet attached. */
export const TRIAL_RUN_CONTEXT = { mode: "builtin" as const, apiKey: null, founder: false };
