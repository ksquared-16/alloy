import { describe, expect, it } from "vitest";
import { payoutColumnsForLockedJobTotal, splitLockedTotalByContractorBps } from "@/lib/pricing/jobPricingCore";

describe("payoutColumnsForLockedJobTotal", () => {
  it("returns null when contractor_split_bps is missing (caller should null DB columns)", () => {
    expect(payoutColumnsForLockedJobTotal(26_500, null)).toBeNull();
    expect(payoutColumnsForLockedJobTotal(26_500, undefined)).toBeNull();
  });

  it("returns null for negative bps", () => {
    expect(payoutColumnsForLockedJobTotal(100, -1)).toBeNull();
  });
});

describe("splitLockedTotalByContractorBps (locked total = payout basis)", () => {
  it("matches production example: 26500 @ 7000 bps → floor split, remainder alloy", () => {
    const { contractor_payout_cents, alloy_fee_cents } = splitLockedTotalByContractorBps(26_500, 7000);
    expect(contractor_payout_cents).toBe(Math.floor((26_500 * 7000) / 10_000));
    expect(alloy_fee_cents).toBe(26_500 - contractor_payout_cents);
    expect(contractor_payout_cents + alloy_fee_cents).toBe(26_500);
  });

  it("handles zero total", () => {
    const r = splitLockedTotalByContractorBps(0, 7000);
    expect(r.contractor_payout_cents).toBe(0);
    expect(r.alloy_fee_cents).toBe(0);
  });
});
