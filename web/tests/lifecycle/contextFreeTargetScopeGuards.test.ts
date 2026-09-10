import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The evaluator is observed rather than stubbed out of the way: the contract is about WHETHER it
 * is reached and with WHAT, and a first attempt that used a throwing Supabase proxy could not tell
 * the difference between "the guard returned early" and "the evaluator ran but short-circuited on
 * empty department metadata before touching the database". It short-circuits, so that test passed
 * for the wrong reason in one direction and failed in the other.
 */
const evaluateTransitionRequirementPreflight = vi.fn(
    // The argument is typed, not inferred: an untyped `vi.fn(async () => …)` has zero parameters,
    // so passing one is an error and `mock.calls[0][0]` indexes an empty tuple. Both only surface
    // under `typecheck:tests`, which is the config that includes this directory.
    async (_args: { readonly opportunityId: string }) => ({
        missingRequirements: [] as unknown[],
        blockingRequirements: [] as unknown[],
    }),
);
vi.mock("@/lib/lifecycle/evaluateTransitionRequirementPreflight", () => ({
    evaluateTransitionRequirementPreflight: (args: unknown) =>
        evaluateTransitionRequirementPreflight(args as never),
}));

import { preflightStageChangingOutcomeReadiness } from "@/lib/lifecycle/preflightStageChangingOutcomeReadiness";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import type { StageOutcomeExecutionSubject } from "@/lib/lifecycle/stageOutcomeRuleTargetExecutor";

/**
 * WIDENING THE SUBJECT TYPE WAS HALF THE FIX; THE CONSUMERS WERE THE OTHER HALF.
 *
 * `opportunity_id` became `string | null` so a context-free caller could state absence instead of
 * encoding it as `""`. Every consumer downstream still declared `opportunityId: string`, so the
 * branch carried 11 type errors and could not be promoted — and the errors were not cosmetic. Each
 * one marked a real place where `null` would have travelled into an `.eq()` on a uuid column, which
 * is precisely the failure the normalization existed to end.
 *
 * The consumers split into two kinds, and this pins both:
 *
 *   - work that is genuinely Opportunity-scoped (the family case, next work, materialization,
 *     the contact trace, transition requirements) now says so by NAME when there is no
 *     acquisition episode, instead of passing absence down a layer;
 *   - work that is not (the queue-refresh hint) simply admits null.
 *
 * A named refusal matters more than it looks. Falling through to the family close guard produced
 * `child_track_enumeration_failed` — "the guard could not see the children" — for a subject that
 * has no family case at all. That is a database-sounding error for a configuration truth.
 */

const CONTEXT_FREE: StageOutcomeExecutionSubject = {
    journey_segment: "child",
    opportunity_id: null,
    customer_member_id: "11111111-1111-4111-8111-111111111111",
    process_instance_id: "33333333-3333-4333-8333-333333333333",
};

const supabase = {} as never;

const planWithStageMove: StageOperatingPlanV1 = {
    stage_key: "enrolling",
    work_templates: [],
    outcomes: [{ outcome_key: "enrollment_complete", label: "Complete Enrollment" }],
    outcome_rules: [
        {
            rule_key: "complete_enrollment_behavior",
            // `when_outcome_key`, not `outcome_key` — the first draft of this fixture used the
            // latter, `outcomeRulesForKey` matched nothing, and the preflight returned not-blocked
            // from its empty-destinations branch. Both tests below passed without ever reaching the
            // guard they exist to pin. The second test is what exposed it.
            when_outcome_key: "enrollment_complete",
            targets: [{ kind: "move_to_stage", stage_key: "enrolled" }],
        },
    ],
} as unknown as StageOperatingPlanV1;

function executorSource(): string {
    return readFileSync(
        join(process.cwd(), "lib", "lifecycle", "stageOutcomeRuleTargetExecutor.ts"),
        "utf8",
    );
}

describe("context-free subjects and Opportunity-scoped targets", () => {
    beforeEach(() => {
        evaluateTransitionRequirementPreflight.mockClear();
    });

    it("does not block a stage move on requirements read off a record the child does not have", async () => {
        /*
         * `evaluateTransitionRequirementPreflight` builds its context from the Opportunity, so with
         * none there is nothing to evaluate. Not-blocked is the answer, and it is reached without
         * consulting the evaluator at all — which is the part that matters, since consulting it
         * with a null is how the invalid uuid used to travel.
         */
        const readiness = await preflightStageChangingOutcomeReadiness({
            supabase,
            orgId: "44444444-4444-4444-8444-444444444444",
            plan: planWithStageMove,
            outcomeKey: "enrollment_complete",
            subject: CONTEXT_FREE,
            departmentMetadata: {},
        });

        expect(readiness.blocked).toBe(false);
        expect(readiness.blockingRequirements).toEqual([]);
        expect(readiness.message).toBeNull();
        // The destinations DO resolve here, so this is the guard answering rather than the
        // empty-destinations branch above it.
        expect(evaluateTransitionRequirementPreflight).not.toHaveBeenCalled();
    });

    it("still evaluates requirements when there IS an acquisition episode", async () => {
        // The guard must be about absence ONLY. With an Opportunity the evaluator is reached, and
        // reached with that id — otherwise the guard would have quietly loosened a real gate.
        const readiness = await preflightStageChangingOutcomeReadiness({
            supabase,
            orgId: "44444444-4444-4444-8444-444444444444",
            plan: planWithStageMove,
            outcomeKey: "enrollment_complete",
            subject: { ...CONTEXT_FREE, opportunity_id: "55555555-5555-4555-8555-555555555555" },
            departmentMetadata: {},
        });

        expect(readiness.blocked).toBe(false);
        expect(evaluateTransitionRequirementPreflight).toHaveBeenCalledTimes(1);
        expect(evaluateTransitionRequirementPreflight.mock.calls[0][0]).toMatchObject({
            opportunityId: "55555555-5555-4555-8555-555555555555",
        });
    });

    it("refuses the family-case target by name rather than by a null uuid", () => {
        const src = executorSource();
        expect(src).toContain("update_family_case_status needs a family case");
        // The narrowed local is what the writes use — if this reverts to `subject.opportunity_id`
        // the null reaches `.eq(\"id\", ...)` again and the type stops complaining.
        expect(src).toContain("opportunityId: familyCaseId");
        expect(src).toContain('.eq("id", familyCaseId)');
    });

    it("refuses create_next_work by name, because stage work hangs off the Opportunity", () => {
        const src = executorSource();
        expect(src).toContain("create_next_work needs an acquisition episode");
        expect(src).toContain("opportunityId: nextWorkScopeId");
    });

    it("degrades enrollment materialization instead of refusing a durable enrolment", () => {
        /*
         * The ONE case that must not refuse. `update_child_enrollment_status` is child-grain and
         * was already applying correctly for a context-free child while the outcome reported
         * failure. Materialization is the trailing, explicitly non-blocking step — so absence is a
         * degraded effect, exactly like a materializer that throws.
         */
        const src = executorSource();
        expect(src).toContain(
            "enrollment materialization did not run: this child has no acquisition episode",
        );
        expect(src).toContain("degradedEffects.push");
        expect(src).not.toContain("opportunityId: subject.opportunity_id,\n                        customerMemberId: childId");
    });
});
