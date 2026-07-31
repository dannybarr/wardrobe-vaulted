/**
 * Small pieces shared by the import API routes: which payment environment a
 * request belongs to, and the polite answer when a member has run out of credit.
 */
import { json } from "@/lib/api/request-context";
import { formatPence } from "@/lib/ai/pricing";

export function environmentFromRequest(request: Request): "sandbox" | "live" {
  return new URL(request.url).searchParams.get("env") === "live" ? "live" : "sandbox";
}

export function insufficientCredit(charge: {
  requiredPence: number;
  balancePence: number;
}): Response {
  return json(
    {
      error: `This step costs ${formatPence(charge.requiredPence)} and your balance is ${formatPence(
        charge.balancePence,
      )}. Top up your AI credit, or switch to your own OpenAI key.`,
      code: "insufficient_credit",
      requiredPence: charge.requiredPence,
      balancePence: charge.balancePence,
    },
    402,
  );
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** Accepts only a real chroma key, so the browser can never widen the cleanup. */
export function safeChromaKey(value: unknown): string {
  return typeof value === "string" && HEX_COLOR.test(value) ? value.toLowerCase() : "#00ff00";
}

export function safeDirection(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 1200) : null;
}
