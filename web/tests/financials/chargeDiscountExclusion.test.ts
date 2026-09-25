/**
 * WAIVING ONE CHARGE'S DISCOUNT — and the family keeping the policy everywhere else.
 *
 * Driven through the real resolver, because the danger here is not arithmetic: it is the ANSWER.
 * A waiver that collapsed into `no_policy_configured` would tell an operator the family has no
 * discount set up, when in fact they have one and somebody deliberately withheld it once.
 */
import { describe, expect, it } from "vitest";

import { resolveFinancialReductions } from "@/lib/financials/reductions/resolveFinancialReductions";
import { createChargePolicyExclusion } from "@/lib/financials/reductions/chargePolicyExclusionService";
import { REDUCTION_REASON_LABEL } from "@/lib/financials/reductions/reductionReasonLabels";

const POLICY = {
    id: "pol-sibling",
    kind: "sibling_discount" as const,
    label: "Sibling discount (QA specimen)",
    params: { basis: "percentage", value: 10 } as Record<string, unknown>,
    appliesTo: "everything",
};

const gross = { amountCents: 19_500, currencyCode: "USD" };
const facts = { childCount: 2, categoryKey: "tuition" } as never;

const resolve = (over: Record<string, unknown> = {}) =>
    resolveFinancialReductions({ gross, policies: [POLICY] as never, facts, ...over } as never);

describe("charge-level exclusion is its own answer", () => {
    it("an eligible charge receives the policy normally", () => {
        const r = resolve();
        expect(r.kind, JSON.stringify(r)).not.toBe("not_eligible");
    });

    it("waiving THIS charge withholds the policy, and says which decision did it", () => {
        const r = resolve({ chargeExcludedPolicyIds: [POLICY.id] });
        expect(r.kind).toBe("not_eligible");
        expect(r.kind === "not_eligible" && r.reason).toBe("excluded_by_charge_exception");
    });

    it("and is NOT reported as no_policy_configured", () => {
        /*
         * The failure that would matter: an operator reading "no discount policies configured"
         * for a family that has one, because a single charge was waived.
         */
        const r = resolve({ chargeExcludedPolicyIds: [POLICY.id] });
        expect(r.kind === "not_eligible" && r.reason).not.toBe("no_policy_configured");
    });

    it("a relationship exception still reads as a relationship exception", () => {
        const r = resolve({ excludedPolicyIds: [POLICY.id] });
        expect(r.kind === "not_eligible" && r.reason).toBe("excluded_by_exception");
    });

    it("the two reasons are distinguishable to an operator, not just to code", () => {
        expect(REDUCTION_REASON_LABEL.excluded_by_charge_exception).toBe("Waived for this charge");
        expect(REDUCTION_REASON_LABEL.excluded_by_charge_exception)
            .not.toBe(REDUCTION_REASON_LABEL.excluded_by_exception);
    });

    it("a SECOND charge still receives the policy — the waiver is one charge wide", () => {
        // Same policies, same family; this charge simply was not waived.
        const r = resolve({ chargeExcludedPolicyIds: [] });
        expect(r.kind).not.toBe("not_eligible");
    });
});

describe("a waiver cannot be anonymous", () => {
    const client = { from: () => ({ insert: () => ({ select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) } as never;

    it("refuses without a reason, before anything is written", async () => {
        const r = await createChargePolicyExclusion(client, {
            orgId: "org-1", policyId: POLICY.id, chargeId: "chg-1", reason: "  ",
        });
        expect(r.ok).toBe(false);
        expect(!r.ok && r.code).toBe("reason_required");
    });

    it("refuses without a charge, and without a policy", async () => {
        expect((await createChargePolicyExclusion(client, { orgId: "o", policyId: "p", chargeId: "", reason: "because" })).ok).toBe(false);
        expect((await createChargePolicyExclusion(client, { orgId: "o", policyId: "", chargeId: "c", reason: "because" })).ok).toBe(false);
    });

    it("there is no boolean anywhere in this model", () => {
        /*
         * Comments stripped: the module's own prose explains that this is deliberately NOT
         * `discount_enabled`, and a lock that reddened on that sentence would punish the file for
         * saying why it exists.
         */
        const raw = require("node:fs").readFileSync(
            `${process.cwd()}/lib/financials/reductions/chargePolicyExclusionService.ts`, "utf8") as string;
        const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n")
            .filter((l) => !l.trimStart().startsWith("//") && !l.trimStart().startsWith("*")).join("\n");
        expect(src).not.toMatch(/discount_enabled|discountEnabled/);
        expect(src, "the reason is a column, not an afterthought").toContain("reason");
    });
});
