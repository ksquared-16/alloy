/**
 * A PREVIEW MUST EXERCISE THE GATE THE COMMIT WILL.
 *
 * The preview route says so in its own comment — "a preview must exercise the identical gate, or it
 * is not a preview of what will happen" — and it did, for a configured relationship. For a
 * respondent-added child it did not: that proposal fell through to the existing-child plan, which
 * correctly refuses anything Alloy does not already hold ("Only existing child proposals may commit
 * in P5B", 403). Meanwhile the commit route routes exactly that proposal to the registered
 * `add_child` capability and succeeds.
 *
 * Measured on the process-governed certification case: previewing the sibling the family added
 * returned 403 while the commit would have created the child. A preview that disagrees with the
 * commit is worse than no preview — it invites an operator to reject real work.
 *
 * These are source guards on the two routes' routing, because the divergence WAS the defect: the
 * behaviour of each executor is covered by its own suite, and what nothing asserted was that the
 * two doors lead to the same room.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const base = "app/api/admin/processing/cases/[caseId]/related-record-proposals/[proposalId]";
const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const PREVIEW = () => read(`${base}/preview/route.ts`);
const COMMIT = () => read(`${base}/commit/route.ts`);

/** The three execution paths a proposal can take, as each route selects them. */
const DIVERSIONS = [
    {
        name: "configured relationship",
        test: /proposalContext\?\.proposal\.execution_kind === "configured_relationship"/,
        executor: "executeRelationshipProposalCommit",
    },
    {
        name: "respondent-added child",
        test: /proposalContext\?\.proposal\.membership_intent\?\.identity_action === "create_household_child"/,
        executor: "executeNewChildProposalCommit",
    },
];

describe("both routes select the same execution path", () => {
    for (const d of DIVERSIONS) {
        it(`the commit routes a ${d.name} to ${d.executor}`, () => {
            const src = COMMIT();
            expect(src).toMatch(d.test);
            expect(src).toContain(d.executor);
        });

        it(`and the preview routes it to the same executor`, () => {
            const src = PREVIEW();
            expect(src).toMatch(d.test);
            expect(src).toContain(d.executor);
        });
    }

    it("the preview asks for preview only, so it writes nothing", () => {
        const src = PREVIEW();
        // Both diversions, and only the preview, run in preview mode.
        expect(src.match(/previewOnly: true/g)?.length).toBe(2);
        expect(COMMIT()).not.toContain("previewOnly: true");
    });

    it("an existing child still falls through to the plan that owns it, on both", () => {
        expect(PREVIEW()).toContain("previewExistingChildProposalCommit");
        expect(COMMIT()).toContain("executeExistingChildProposalCommit");
    });

    it("the new-child refusal that exposed this is still the existing-child plan's own", () => {
        // Narrowing the refusal was the tempting fix and the wrong one: a create must go to the
        // registered capability, not loosen a reconcile.
        const guard = read("lib/pos/processingCase/commit/verifyExistingChildCommitAuthorization.ts");
        expect(guard).toContain("Only existing child proposals may commit in P5B");
    });
});
