/**
 * AN OPERATOR MUST BE TOLD THE FIGURE BEFORE THEY CONFIRM IT.
 *
 * ── THE DEFECT ────────────────────────────────────────────────────────────────────────────────
 *
 * `billing.apply_discounts` previewed by listing the policies IN FORCE — "1 discount policy in
 * force for 2026-09" — and said nothing about money. Confirm then created six reductions worth
 * $237.50 against the recurring gross. The old comment defended this: predicting eligibility would
 * be "telling an operator a number the run might not produce". That reasoning is right about
 * GUESSING and wrong about this — the same function can resolve eligibility for real and decline to
 * write.
 *
 * ── WHAT IS LOCKED ────────────────────────────────────────────────────────────────────────────
 *
 * That preview and execute reach the SAME planner with the SAME period and scope, and that only the
 * mode differs. A preview computed by a second function would be a promise about someone else's
 * work, which is the shape of the cadence defect this thread already closed once.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const planner: Array<Record<string, unknown>> = [];

vi.mock("@/lib/financials/reductions/applyFinancialReductions", () => ({
    applyFinancialReductions: async (_s: unknown, args: Record<string, unknown>) => {
        planner.push(args);
        return {
            periodKey: String(args.periodKey),
            servicePeriod: { start: "2026-09-01", end: "2026-09-30" },
            counts: { applied: 6, unchanged: 1, alreadyPosted: 0, notEligible: 0, refused: 0 },
            outcomes: [
                { kind: "applied", chargeId: "", sourceChargeId: "c-1", customerMemberId: "m-1", amountCents: -1_850, policyIds: ["p"] },
                { kind: "applied", chargeId: "", sourceChargeId: "c-2", customerMemberId: "m-2", amountCents: -14_500, policyIds: ["p"] },
                { kind: "unchanged", sourceChargeId: "c-3", customerMemberId: "m-1" },
            ],
        };
    },
}));

const policiesInForce: Array<Record<string, unknown>> = [
    { id: "5df9fc6c", kind: "sibling_discount", isActive: true, params: { basis: "percentage", value: 10 }, effective: { start: "2026-01-01", end: null } },
];

vi.mock("@/lib/commercial/execution/export/readCommercialConfig", () => ({
    readPolicies: async () => policiesInForce,
}));

vi.mock("@/lib/access/actorPermissionGrants", () => ({
    resolveActorPermissionGrants: async () => ({ permissionKeys: ["fin.write", "fin.adjust"] }),
}));

import {
    BILLING_APPLY_DISCOUNTS_ACTION_KEY,
    financialReductionActions,
} from "@/lib/adminV2/actions/definitions/financialReductionActions";

const action = financialReductionActions.find((a) => a.actionKey === BILLING_APPLY_DISCOUNTS_ACTION_KEY)!;
const ctx = { orgId: "org-1", userId: "u-1" };
const invocation = { entityType: "opportunity_customer_member", entityId: "", payload: {} } as never;

describe("THE GATE — the preview states the money", () => {
    beforeEach(() => { planner.length = 0; });

    it("reports what would be reduced, not merely which policies exist", async () => {
        const preview = await action.buildPreview!({
            supabase: {} as never, ctx, payload: { period_key: "2026-09" }, invocation,
        } as never);
        const summary = (preview as { summary: string }).summary;
        expect(summary, "the count is stated").toMatch(/6 obligations/);
        expect(summary, "and so is the amount").toMatch(/\$163\.50/);
        const after = (preview as { after?: Record<string, unknown> }).after ?? {};
        expect(after.total_reduction_cents).toBe(-16_350);
        expect((after.counts as { applied: number }).applied).toBe(6);
    });

    /* The policies stay, because who qualified is still the explanation for the number. */
    it("keeps the policies in force alongside the figure", async () => {
        const preview = await action.buildPreview!({
            supabase: {} as never, ctx, payload: { period_key: "2026-09" }, invocation,
        } as never);
        expect((preview as { changes: string[] }).changes.join(" ")).toContain("sibling_discount");
    });
});

describe("THE GATE — one planner, two modes", () => {
    beforeEach(() => { planner.length = 0; });

    it("previews through the run's own authority, in preview mode", async () => {
        await action.buildPreview!({ supabase: {} as never, ctx, payload: { period_key: "2026-09" }, invocation } as never);
        expect(planner).toHaveLength(1);
        expect(planner[0]!.mode, "the preview writes nothing").toBe("preview");
        expect(planner[0]!.periodKey).toBe("2026-09");
    });

    it("reaches the same planner with the same period and scope on execute", async () => {
        const payload = { period_key: "2026-09", customer_id: "cust-1" };
        await action.buildPreview!({ supabase: {} as never, ctx, payload, invocation } as never);
        await action.execute!({ supabase: {} as never, ctx, payload, invocation, correlationId: "c-1" } as never);
        expect(planner).toHaveLength(2);
        const [preview, execute] = planner;
        expect(preview!.periodKey).toBe(execute!.periodKey);
        expect(preview!.customerIds).toEqual(execute!.customerIds);
        expect(preview!.mode).toBe("preview");
        expect(execute!.mode ?? "execute").not.toBe("preview");
    });

    /* No policy in force is still an answer, and it costs no planner run. */
    it("says so plainly when nothing is in force", async () => {
        const restore = [...policiesInForce];
        policiesInForce.length = 0;
        const preview = await action.buildPreview!({
            supabase: {} as never, ctx, payload: { period_key: "2026-09" }, invocation,
        } as never);
        expect((preview as { summary: string }).summary).toMatch(/No discount policy is in force/);
        expect(planner, "and asks the planner nothing").toHaveLength(0);
        policiesInForce.push(...restore);
    });
});
