/**
 * The numbers behind the guest trial. Kept pure so the caps can be tested
 * without a database. The server records each allowed run before any AI spend.
 */

export type TrialKind = "analyze" | "cutout";

export const DEVICE_CAP: Record<TrialKind, number> = { analyze: 4, cutout: 4 };
export const ADDRESS_DAILY_CAP: Record<TrialKind, number> = { analyze: 8, cutout: 8 };
export const SESSION_MINTS_PER_ADDRESS = 3;
export const GLOBAL_DAILY_CAP = 200;
/** £20 of provider cost across every guest, per day. */
export const GLOBAL_DAILY_SPEND_PENCE = 2_000;

export type TrialDecisionInput = {
  deviceCount: number;
  addressCount: number;
  globalCount: number;
  globalSpendPence: number;
  nextCostPence: number;
  kind: TrialKind;
  hasDevice: boolean;
  sessionMints: number;
};

export type TrialDecision =
  { ok: true } | { ok: false; reason: "signup_required" | "busy" | "session" };

export function decideTrialRun(input: TrialDecisionInput): TrialDecision {
  if (!input.hasDevice && input.sessionMints >= SESSION_MINTS_PER_ADDRESS) {
    return { ok: false, reason: "session" };
  }
  if (input.deviceCount >= DEVICE_CAP[input.kind]) return { ok: false, reason: "signup_required" };
  if (input.addressCount >= ADDRESS_DAILY_CAP[input.kind])
    return { ok: false, reason: "signup_required" };
  if (input.globalCount >= GLOBAL_DAILY_CAP) return { ok: false, reason: "busy" };
  if (input.globalSpendPence + input.nextCostPence > GLOBAL_DAILY_SPEND_PENCE) {
    return { ok: false, reason: "busy" };
  }
  return { ok: true };
}
