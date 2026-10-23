import { describe, expect, it } from "vitest";
import { decideAiCharge } from "@/lib/ai/charge-decision";
import { mintTrialCookie, readTrialDevice } from "@/lib/trial/cookie.server";
import { decideTrialRun, GLOBAL_DAILY_SPEND_PENCE } from "@/lib/trial/policy";
import { estimateAiCost, formatPence } from "@/lib/ai/pricing";

describe("AI pricing and charging", () => {
  it("quotes a range of stages in pence with the markup applied once", () => {
    const quote = estimateAiCost(["analyze", "cutout"], 2 * 1024 * 1024);
    expect(quote.chargedPence).toBeGreaterThan(quote.costPence);
    expect(quote.markupBps).toBe(2000);
    expect(quote.stages).toHaveLength(2);
    expect(formatPence(quote.chargedPence)).toMatch(/£|p/);
  });

  it("does not bill founders or bring-your-own keys", () => {
    expect(decideAiCharge({ mode: "builtin", founder: true, chargedPence: 40 }).billable).toBe(
      false,
    );
    expect(decideAiCharge({ mode: "byok", founder: false, chargedPence: 40 }).chargedPence).toBe(0);
    expect(decideAiCharge({ mode: "builtin", founder: false, chargedPence: 40 })).toEqual({
      chargedPence: 40,
      billable: true,
    });
  });
});

describe("trial policy", () => {
  const base = {
    deviceCount: 0,
    addressCount: 0,
    globalCount: 0,
    globalSpendPence: 0,
    nextCostPence: 20,
    kind: "analyze" as const,
    hasDevice: true,
    sessionMints: 0,
  };

  it("stops a device, an address, and the global spend ceiling", () => {
    expect(decideTrialRun({ ...base, deviceCount: 4 }).ok).toBe(false);
    expect(decideTrialRun({ ...base, addressCount: 8 }).ok).toBe(false);
    expect(
      decideTrialRun({ ...base, globalSpendPence: GLOBAL_DAILY_SPEND_PENCE - 5, nextCostPence: 20 })
        .reason,
    ).toBe("busy");
    expect(decideTrialRun(base).ok).toBe(true);
  });

  it("refuses a fresh cookie once an address has minted its daily sessions", () => {
    expect(decideTrialRun({ ...base, hasDevice: false, sessionMints: 3 }).reason).toBe("session");
  });
});

describe("trial cookie", () => {
  it("accepts a cookie it signed and rejects a tampered one", async () => {
    const header = await mintTrialCookie("11111111-1111-4111-8111-111111111111");
    expect(header).toBeTruthy();
    const request = new Request("https://wardrobe.test/api", {
      headers: { cookie: header!.split(";")[0]! },
    });
    expect(await readTrialDevice(request)).toBe("11111111-1111-4111-8111-111111111111");

    const tampered = header!.replace("11111111", "22222222");
    const forged = new Request("https://wardrobe.test/api", {
      headers: { cookie: tampered.split(";")[0]! },
    });
    expect(await readTrialDevice(forged)).toBeNull();
  });
});
