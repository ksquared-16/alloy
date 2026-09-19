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

import { buildOpportunityTuitionViews } from "@/lib/enrollment/pricing/buildAssignmentTuitionView";

/** The two shapes the assignment read can come back as, and nothing else. */
function clientReturning(result: { data: unknown; error: { message: string } | null }) {
    const chain = {
        select: () => chain,
        eq: () => chain,
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
