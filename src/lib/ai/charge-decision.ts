export type AiBillingMode = "builtin" | "byok";

/** Whether a run bills the prepaid wallet. Founders and bring-your-own keys do not. */
export function decideAiCharge(input: {
  mode: AiBillingMode;
  founder: boolean;
  chargedPence: number;
}): { chargedPence: number; billable: boolean } {
  if (input.mode === "byok" || input.founder || input.chargedPence <= 0) {
    return { chargedPence: 0, billable: false };
  }
  return { chargedPence: input.chargedPence, billable: true };
}
