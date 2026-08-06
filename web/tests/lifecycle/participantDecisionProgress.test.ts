/**
 * Family work progress, and the gate that stops the first child from closing it.
 *
 * The progress half is pure, so it is proven without a database. The gate half runs through the
 * real `completeStageWorkWithOutcome` validate phase against an in-memory tenant, because the whole
 * point of the gate is WHERE it runs: before anything is written.
 */

import { describe, it, expect } from "vitest";
import {
    deriveParticipantDecisionProgress,
    resolvedStatesForTemplate,
} from "@/lib/lifecycle/projectParticipantDecisionRows";
import { completeStageWorkWithOutcome } from "@/lib/lifecycle/completeStageWorkWithOutcome";
import {
    parseStageOperatingPlanV1,
    type StageWorkParticipantDecisionV1,
} from "@/lib/lifecycle/stageOperatingPlanV1";

const ORG = "11111111-1111-4111-8111-111111111111";
const LEAD = "33333333-3333-4333-8333-333333333333";

const DECISIONS = [
    {
        decision_key: "child_waitlist",
        action_ref: "waitlist_child",
        label: "Waitlist",
        subject_grain: "child",
        targets: [
            { kind: "update_child_enrollment_status", disposition_key: "waitlisted" },
            { kind: "move_to_stage", stage_key: "waitlist" },
        ],
    },
    {
        decision_key: "child_begin_enrolling",
        action_ref: "enroll_child",
        label: "Begin Enrolling",
        subject_grain: "child",
        targets: [
            { kind: "update_child_enrollment_status", disposition_key: "enrolling" },
            { kind: "move_to_stage", stage_key: "enrolling" },
        ],
    },
    {
        decision_key: "child_not_enrolling",
        action_ref: "update_child_enrollment_status",
        label: "Not Enrolling",
        subject_grain: "child",
        targets: [
            { kind: "update_child_enrollment_status", disposition_key: "not_enrolling" },
            { kind: "move_to_stage", stage_key: "closed_withdrawn" },
        ],
    },
];

function planRaw(gate: boolean) {
    return {
        version: 1,
        lifecycle_key: "enrollment",
        stage_key: "decision",
        journey_segment: "family",
        work_templates: [
            {
                template_key: "review_child_paths",
                label: "Review each child's path",
                required: true,
                due_policy: { kind: "offset_days", days: 2 },
                owner_strategy: "record_owner",
                ...(gate ? { completion_policy: { requires_all_participants_resolved: true } } : {}),
                participant_decisions: DECISIONS,
            },
        ],
        outcomes: [
            { outcome_key: "paths_chosen", label: "Child paths chosen", completes_work: true },
            { outcome_key: "needs_follow_up", label: "Needs follow-up" },
        ],
        outcome_rules: [{ rule_key: "r1", when_outcome_key: "paths_chosen", targets: [{ kind: "mark_stage_work_complete" }] }],
        attention_rules: [],
    };
}

const parsedDecisions = (): StageWorkParticipantDecisionV1[] =>
    parseStageOperatingPlanV1(planRaw(true))!.work_templates[0]!.participant_decisions!;

describe("participant progress derivation", () => {
    it("derives what counts as resolved from configuration, not a hardcoded list", () => {
        expect([...resolvedStatesForTemplate(parsedDecisions())].sort()).toEqual([
            "enrolling",
            "not_enrolling",
            "waitlisted",
        ]);
    });

    it("counts 1 of 3, 2 of 3, then all", () => {
        const decisions = parsedDecisions();
        const at = (states: Array<string | null>) =>
            deriveParticipantDecisionProgress({
                participants: states.map((state) => ({ state })),
                decisions,
            });

        expect(at([null, null, null]).summary).toBe("0 of 3 children decided");
        expect(at(["waitlisted", null, null]).summary).toBe("1 of 3 children decided");
        expect(at(["waitlisted", "enrolling", null]).summary).toBe("2 of 3 children decided");

        const complete = at(["waitlisted", "enrolling", "not_enrolling"]);
        expect(complete.summary).toBe("All children have a path");
        expect(complete.completion_hint).toBe("You can now complete this step.");
        expect(complete.all_resolved).toBe(true);
        expect(complete.resolved).toBe(3);
    });

    it("does not count a state no configured decision produces", () => {
        // `enrolled` is a real platform state, but no decision on THIS work writes it, so it is not
        // a path this step resolved.
        const progress = deriveParticipantDecisionProgress({
            participants: [{ state: "enrolled" }, { state: "waitlisted" }],
            decisions: parsedDecisions(),
        });
        expect(progress.resolved).toBe(1);
        expect(progress.all_resolved).toBe(false);
    });

    it("is not 'all resolved' when there are no participants at all", () => {
        expect(
            deriveParticipantDecisionProgress({ participants: [], decisions: parsedDecisions() }).all_resolved,
        ).toBe(false);
    });
});

