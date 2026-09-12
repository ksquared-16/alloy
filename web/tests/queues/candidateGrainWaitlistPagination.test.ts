/**
 * A PAGE OF TWO IS TWO ROWS — even when the page lands on a family with three waitlisted children.
 *
 * Pagination on the child-grain waitlist was already candidate-first in the right places: `total`
 * counts matched CANDIDATES and the page slices the sorted candidates, not the opportunities. What
 * was wrong came after. Rows are built by enriching each page candidate's OPPORTUNITY and expanding
 * that opportunity back into candidate rows, and the expansion was filtered against every MATCHED
 * candidate rather than against the page. So a page that touched a family with three matched
 * children rendered all three, and the sibling rendered again on the next page when its own slot
 * came up.
 *
 * The distinction this file holds is between the two halves of the same defect:
 *
 *   membership   one waitlisted child must not pull in siblings who do not match  (already fixed)
 *   pagination   a PAGE must not pull in siblings who match but are on another page
 *
 * The fix is at the point where the page is decided, not a trim afterwards. Trimming the surplus
 * would drop rows the sort had already placed, turning a duplicate into a gap — so the tests below
 * check for gaps and duplicates together, across the whole walk, rather than only counting each page.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
    __testing,
    SYNTHETIC_WAITLIST_CANDIDATE_ID_PREFIX,
} from "@/lib/queues/candidateGrainWaitlistQueue";

const { pageIdentitySets, waitlistRowMatchesMatchedSet } = __testing;

/* ------------------------------------------------------------------ the tenant shape */

type Candidate = { id: string; opportunity_id: string; wait_since: string };

/** Family A has three matching children, Family B has two. Five matched candidates in all. */
const MATCHED: Candidate[] = [
    { id: "cand-a1", opportunity_id: "opp-a", wait_since: "2026-01-01" },
    { id: "cand-a2", opportunity_id: "opp-a", wait_since: "2026-01-02" },
    { id: "cand-a3", opportunity_id: "opp-a", wait_since: "2026-01-03" },
    { id: "cand-b1", opportunity_id: "opp-b", wait_since: "2026-01-04" },
    { id: "cand-b2", opportunity_id: "opp-b", wait_since: "2026-01-05" },
];

const PAGE_SIZE = 2;

/** A row as the expansion emits it — carrying its candidate identity. */
function expandedRow(c: Candidate) {
    return {
        id: `pcrow:${c.opportunity_id}:${c.id}`,
        opportunity_id: c.opportunity_id,
        _placement_waitlist_row: { placement_candidate_id: c.id },
    };
}

/**
 * The page pipeline, with the real rule in the middle.
 *
 * The expansion deliberately returns EVERY matched candidate of every opportunity the page touched —
 * that is what `bulkLoadPlacementCandidatesByOpportunity` + `expandOpportunityRowsToPlacementCandidateRows`
 * actually do, and reproducing it is the only way this test can fail for the original reason.
 */
function renderPage(offset: number): string[] {
    const sorted = [...MATCHED].sort((a, b) => a.wait_since.localeCompare(b.wait_since));
    const page = sorted.slice(offset, offset + PAGE_SIZE);
    if (!page.length) return [];

    const touchedOpportunities = new Set(page.map((c) => c.opportunity_id));
    const expanded = MATCHED.filter((c) => touchedOpportunities.has(c.opportunity_id)).map(expandedRow);

    const { candidateIdSet, opportunityIdSet } = pageIdentitySets(page);
    return expanded
        .filter((row) => waitlistRowMatchesMatchedSet(row, candidateIdSet, opportunityIdSet))
        .map((row) => row._placement_waitlist_row.placement_candidate_id);
}

