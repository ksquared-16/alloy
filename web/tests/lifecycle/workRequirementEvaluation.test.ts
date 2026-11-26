/**
 * REQUIRED WORK BLOCKS A STAGE EXIT ONLY WHERE CONFIGURATION SAYS SO.
 *
 * Tour's `conduct_tour` work is required and primary, and an operator could still move the record
 * on without ever resolving it — the work was real, but `RequirementRefV1` had no way to reference
 * it, so the requirement model simply could not express "this work must be done before leaving".
 *
 * The obvious fix is wrong, and these tests exist mostly to hold that line: "all required work
 * blocks every stage exit" would break Lead → Waitlist, which is a legitimate move while Lead's own
 * Contact Family work is still required and unfinished. Blocking is decided by the authored
 * transition scoping, not by the existence of required work.
 *
 * The second load-bearing property is that completeness is ASKED, never re-derived. Every
 * satisfaction answer here comes from the work runtime's own `state`; nothing counts attempts or
 * reads outcome rows to form a second opinion that could one day disagree with the first.
 */

import { describe, expect, it } from "vitest";

import {
    evaluateWorkRequirements,
    explainWorkRequirementBlockers,
} from "@/lib/lifecycle/workRequirementEvaluation";
import type { StageRequirementV1 } from "@/lib/lifecycle/stageRequirementsV1";
import type { StageWorkItemProjection, StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import type { WorkIntentRuntimeState } from "@/lib/lifecycle/workIntentRuntimeTypes";

/* ------------------------------------------------------------------ fixtures */

function workItem(templateKey: string, state: WorkIntentRuntimeState, label?: string): StageWorkItemProjection {
    return {
        template_key: templateKey,
        label: label ?? templateKey,
        role: "primary",
        state,
        requires_outcome_picker: false,
        work_id: state === "none" ? null : `work-${templateKey}`,
        due_at: null,
        due_urgency: "none",
        attempt_count: 0,
        last_outcome: null,
        completed_at: state === "completed" ? "2026-09-11T00:00:00Z" : null,
        outcomes: [],
        completion_policy_summary: null,
        completion_policy_min_attempts: null,
        completion_policy_max_attempts: null,
        outcome_automation_preview: [],
    };
}

function runtime(items: StageWorkItemProjection[], stageKey = "tour"): StageWorkRuntimeProjection {
    return {
        stage_key: stageKey,
        stage_label: stageKey,
        purpose: null,
        journey_segment: "family",
        template_keys: items.map((i) => i.template_key),
        primary: items[0] ?? null,
        additional: items.slice(1),
        execution: {} as never,
    };
}

/** Tour's requirement as Settings would author it: blocking, on the configured exits only. */
function tourRequirement(overrides: Partial<StageRequirementV1> = {}): StageRequirementV1 {
    return {
        requirement_id: "req-conduct-tour",
        ref: { kind: "work", work_template_key: "conduct_tour" },
        level: "required",
        timing: "stage_exit",
        enforcement: "blocking",
        applies_to_transition_keys: ["tour_to_decision"],
        ...overrides,
    } as StageRequirementV1;
}

const TOUR_TO_DECISION = {
    kind: "transition",
    fromStageKey: "tour",
    toStageKey: "decision",
    transitionKey: "tour_to_decision",
} as const;

describe("work requirements on stage exit", () => {
    it("blocks the configured exit while the work is open", () => {
        const result = evaluateWorkRequirements({
            requirements: [tourRequirement()],
            workRuntime: runtime([workItem("conduct_tour", "open", "Conduct Tour")]),
            moment: TOUR_TO_DECISION,
        });

        expect(result.allowed).toBe(false);
        expect(result.blockers).toHaveLength(1);
        expect(result.blockers[0]!.reason).toBe("work_open");
        expect(result.blockers[0]!.label).toBe("Conduct Tour");
    });

    it("permits the exit once the work runtime reports it complete", () => {
        const result = evaluateWorkRequirements({
            requirements: [tourRequirement()],
            workRuntime: runtime([workItem("conduct_tour", "completed", "Conduct Tour")]),
            moment: TOUR_TO_DECISION,
        });

        expect(result.allowed).toBe(true);
        expect(result.blockers).toEqual([]);
        expect(result.statuses[0]!.satisfied).toBe(true);
        expect(result.statuses[0]!.reason).toBeNull();
    });

    it("asks the work runtime rather than re-deriving completion", () => {
        /*
         * The anti-second-engine proof. `completed_at` is present and there are no outstanding
         * attempts, which is everything a home-grown completion check would look at — but the
         * runtime says `open`, and the runtime is the authority.
         */
        const contradictory = {
            ...workItem("conduct_tour", "open", "Conduct Tour"),
            completed_at: "2026-09-11T00:00:00Z",
        };
        const result = evaluateWorkRequirements({
            requirements: [tourRequirement()],
            workRuntime: runtime([contradictory]),
            moment: TOUR_TO_DECISION,
        });
        expect(result.allowed).toBe(false);
    });

    it("distinguishes work that was never started from work that is waiting", () => {
        const result = evaluateWorkRequirements({
            requirements: [tourRequirement()],
            workRuntime: runtime([]),
            moment: TOUR_TO_DECISION,
        });

        expect(result.blockers[0]!.reason).toBe("work_never_started");
        // And it says so, rather than sending the operator to look for a button that is not there.
        expect(explainWorkRequirementBlockers(result.blockers)).toContain("has not been started");
    });

    /* ------------------------------------------------------------ the transition-scoping line */

    it("THE LEAD REGRESSION — required work does not block an exit it was not scoped to", () => {
        /*
         * Lead → Waitlist is valid today while Lead's Contact Family work is required and open.
         * This is the assertion that fails if anyone ever implements "all required work blocks every
         * exit", which is why it names the real path rather than an abstract one.
         */
        const leadContactWork: StageRequirementV1 = {
            requirement_id: "req-contact-family",
            ref: { kind: "work", work_template_key: "contact_family" },
            level: "required",
            timing: "stage_exit",
            enforcement: "blocking",
            applies_to_transition_keys: ["lead_to_decision"],
        } as StageRequirementV1;

        const result = evaluateWorkRequirements({
            requirements: [leadContactWork],
            workRuntime: runtime([workItem("contact_family", "open")], "lead"),
            moment: {
                kind: "transition",
                fromStageKey: "lead",
                toStageKey: "waitlist",
                transitionKey: "lead_to_waitlist",
            },
        });

        expect(result.allowed).toBe(true);
        expect(result.statuses).toEqual([]);
    });

    it("an excluded transition is exempt even when the requirement has no inclusion list", () => {
        const result = evaluateWorkRequirements({
            requirements: [
                tourRequirement({
                    applies_to_transition_keys: undefined,
                    excluded_transition_keys: ["tour_to_closed"],
                }),
            ],
            workRuntime: runtime([workItem("conduct_tour", "open")]),
            moment: {
                kind: "transition",
                fromStageKey: "tour",
                toStageKey: "closed",
                transitionKey: "tour_to_closed",
            },
        });
        expect(result.allowed).toBe(true);
    });

    it("an unfiltered stage_exit requirement blocks every exit except the excluded ones", () => {
        const unfiltered = tourRequirement({ applies_to_transition_keys: undefined });
        for (const toStageKey of ["decision", "closed"]) {
            const result = evaluateWorkRequirements({
                requirements: [unfiltered],
                workRuntime: runtime([workItem("conduct_tour", "open")]),
                moment: { kind: "transition", fromStageKey: "tour", toStageKey },
            });
            expect(result.allowed, `exit to ${toStageKey}`).toBe(false);
        }
    });

    /* ------------------------------------------------------------ timing and enforcement */

    it("a requirement with no stage_exit timing never gates a movement", () => {
        const result = evaluateWorkRequirements({
            requirements: [tourRequirement({ timing: "stage_progress" })],
            workRuntime: runtime([workItem("conduct_tour", "open")]),
            moment: TOUR_TO_DECISION,
        });
        expect(result.allowed).toBe(true);
        expect(result.statuses).toEqual([]);
    });

    it("attention enforcement reports the gap without stopping the operator", () => {
        const result = evaluateWorkRequirements({
            requirements: [tourRequirement({ enforcement: "attention" })],
            workRuntime: runtime([workItem("conduct_tour", "open")]),
            moment: TOUR_TO_DECISION,
        });

        expect(result.allowed).toBe(true);
        // Unsatisfied and visible — an attention requirement is a real configuration, not a
        // weaker blocking one, so it must still be reported.
        expect(result.statuses[0]!.satisfied).toBe(false);
        expect(result.statuses[0]!.blocking).toBe(false);
    });

    it("recommended work is advice and never gates", () => {
        const result = evaluateWorkRequirements({
            requirements: [tourRequirement({ level: "recommended" })],
            workRuntime: runtime([workItem("conduct_tour", "open")]),
            moment: TOUR_TO_DECISION,
        });
        expect(result.statuses).toEqual([]);
    });

    it("blocking is the default when a requirement does not state enforcement", () => {
        const result = evaluateWorkRequirements({
            requirements: [tourRequirement({ enforcement: undefined })],
            workRuntime: runtime([workItem("conduct_tour", "open")]),
            moment: TOUR_TO_DECISION,
        });
        expect(result.allowed).toBe(false);
    });

    /* ------------------------------------------------------------ boundaries */

    it("answers for work only, leaving other kinds to their own evaluators", () => {
        const formRequirement: StageRequirementV1 = {
            requirement_id: "req-form",
            ref: { kind: "form", form_definition_id: "form-1" },
            level: "required",
            timing: "stage_exit",
            enforcement: "blocking",
        } as StageRequirementV1;

        const result = evaluateWorkRequirements({
            requirements: [formRequirement, tourRequirement()],
            workRuntime: runtime([workItem("conduct_tour", "completed")]),
            moment: TOUR_TO_DECISION,
        });

        // The form is neither satisfied nor failed here — it is simply not this module's question.
        expect(result.statuses.map((s) => s.requirement_id)).toEqual(["req-conduct-tour"]);
    });

    it("finds required work among a stage's secondary work, not only the primary", () => {
        const result = evaluateWorkRequirements({
            requirements: [tourRequirement({ ref: { kind: "work", work_template_key: "send_packet" } })],
            workRuntime: runtime([
                workItem("conduct_tour", "completed"),
                { ...workItem("send_packet", "open"), role: "secondary" },
            ]),
            moment: TOUR_TO_DECISION,
        });
        expect(result.allowed).toBe(false);
        expect(result.blockers[0]!.work_template_key).toBe("send_packet");
    });

    it("the stage-exit projection answers about the stage, not one way out of it", () => {
        // `stage_exit_progress` is the read-only "what would stop me leaving" view, so it reports
        // every stage_exit requirement regardless of which transition might be taken.
        const result = evaluateWorkRequirements({
            requirements: [tourRequirement()],
            workRuntime: runtime([workItem("conduct_tour", "open")]),
            moment: { kind: "stage_exit_progress", stageKey: "tour" },
        });
        expect(result.statuses).toHaveLength(1);
        expect(result.allowed).toBe(false);
    });

    it("no work runtime at all is an honest unsatisfied, not a silent pass", () => {
        const result = evaluateWorkRequirements({
            requirements: [tourRequirement()],
            workRuntime: null,
            moment: TOUR_TO_DECISION,
        });
        expect(result.allowed).toBe(false);
        expect(result.blockers[0]!.reason).toBe("work_never_started");
    });

    it("says nothing when there is nothing to say", () => {
        expect(explainWorkRequirementBlockers([])).toBeNull();
    });
});
