/**
 * THE TUITION CARD MUST KNOW WHICH OPPORTUNITY IT IS ABOUT.
 *
 * ── THE DEFECT ────────────────────────────────────────────────────────────────────────────────
 *
 * `billing_preview` (AssignmentTuitionCard) owns acceptance of recurring tuition terms. It resolved
 * its opportunity as `context.subject.type === "opportunity" ? context.subject.id : null`, which is
 * true only on a case-grain panel. The enrolment Work Unit is child-grain: the lens sets
 * `grain: "child"` and a child subject, and carries the family opportunity's truth beside it.
 *
 * So on the one surface where an operator accepts recurring terms, the card named no opportunity,
 * issued no pricing read at all, and rendered "No assignment on this record to price." Measured on
 * the running app the moment the card first mounted: zero `/api/admin/financial-config` requests.
 *
 * That sentence is the trap. It is ALSO what an assignment-less family legitimately shows, so the
 * card reported a configuration fact while actually reporting its own blindness, and nothing
 * distinguished the two from the outside.
 *
 * ── WHY THESE ASSERTIONS ──────────────────────────────────────────────────────────────────────
 *
 * The child-grain case is the regression. The null cases are the other half of the rule: a child id
 * handed to `/api/admin/financial-config/opportunity/<id>` is a WRONG answer, worse than none, so
 * the resolver's fallback to the subject id is refused rather than passed on.
 */
import { describe, expect, it } from "vitest";

import { resolveAssignmentTuitionOpportunityId } from "@/components/admin/focusPanel/cards/AssignmentTuitionCard";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";

const FAMILY = "e56e72d5-c7bc-41ff-8d34-f5d34fd4160a";
const CHILD = "b5b62172-8b27-44ff-a852-b11b8888a6cd";

const ctx = (
    over: Partial<Pick<OperationalContext, "subject" | "grain" | "truth">>,
): Pick<OperationalContext, "subject" | "grain" | "truth"> => ({
    subject: { type: "child", id: CHILD, label: "Certb Certhouse" },
    grain: "child",
    truth: {},
    ...over,
});

describe("THE GATE — the child-grain panel reaches the family opportunity", () => {
    /* The lens carries the family truth; `truth.id` is the family opportunity. */
    it("resolves the family opportunity from a child subject's settled truth", () => {
        expect(resolveAssignmentTuitionOpportunityId(ctx({ truth: { id: FAMILY } }))).toBe(FAMILY);
    });

    /* The explicit binding wins wherever it is present — the same precedence the panel keeps. */
    it("prefers an explicit family binding over the truth id", () => {
        expect(
            resolveAssignmentTuitionOpportunityId(
                ctx({ truth: { id: "something-else", "child.family_opportunity_id": FAMILY } }),
            ),
        ).toBe(FAMILY);
    });

    it("still resolves a case-grain panel from its own subject", () => {
        expect(
            resolveAssignmentTuitionOpportunityId(
                ctx({ subject: { type: "opportunity", id: FAMILY, label: "Certhouse" }, grain: "case" }),
            ),
        ).toBe(FAMILY);
    });
});

describe("THE GATE — a wrong id is worse than no id", () => {
    /*
     * `resolveFocusPanelMutationOpportunityId` falls back to the subject id. Passing that to an
     * opportunity route asks about a child as though it were an opportunity — the exact class of
     * mistake that produced the household-versus-child billing defect earlier in this thread.
     */
    it("refuses the subject-id fallback when nothing names a family opportunity", () => {
        expect(resolveAssignmentTuitionOpportunityId(ctx({ truth: {} }))).toBeNull();
    });

    it("refuses a commit-critical child truth whose id is the process instance", () => {
        expect(
            resolveAssignmentTuitionOpportunityId(
                ctx({ truth: { id: "proc-1", "child.process_instance_id": "proc-1" } }),
            ),
        ).toBeNull();
    });

    it("never returns the child's own id", () => {
        for (const truth of [{}, { id: CHILD }, { id: "" }]) {
            expect(resolveAssignmentTuitionOpportunityId(ctx({ truth }))).not.toBe(CHILD);
        }
    });
});
