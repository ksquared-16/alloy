/**
 * A FAILED READ IS NOT AN EMPTY RESULT.
 *
 * ── THE DEFECT ────────────────────────────────────────────────────────────────────────────────
 *
 * `buildOpportunityTuitionViews` read the assignments with `const { data } = await …` and returned
 * `data ?? []`. So a query that FAILED and an opportunity that genuinely has no assignments produced
 * the identical answer: the route replied 200 with `{"enrollments": [], "assignments": []}`, and the
 * Tuition card rendered "No assignment on this record to price."
 *
 * Measured on the running app: two assignment rows were created through the registered route and
 * confirmed present — the Children card listed them by their OCM ids — while the pricing read kept
 * answering with none. There was no way to tell a broken query from an empty table from outside,
 * which is the same silence that cost this thread several runs on the published-layout defect.
 *
 * ── WHAT IS LOCKED ────────────────────────────────────────────────────────────────────────────
 *
 * Not the error text. That a read failure REACHES the caller instead of being laundered into a
 * business answer — and that a genuinely empty opportunity still answers empty, because turning
 * every quiet family into an error would be the opposite mistake.
 */
import { describe, expect, it } from "vitest";

import {
    buildAssignmentTuitionView,
    buildOpportunityTuitionViews,
} from "@/lib/enrollment/pricing/buildAssignmentTuitionView";

/** The two shapes the assignment read can come back as, and nothing else. */
function clientReturning(result: { data: unknown; error: { message: string } | null }) {
    const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => chain,
        is: () => chain,
        limit: () => chain,
        maybeSingle: () => Promise.resolve(result),
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
    };
    return { from: () => chain } as never;
}

const ARGS = { orgId: "org-1", opportunityId: "opp-1" };

describe("THE GATE — the assignment read speaks when it fails", () => {
    it("throws instead of reporting an opportunity with no assignments", async () => {
        const supabase = clientReturning({
            data: null,
            error: { message: 'could not find a relationship between "opportunity_customer_members" and "customer_members"' },
        });
        await expect(buildOpportunityTuitionViews(supabase, ARGS)).rejects.toThrow(/reading assignments failed/);
    });

    /* The failure must name what broke, or the next investigator is back to guessing. */
    it("carries the database's own message to the caller", async () => {
        const supabase = clientReturning({ data: null, error: { message: "permission denied for table" } });
        await expect(buildOpportunityTuitionViews(supabase, ARGS)).rejects.toThrow(/permission denied for table/);
    });

    /*
     * THE OTHER HALF OF THE RULE. A family with no children enrolled is an ordinary answer, and it
     * must stay an answer — an empty list, not an error.
     */
    it("still answers empty for an opportunity that truly has no assignments", async () => {
        const supabase = clientReturning({ data: [], error: null });
        await expect(buildOpportunityTuitionViews(supabase, ARGS)).resolves.toEqual([]);
    });
});

describe("THE GATE — a database failure is not a child with no assignment", () => {
    /*
     * `readAssignmentPricingFacts` distinguishes `assignment_not_found` from `db_error`, and the
     * view collapsed both into null. Both callers then said the same thing in different words:
     * `assignments: []` from the opportunity read, `no_assignment_for_child` from the quote route
     * — the identical sentence a genuinely unassigned child gets.
     */
    it("throws when the facts read failed, carrying the database message", async () => {
        const supabase = clientReturning({ data: null, error: { message: "column x does not exist" } });
        await expect(
            buildAssignmentTuitionView(supabase, { orgId: "org-1", opportunityCustomerMemberId: "ocm-1" }),
        ).rejects.toThrow(/reading assignment facts failed/);
    });

    /* An assignment that is genuinely absent stays a null view — that is a real business answer. */
    it("still answers null for an assignment that does not exist", async () => {
        const supabase = clientReturning({ data: null, error: null });
        await expect(
            buildAssignmentTuitionView(supabase, { orgId: "org-1", opportunityCustomerMemberId: "ocm-1" }),
        ).resolves.toBeNull();
    });

    /* And an empty id never reaches the database at all. */
    it("answers null for an unnamed assignment without querying", async () => {
        const supabase = clientReturning({ data: null, error: { message: "should not be reached" } });
        await expect(
            buildAssignmentTuitionView(supabase, { orgId: "org-1", opportunityCustomerMemberId: "  " }),
        ).resolves.toBeNull();
    });
});
