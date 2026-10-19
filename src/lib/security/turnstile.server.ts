/**
 * Cloudflare Turnstile. Optional: when TURNSTILE_SECRET_KEY is unset the check
 * is skipped, so local and demo runs do not need a widget.
 */

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export function turnstileRequired(): boolean {
  return Boolean(process.env["TURNSTILE_SECRET_KEY"]?.trim());
}

export async function verifyTurnstile(
  request: Request,
): Promise<{ ok: true } | { ok: false; response: Response }> {
  const secret = process.env["TURNSTILE_SECRET_KEY"]?.trim() ?? "";
  if (!secret) return { ok: true };

  const token = request.headers.get("x-turnstile-token")?.trim() ?? "";
  if (!token) {
    return {
      ok: false,
      response: json(
        { error: "Please confirm you are a person, then try again.", code: "turnstile" },
        403,
      ),
    };
  }

  const body = new URLSearchParams({ secret, response: token });
  const remote = request.headers.get("cf-connecting-ip");
  if (remote) body.set("remoteip", remote);

  const result = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body,
    signal: AbortSignal.timeout(8_000),
  });
  const payload = (await result.json().catch(() => ({}))) as { success?: boolean };
  if (!payload.success) {
    return {
      ok: false,
      response: json(
        { error: "That check did not succeed. Please try again.", code: "turnstile" },
        403,
      ),
    };
  }
  return { ok: true };
}
