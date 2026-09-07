/**
 * How a charge's net divides between named people — and what the platform refuses to guess.
 *
 * The case that matters most here is the one that produces an UNASSIGNED row. Every other billing
 * system's instinct is to give the leftover to "the parent", and the Director's decision is that
 * Alloy does not have one unless somebody said so. These tests hold that line in cents.
 */
import { describe, expect, it } from "vitest";

import {
    resolveResponsibilitySplit,
    responsibilityAllocationKey,
    type ResponsibilityShare,
} from "@/lib/financials/responsibility/resolveResponsibilitySplit";

const ALEX = "11111111-1111-4111-8111-111111111111";
const SAM = "22222222-2222-4222-8222-222222222222";
const JO = "33333333-3333-4333-8333-333333333333";

function share(over: Partial<ResponsibilityShare> & { shareId: string; responsiblePartyId: string; method: ResponsibilityShare["method"] }): ResponsibilityShare {
    return { percentBasisPoints: null, amountCents: null, priority: 100, ...over };
}

const sum = (d: ReturnType<typeof resolveResponsibilitySplit>) =>
    d.kind === "allocated" ? d.allocations.reduce((a, x) => a + x.assignedAmountCents, 0) : NaN;

describe("resolveResponsibilitySplit", () => {
    it("splits 70/30 exactly", () => {
        const d = resolveResponsibilitySplit({
            netCents: 100_000,
            shares: [
                share({ shareId: "s1", responsiblePartyId: ALEX, method: "percentage", percentBasisPoints: 7000, priority: 1 }),
                share({ shareId: "s2", responsiblePartyId: SAM, method: "percentage", percentBasisPoints: 3000, priority: 2 }),
            ],
        });
        expect(d.kind).toBe("allocated");
        if (d.kind !== "allocated") return;
        expect(d.allocations.map((a) => a.assignedAmountCents)).toEqual([70_000, 30_000]);
        expect(sum(d)).toBe(100_000);
        expect(d.unassignedCents).toBe(0);
    });

    it("keeps 70/30 of an odd net exact, to the cent, deterministically", () => {
        // 85,001 → 59,500.7 and 25,500.3. Floors lose a cent; priority order decides who carries it.
        const shares = [
            share({ shareId: "s1", responsiblePartyId: ALEX, method: "percentage", percentBasisPoints: 7000, priority: 1 }),
            share({ shareId: "s2", responsiblePartyId: SAM, method: "percentage", percentBasisPoints: 3000, priority: 2 }),
        ];
        const d = resolveResponsibilitySplit({ netCents: 85_001, shares });
        expect(sum(d)).toBe(85_001);
        if (d.kind !== "allocated") return;
        expect(d.allocations[0]!.assignedAmountCents).toBe(59_501);
        expect(d.allocations[1]!.assignedAmountCents).toBe(25_500);
        expect(d.unassignedCents, "a complete arrangement produces no unassigned penny").toBe(0);
        // Same inputs, same cents — a family's split must not move between runs.
        expect(resolveResponsibilitySplit({ netCents: 85_001, shares })).toEqual(d);
    });

    it("gives a remainder share everything the others did not take", () => {
        const d = resolveResponsibilitySplit({
            netCents: 100_000,
            shares: [
                share({ shareId: "s1", responsiblePartyId: ALEX, method: "fixed", amountCents: 30_000, priority: 1 }),
                share({ shareId: "s2", responsiblePartyId: SAM, method: "remainder", priority: 2 }),
            ],
        });
        expect(sum(d)).toBe(100_000);
        if (d.kind !== "allocated") return;
        expect(d.allocations[1]!.assignedAmountCents).toBe(70_000);
        expect(d.allocations[1]!.basis).toBe("remainder");
        expect(d.unassignedCents).toBe(0);
    });

    it("lets a remainder share absorb the rounding of a percentage beside it", () => {
        const d = resolveResponsibilitySplit({
            netCents: 100_001,
            shares: [
                share({ shareId: "s1", responsiblePartyId: ALEX, method: "percentage", percentBasisPoints: 3333, priority: 1 }),
                share({ shareId: "s2", responsiblePartyId: SAM, method: "remainder", priority: 2 }),
            ],
        });
        expect(sum(d)).toBe(100_001);
        if (d.kind !== "allocated") return;
        expect(d.allocations[0]!.assignedAmountCents).toBe(33_330);
        expect(d.allocations[1]!.assignedAmountCents).toBe(66_671);
    });

    // ── THE DECISION THAT DEFINES THIS THREAD ────────────────────────────────────────────────

    it("records the gap as UNASSIGNED rather than naming anybody for it", () => {
        const d = resolveResponsibilitySplit({
            netCents: 100_000,
            shares: [
                share({ shareId: "s1", responsiblePartyId: ALEX, method: "percentage", percentBasisPoints: 6000, priority: 1 }),
            ],
        });
        expect(sum(d), "the invariant holds even when nobody owns the rest").toBe(100_000);
        if (d.kind !== "allocated") return;
        expect(d.unassignedCents).toBe(40_000);
        const gap = d.allocations.find((a) => a.isUnassigned)!;
        expect(gap.responsiblePartyId, "no person is invented for the gap").toBeNull();
        expect(gap.shareId).toBeNull();
        expect(gap.explanation).toContain("No one has been made responsible");
    });

    it("does the same when a fixed share leaves money over", () => {
        const d = resolveResponsibilitySplit({
            netCents: 100_000,
            shares: [share({ shareId: "s1", responsiblePartyId: ALEX, method: "fixed", amountCents: 25_000, priority: 1 })],
        });
        expect(sum(d)).toBe(100_000);
        if (d.kind !== "allocated") return;
        expect(d.unassignedCents).toBe(75_000);
    });

    // ── ZERO, AND THE REFUSALS ───────────────────────────────────────────────────────────────

    it("allocates a fully discounted month as nothing owed by anyone", () => {
        const d = resolveResponsibilitySplit({
            netCents: 0,
            shares: [
                share({ shareId: "s1", responsiblePartyId: ALEX, method: "percentage", percentBasisPoints: 7000, priority: 1 }),
                share({ shareId: "s2", responsiblePartyId: SAM, method: "percentage", percentBasisPoints: 3000, priority: 2 }),
            ],
        });
        expect(sum(d)).toBe(0);
        if (d.kind !== "allocated") return;
        expect(d.allocations).toHaveLength(2);
        expect(d.unassignedCents).toBe(0);
    });

    it("refuses percentages over 100", () => {
        const d = resolveResponsibilitySplit({
            netCents: 100_000,
            shares: [
                share({ shareId: "s1", responsiblePartyId: ALEX, method: "percentage", percentBasisPoints: 7000, priority: 1 }),
                share({ shareId: "s2", responsiblePartyId: SAM, method: "percentage", percentBasisPoints: 4000, priority: 2 }),
            ],
        });
        expect(d.kind === "refused" && d.reason).toBe("percentage_over_100");
    });

    it("refuses a fixed share larger than the net rather than shrinking it", () => {
        const d = resolveResponsibilitySplit({
            netCents: 50_000,
            shares: [share({ shareId: "s1", responsiblePartyId: ALEX, method: "fixed", amountCents: 60_000, priority: 1 })],
        });
        expect(d.kind === "refused" && d.reason).toBe("fixed_exceeds_net");
    });

    it("refuses fixed plus percentage that together exceed the net", () => {
        const d = resolveResponsibilitySplit({
            netCents: 100_000,
            shares: [
                share({ shareId: "s1", responsiblePartyId: ALEX, method: "fixed", amountCents: 80_000, priority: 1 }),
                share({ shareId: "s2", responsiblePartyId: SAM, method: "percentage", percentBasisPoints: 5000, priority: 2 }),
            ],
        });
        expect(d.kind === "refused" && d.reason).toBe("over_allocated");
    });

    it("refuses an arrangement that names nobody", () => {
        expect(resolveResponsibilitySplit({ netCents: 100_000, shares: [] })).toMatchObject({ reason: "no_shares" });
    });

    it("refuses to divide a negative obligation", () => {
        const d = resolveResponsibilitySplit({
            netCents: -100,
            shares: [share({ shareId: "s1", responsiblePartyId: ALEX, method: "remainder", priority: 1 })],
        });
        expect(d.kind === "refused" && d.reason).toBe("negative_net");
    });

    // ── ORDER AND IDENTITY ───────────────────────────────────────────────────────────────────

    it("divides by priority, not by the order the caller happened to pass", () => {
        const shares = [
            share({ shareId: "s3", responsiblePartyId: JO, method: "percentage", percentBasisPoints: 3400, priority: 3 }),
            share({ shareId: "s1", responsiblePartyId: ALEX, method: "percentage", percentBasisPoints: 3300, priority: 1 }),
            share({ shareId: "s2", responsiblePartyId: SAM, method: "percentage", percentBasisPoints: 3300, priority: 2 }),
        ];
        const d = resolveResponsibilitySplit({ netCents: 100_001, shares });
        expect(sum(d)).toBe(100_001);
        if (d.kind !== "allocated") return;
        expect(d.allocations.map((a) => a.responsiblePartyId)).toEqual([ALEX, SAM, JO]);
    });

    it("keys an allocation on the charge, the arrangement and the share", () => {
        expect(responsibilityAllocationKey("c1", "a1", "s1")).toBe("fra:c1:a1:s1");
        // The gap belongs to the arrangement, not to any authored line.
        expect(responsibilityAllocationKey("c1", "a1", null)).toBe("fra:c1:a1:unassigned");
        expect(responsibilityAllocationKey("c1", "a1", "s1")).not.toBe(responsibilityAllocationKey("c2", "a1", "s1"));
    });
});
