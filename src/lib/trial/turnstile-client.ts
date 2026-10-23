/** Holds the latest Turnstile token for guest AI calls. Empty when the widget is off. */

let token = "";

export function setTrialTurnstileToken(value: string) {
  token = value;
}

export function trialTurnstileToken(): string {
  return token;
}

export function turnstileSiteKey(): string {
  const value = import.meta.env["VITE_TURNSTILE_SITE_KEY"];
  return typeof value === "string" ? value : "";
}
