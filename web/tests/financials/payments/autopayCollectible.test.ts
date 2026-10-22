/**
 * WHAT AUTOPAY MAY COLLECT — W7-F051: the payer's eligible responsibility, by the settlement authority.
 *
 * Which charges are owed, due, outstanding and collectible — and whose share they are — is decided
 * by `planSettlement` (its matrix is `w7F050AutomaticSettlement.test.ts`). This suite proves what
 * the Autopay resolver still owns: the timing offset (a charge is actionable once due + offset has
 * arrived), that the arrangement's PAYER is passed through, that the total is the payer's eligible
 * amount, and when to look again.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const planSettlement = vi.fn();
vi.mock("@/lib/financials/settlement/automaticSettlement", () => ({ planSettlement: (...a: unknown[]) => planSettlement(...a) }));

import { actionableOnOrAfter, resolveAutopayCollectible } from "@/lib/financials/payments/autopayCollectible";

const db = (nextDue: string | null) =>
    ({
        from: (table: string) => {
            const chain: Record<string, unknown> = {};
            for (const m of ["select", "eq", "in", "gt", "order"]) chain[m] = () => chain;
            chain.limit = async () => ({ data: nextDue ? [{ due_date: nextDue }] : [], error: null });
            chain.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: table === "child_enrollment_agreements" ? [{ id: "agr-1" }] : [], error: null }).then(ok);
            return chain;
        },
    }) as never;

beforeEach(() => {
    planSettlement.mockReset();
    planSettlement.mockResolvedValue({
        lines: [
            { chargeId: "c-old", effectiveDueOn: "2026-10-01", applyCents: 400_00 },
            { chargeId: "c-new", effectiveDueOn: "2026-10-15", applyCents: 100_00 },
        ],
        eligibleCents: 500_00,
    });
});

describe("the offset moves the day the plan is asked about", () => {
    it("asks as of today when the offset is zero, for the arrangement's payer", async () => {
        const out = await resolveAutopayCollectible(db(null), { orgId: "o", customerId: "h", timingOffsetDays: 0, asOf: "2026-10-21", payerPersonId: "dana" });
        expect(planSettlement).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ householdId: "h", asOf: "2026-10-21", payerPersonId: "dana" }));
        expect(out.totalCents).toBe(500_00);
        expect(out.charges.map((c) => c.chargeId)).toEqual(["c-old", "c-new"]);
    });

    it("a positive offset waits: the plan is asked as of today minus the offset", async () => {
        await resolveAutopayCollectible(db(null), { orgId: "o", customerId: "h", timingOffsetDays: 3, asOf: "2026-10-21", payerPersonId: "dana" });
        expect(planSettlement).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ asOf: "2026-10-18" }));
    });

    it("a negative offset collects ahead of the due date", async () => {
        await resolveAutopayCollectible(db(null), { orgId: "o", customerId: "h", timingOffsetDays: -2, asOf: "2026-10-21", payerPersonId: null });
        expect(planSettlement).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ asOf: "2026-10-23", payerPersonId: null }));
    });

    it("reports when the next not-yet-actionable obligation becomes collectible", async () => {
        const out = await resolveAutopayCollectible(db("2026-11-01"), { orgId: "o", customerId: "h", timingOffsetDays: 2, asOf: "2026-10-21", payerPersonId: "dana" });
        expect(out.nextDueDate).toBe("2026-11-03");
    });

    it("nothing for an empty account id", async () => {
        const out = await resolveAutopayCollectible(db(null), { orgId: "o", customerId: "", timingOffsetDays: 0, asOf: "2026-10-21" });
        expect(out).toEqual({ charges: [], totalCents: 0, nextDueDate: null });
        expect(planSettlement).not.toHaveBeenCalled();
    });

    it("actionableOnOrAfter adds the offset in calendar days", () => {
        expect(actionableOnOrAfter("2026-10-30", 3)).toBe("2026-11-02");
        expect(actionableOnOrAfter("2026-10-01", -1)).toBe("2026-09-30");
    });
});