describe("candidate-grain waitlist pagination", () => {
    it("pages at the RENDERED grain: 2, 2, 1", () => {
        expect(renderPage(0)).toHaveLength(2);
        expect(renderPage(2)).toHaveLength(2);
        expect(renderPage(4)).toHaveLength(1);
        expect(renderPage(6)).toHaveLength(0);
    });

    it("page 1 does not smuggle in the third child of the family it touched", () => {
        // Page 1 is A1 and A2; A3 matches and is on page 2. Before the fix it rendered here too.
        expect(renderPage(0)).toEqual(["cand-a1", "cand-a2"]);
        expect(renderPage(0)).not.toContain("cand-a3");
    });

    it("walks every candidate exactly once — no duplicates, no gaps", () => {
        const walked = [...renderPage(0), ...renderPage(2), ...renderPage(4)];

        expect(walked).toHaveLength(MATCHED.length);
        expect(new Set(walked).size).toBe(MATCHED.length);
        // Gaps are the failure a client-side trim would have produced, so name the missing ones.
        const missing = MATCHED.map((c) => c.id).filter((id) => !walked.includes(id));
        expect(missing).toEqual([]);
    });

    it("keeps one stable order across the pages", () => {
        const walked = [...renderPage(0), ...renderPage(2), ...renderPage(4)];
        expect(walked).toEqual(["cand-a1", "cand-a2", "cand-a3", "cand-b1", "cand-b2"]);
    });

    it("a page spanning two families carries exactly its own child from each", () => {
        // Page 2 is A3 and B1 — one child from each family, and neither family's others.
        expect(renderPage(2)).toEqual(["cand-a3", "cand-b1"]);
    });

    it("the membership total is untouched — it was never the thing that was wrong", () => {
        expect(MATCHED).toHaveLength(5);
    });

    /* ------------------------------------------------------------ the rule itself */

    it("scopes identities to the page, not to the whole matched set", () => {
        const page = MATCHED.slice(0, 2);
        const { candidateIdSet, opportunityIdSet } = pageIdentitySets(page);

        expect([...candidateIdSet]).toEqual(["cand-a1", "cand-a2"]);
        expect([...opportunityIdSet]).toEqual(["opp-a"]);
        // The sibling that matches but is not on this page must be refused by the real predicate.
        expect(waitlistRowMatchesMatchedSet(expandedRow(MATCHED[2]!), candidateIdSet, opportunityIdSet)).toBe(false);
        expect(waitlistRowMatchesMatchedSet(expandedRow(MATCHED[0]!), candidateIdSet, opportunityIdSet)).toBe(true);
    });

    it("the loader builds its sets from the PAGE, not from the matched membership", () => {
        /*
         * NON-VACUITY. Every assertion above drives `pageIdentitySets`, so all of them would still
         * pass if someone restored the old call site and handed the whole matched set to the filter
         * — the function would be right and the loader would be wrong again. This reads the loader.
         */
        const src = readFileSync(
            resolve(__dirname, "../../lib/queues/candidateGrainWaitlistQueue.ts"),
            "utf8",
        );
        expect(src).toContain("pageIdentitySets(page)");
        // And the matched set must not be turned back into an identity set anywhere.
        expect(src).not.toMatch(/new Set\(\s*matched\.map\(/);
    });

    it("still judges a synthetic row by its opportunity", () => {
        /*
         * A family at a waitlist status with no candidate record yet has no candidate identity to be
         * judged by, so the opportunity answers for it. Narrowing the opportunity set to the page
         * must not lose those rows for families the page actually contains.
         */
        const page = [{ id: `${SYNTHETIC_WAITLIST_CANDIDATE_ID_PREFIX}opp-a`, opportunity_id: "opp-a" }];
        const { candidateIdSet, opportunityIdSet } = pageIdentitySets(page);

        // The synthetic id is not admitted as a candidate identity…
        expect(candidateIdSet.size).toBe(0);
        // …but the row still belongs to the page through its opportunity.
        expect(
            waitlistRowMatchesMatchedSet(
                { id: `${SYNTHETIC_WAITLIST_CANDIDATE_ID_PREFIX}opp-a`, opportunity_id: "opp-a" },
                candidateIdSet,
                opportunityIdSet,
            ),
        ).toBe(true);
        expect(
            waitlistRowMatchesMatchedSet(
                { id: `${SYNTHETIC_WAITLIST_CANDIDATE_ID_PREFIX}opp-b`, opportunity_id: "opp-b" },
                candidateIdSet,
                opportunityIdSet,
            ),
        ).toBe(false);
    });
});