// ── the gate ────────────────────────────────────────────────────────────────────────────────
type PiRow = { id: string; org_id: string; process_key: string; subject_id: string; context_id: string; state: string | null };

function makeSupabase(rows: PiRow[], task: Record<string, unknown>) {
    const DEPT = {
        lifecycle_builder_v1: {
            version: 1,
            active_process_id: "p1",
            processes: [
                {
                    id: "p1",
                    key: "enrollment",
                    name: "Enrollment",
                    primary_entity: "opportunity",
                    sort_order: 0,
                    is_active: true,
                    stages: [
                        {
                            id: "s-decision",
                            key: "decision",
                            label: "Decision",
                            grain: "family",
                            sort_order: 0,
                            is_active: true,
                            stage_operating_plan_v1: planRaw(true),
                        },
                    ],
                },
            ],
        },
    };
    return {
        from(table: string) {
            const builder: Record<string, unknown> = {};
            const filters: Record<string, unknown> = {};
            builder.select = () => builder;
            builder.update = () => builder;
            builder.eq = (c: string, v: unknown) => {
                filters[c] = v;
                return builder;
            };
            builder.maybeSingle = () => {
                if (table === "departments") return Promise.resolve({ data: { metadata: DEPT }, error: null });
                if (table === "operational_tasks") return Promise.resolve({ data: task, error: null });
                return Promise.resolve({ data: null, error: null });
            };
            builder.then = (resolve: (r: { data: unknown; error: unknown }) => void) => {
                if (table === "process_instances") {
                    resolve({ data: rows.filter((r) => r.context_id === filters.context_id), error: null });
                    return;
                }
                resolve({ data: [], error: null });
            };
            return builder;
        },
    } as never;
}

const pi = (id: string, state: string | null): PiRow => ({
    id,
    org_id: ORG,
    process_key: "enrollment",
    subject_id: `child-${id}`,
    context_id: LEAD,
    state,
});

function completePathsChosen(rows: PiRow[]) {
    return completeStageWorkWithOutcome({
        supabase: makeSupabase(rows, { status: "open", due_at: null, metadata: {} }),
        orgId: ORG,
        userId: "user-1",
        departmentId: "dept-1",
        stageKey: "decision",
        workId: "work-1",
        outcomeKey: "paths_chosen",
        subject: { journey_segment: "family", opportunity_id: LEAD },
    });
}

describe("family work is not closed by the first child", () => {
    it("refuses the completing outcome while children remain unresolved, and writes nothing", async () => {
        const result = await completePathsChosen([pi("a", "waitlisted"), pi("b", null), pi("c", null)]);

        expect(result.ok).toBe(false);
        expect(result.error).toContain("1 of 3 children decided");
        expect(result.work_closed).toBe(false);
        // Refused in `validate`, so durable state was never touched — not written and rolled back.
        expect(result.changed).toBe(false);
    });

    it("still refuses when only one child is left", async () => {
        const result = await completePathsChosen([
            pi("a", "waitlisted"),
            pi("b", "enrolling"),
            pi("c", null),
        ]);
        expect(result.ok).toBe(false);
        expect(result.error).toContain("2 of 3 children decided");
    });

    it("allows the completing outcome once every child has a path", async () => {
        const result = await completePathsChosen([
            pi("a", "waitlisted"),
            pi("b", "enrolling"),
            pi("c", "not_enrolling"),
        ]);
        // The gate passed; anything failing now is downstream of it, never the gate itself.
        expect(result.error ?? "").not.toContain("children decided");
    });

    it("explains itself in operator language, naming no status keys", async () => {
        const result = await completePathsChosen([pi("a", "waitlisted"), pi("b", null)]);
        expect(result.error).toContain("Review each child's path");
        expect(result.error).not.toContain("not_enrolling");
        expect(result.error).not.toContain("process_instances");
    });
});
