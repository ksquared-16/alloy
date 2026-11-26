/**
 * The family Decision step's folded state is configuration → journey → rail, never platform words.
 *
 *   published Business Process config: `offered` folds into Decision (`parent_stage_key`), and the
 *   per-child path whose movement lands a child there reads "Offer pending" (`state_label`)
 *     → the rail carries that path on the folded stage (`folded_paths`)
 *   the child's journey records the answer given with the path (`decision_answers_v1`)
 *     → the Children overlay carries it (`_decision_answers_v1`)
 *   → the Business Process card renders Decision · "Offer pending · Infant" (stepperPathTruth).
 */
import { describe, expect, it } from "vitest";

import { buildOpportunityWorkspaceLifecycleRail } from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityWorkspaceLifecycleRail";
import { applyProcessInstanceParticipation } from "@/lib/admin/opportunityEntityRecord";
import type { StatusDefinitionRow } from "@/lib/admin/statusDefinitionsResolve";

const decisionPlan = (stateLabel: string | undefined, available?: boolean) => ({
    version: 1,
    lifecycle_key: "enrollment",
    stage_key: "decision",
    journey_segment: "family",
    work_templates: [
        {
            template_key: "review_child_paths",
            label: "Decide each child's path",
            required: true,
            primary: true,
            due_policy: { kind: "same_day" },
            owner_strategy: "record_owner",
            work_definition_key: "contact_family",
            participant_decisions: [
                {
                    decision_key: "child_offer_spot",
                    action_ref: "update_enrollment_status",
                    label: "Offer spot",
                    ...(stateLabel ? { state_label: stateLabel } : {}),
                    ...(available === false ? { available: false } : {}),
                    subject_grain: "child",
                    targets: [
                        { kind: "update_child_enrollment_status", disposition_key: "waitlisted" },
                        { kind: "move_to_stage", stage_key: "offered" },
                    ],
                },
                {
                    decision_key: "child_waitlist",
                    action_ref: "update_enrollment_status",
                    label: "Waitlist",
                    subject_grain: "child",
                    targets: [
                        { kind: "update_child_enrollment_status", disposition_key: "waitlisted" },
                        { kind: "move_to_stage", stage_key: "waitlist" },
                    ],
                },
            ],
        },
    ],
    outcomes: [{ outcome_key: "paths_chosen", label: "Child paths chosen", completes_work: true }],
    outcome_rules: [],
});

const metadata = (plan: unknown) => ({
    lifecycle_builder_v1: {
        version: 1,
        active_process_id: "p1",
        processes: [
            {
                id: "p1",
                key: "enrollment",
                name: "Enrollment",
                is_active: true,
                stages: [
                    { id: "s1", key: "lead", label: "Lead", sort_order: 0, is_active: true, grain: "family" },
                    { id: "s2", key: "decision", label: "Decision", sort_order: 1, is_active: true, grain: "family", stage_operating_plan_v1: plan },
                    { id: "s3", key: "waitlist", label: "Waitlist", sort_order: 2, is_active: true, grain: "child", allow_skipping: true },
                    { id: "s4", key: "offered", label: "Offer pending", sort_order: 3, is_active: true, grain: "child", parent_stage_key: "decision" },
                    { id: "s5", key: "enrolling", label: "Enrolling", sort_order: 4, is_active: true, grain: "child" },
                ],
            },
        ],
    },
});

const railFor = (plan: unknown) =>
    buildOpportunityWorkspaceLifecycleRail({
        departmentMetadata: metadata(plan),
        statusKey: null,
        stageKey: "decision",
        statusDefs: [] as StatusDefinitionRow[],
    });

describe("folded stage presentation reads from configuration", () => {
    it("the folded stage carries the configured path that lands a child there, in its configured words", () => {
        const offered = railFor(decisionPlan("Offer pending"))?.stages.find((s) => s.key === "offered");
        expect(offered?.parent_stage_key).toBe("decision");
        expect(offered?.folded_paths).toEqual([{ decision_key: "child_offer_spot", state_label: "Offer pending" }]);
        // A path to another stage is not this stage's.
        expect(railFor(decisionPlan("Offer pending"))?.stages.find((s) => s.key === "waitlist")?.folded_paths).toBeUndefined();
    });

    it("follows the configuration: a new state label, or the path's label when none is set", () => {
        expect(railFor(decisionPlan("Spot offered"))?.stages.find((s) => s.key === "offered")?.folded_paths?.[0]?.state_label).toBe("Spot offered");
        expect(railFor(decisionPlan(undefined))?.stages.find((s) => s.key === "offered")?.folded_paths?.[0]?.state_label).toBe("Offer spot");
    });

    it("a hidden path does not speak for the stage", () => {
        expect(railFor(decisionPlan("Offer pending", false))?.stages.find((s) => s.key === "offered")?.folded_paths).toBeUndefined();
    });

    it("the child's recorded answers ride the Children overlay from its own journey", () => {
        const answers = { child_offer_spot: { answers: [{ key: "placement", value: "cat-1", value_label: "Infant" }] } };
        const [child] = applyProcessInstanceParticipation(
            [{ customer_member_id: "c1", custom_fields: {}, metadata: null } as never],
            [{ id: "pi-1", subject_id: "c1", stage_key: "offered", state: "waitlisted", metadata: { decision_answers_v1: answers } } as never],
            new Map(),
        );
        expect((child as { _decision_answers_v1?: unknown })._decision_answers_v1).toEqual(answers);
        expect((child as { stage_key?: string }).stage_key).toBe("offered");
    });
});
