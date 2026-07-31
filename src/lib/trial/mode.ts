/**
 * Guest ("try before you sign up") mode.
 *
 * The trial lives at /try. Everything about it is derived from the URL rather
 * than from React state, so a reload, a new tab or a background fetch all agree
 * about whether the caller is a guest.
 */
export const TRIAL_PATH = "/try";

const DEVICE_KEY = "wardrobe-trial-device-v1";

export function isGuestMode(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.pathname === TRIAL_PATH || window.location.pathname.startsWith(`${TRIAL_PATH}/`);
}

/** A stable id for this browser, used only to cap free AI runs. */
export function trialDeviceId(): string {
  if (typeof window === "undefined") return "server";
  let value = "";
  try {
    value = window.localStorage.getItem(DEVICE_KEY) ?? "";
  } catch {
    value = "";
  }
  if (!/^[a-z0-9-]{8,64}$/i.test(value)) {
    value =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    try {
      window.localStorage.setItem(DEVICE_KEY, value);
    } catch {
      /* private browsing: a per-session id is fine */
    }
  }
  return value;
}
