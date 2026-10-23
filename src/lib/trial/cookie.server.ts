/**
 * A guest trial is keyed by an HttpOnly cookie the server signs.
 * A device id invented in the browser is ignored.
 */

const COOKIE = "wv_trial";

function secret(): string | null {
  const configured = process.env["TRIAL_COOKIE_SECRET"]?.trim() ?? "";
  if (configured.length >= 16) return configured;
  if (process.env["NODE_ENV"] === "production") return null;
  return "dev-trial-cookie-secret";
}

function bytesToBase64Url(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function sign(payload: string, key: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(payload));
  return bytesToBase64Url(mac);
}

export async function mintTrialCookie(
  deviceId: string = crypto.randomUUID(),
): Promise<string | null> {
  const key = secret();
  if (!key) return null;
  const issuedAt = Date.now().toString(10);
  const payload = `v1.${deviceId}.${issuedAt}`;
  const mac = await sign(payload, key);
  const value = `${payload}.${mac}`;
  const secure = process.env["NODE_ENV"] === "production" ? "; Secure" : "";
  return `${COOKIE}=${value}; HttpOnly; Path=/; Max-Age=2592000; SameSite=Lax${secure}`;
}

export async function readTrialDevice(request: Request): Promise<string | null> {
  const key = secret();
  if (!key) return null;
  const header = request.headers.get("cookie") ?? "";
  const pair = header
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE}=`));
  if (!pair) return null;
  const value = pair.slice(COOKIE.length + 1);
  const [version, deviceId, issuedAt, mac] = value.split(".");
  if (version !== "v1" || !deviceId || !issuedAt || !mac) return null;
  if (!/^[0-9a-f-]{36}$/i.test(deviceId)) return null;
  const issued = Number(issuedAt);
  if (!Number.isFinite(issued) || Date.now() - issued > 30 * 24 * 60 * 60 * 1000) return null;
  const expected = await sign(`v1.${deviceId}.${issuedAt}`, key);
  if (expected.length !== mac.length) return null;
  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= expected.charCodeAt(index) ^ mac.charCodeAt(index);
  }
  return mismatch === 0 ? deviceId : null;
}

export function trialCookieConfigured(): boolean {
  return secret() !== null;
}
