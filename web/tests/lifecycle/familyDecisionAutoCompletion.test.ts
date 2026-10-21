/**
 * The family's Decision work completes itself once every child has a path — through the canonical
 * outcome runtime, on the FAMILY's own item (never a child's), with the runtime-owned outcome.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const complete = vi.fn();
vi.mock("@/lib/lifecycle/completeStageWorkWithOutcome", () => ({
    completeStageWorkWithOutcome: (...a: unknown[]) => complete(...a),
}));

import { completeFamilyDecisionWorkWhenResolved } from "@/lib/lifecycle/completeFamilyDecisionWorkWhenResolved";
import { parseStageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

const plan = parseStageOperatingPlanV1({
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
                    decision_key: "child_waitlist",
                    action_ref: "update_enrollment_status",
                    subject_grain: "child",
                    label: "Waitlist",
                    targets: [
                        { kind: "update_child_enrollment_status", disposition_key: "waitlisted" },
                        { kind: "move_to_stage", stage_key: "waitlist" },
                    ],
                },
            ],
        },
    ],
    outcomes: [
        { outcome_key: "paths_chosen", label: "Child paths chosen", completes_work: true },
        { outcome_key: "needs_follow_up", label: "Needs follow-up" },
    ],
    outcome_rules: [{ rule_key: "done", when_outcome_key: "paths_chosen", targets: [{ kind: "mark_stage_work_complete" }] }],
})!;

const task = (id: string, md: Record<string, unknown>) => ({ id, title: "t", due_at: "", status: "open", source: "business_process", updated_at: "", metadata: { lifecycle_stage_key: "decision", operating_plan_template_key: "review_child_paths", ...md } });
const supabase = (rows: unknown[]) =>
    ({
        from() {
            const b: Record<string, unknown> = {};
            b.select = () => b;
            b.eq = () => b;
            b.then = (resolve: (r: unknown) => void) => resolve({ data: rows, error: null });
            return b;
        },
    }) as never;
const run = (rows: unknown[], allResolved = true) =>
    completeFamilyDecisionWorkWhenResolved({
        supabase: supabase(rows),
        orgId: "org",
        userId: "u",
        departmentId: "dept",
        opportunityId: "opp",
        stageKey: "decision",
        plan,
        template: plan.work_templates[0]!,
        allResolved,
    });

describe("family Decision work completes when every child has a path", () => {
    beforeEach(() => {
        complete.mockReset();
        complete.mockResolvedValue({ ok: true });
    });

    it("records the runtime-owned outcome on the family's own item", async () => {
        const r = await run([task("child-work", { bp_subject_customer_member_id: "ava" }), task("family-work", {})]);
        expect(r).toEqual({ completed: true, work_id: "family-work", outcome_key: "paths_chosen" });
        expect(complete).toHaveBeenCalledTimes(1);
        expect(complete.mock.calls[0]![0]).toMatchObject({ workId: "family-work", outcomeKey: "paths_chosen", subject: { journey_segment: "family", opportunity_id: "opp" } });
        expect(complete.mock.calls[0]![0].idempotencyKey).toContain("family-work:paths_chosen");
        // The runtime's completion is not an operator action: no Activity event of its own.
        expect(complete.mock.calls[0]![0].runtimeRecorded).toBe(true);
    });

    it("does nothing while a child is undecided", async () => {
        expect(await run([task("family-work", {})], false)).toEqual({ completed: false, reason: "not_all_resolved" });
        expect(complete).not.toHaveBeenCalled();
    });

    it("never completes a child's item, and says so when the family has none open", async () => {
        expect(await run([task("child-work", { bp_subject_customer_member_id: "ava" })])).toEqual({ completed: false, reason: "no_open_work" });
        expect(complete).not.toHaveBeenCalled();
    });
});

import { projectStageWorkRuntimeSync } from "@/lib/lifecycle/projectStageWorkRuntime";
import { LIFECYCLE_BUILDER_METADATA_KEY } from "@/lib/lifecycle/lifecycleBuilderConfig";

describe("the Decision card offers child paths and follow-up, not a completion question", () => {
    it("projects per-child work with only the operator's outcomes", () => {
        const projection = projectStageWorkRuntimeSync({
            orgId: "org",
            opportunityId: "opp",
            departmentId: "dept",
            departmentMetadata: {
                [LIFECYCLE_BUILDER_METADATA_KEY]: {
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
                            stages: [{ id: "s-d", key: "decision", label: "Decision", grain: "family", sort_order: 0, is_active: true, stage_operating_plan_v1: plan }],
                        },
                    ],
                },
            },
            builderStageKey: "decision",
            openRows: [task("family-work", {}) as never],
        });
        const primary = projection?.primary;
        expect(primary?.decides_participants).toBe(true);
        expect(primary?.requires_outcome_picker).toBe(true);
        expect(primary?.outcomes.map((o) => o.outcome_key)).toEqual(["needs_follow_up"]);
    });
});
