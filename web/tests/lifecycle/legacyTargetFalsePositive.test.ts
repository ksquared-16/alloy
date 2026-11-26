/**
 * Adding a transition to a stage does not condemn every outcome already on it.
 *
 * Two diagnostics — `legacy_status_close_invalid` and `legacy_work_completion_invalid` — were
 * gated on `plan.outgoing_transitions !== undefined`, read as "this plan was re-authored under the
 * newer outcome model". That proxy is false: the field means only "this stage has at least one
 * transition". Authoring ONE unrelated exit path retroactively invalidated every pre-existing
 * outcome on the stage.
 *
 * It fired for real. Creating `lead_to_tour` and `enrolling_to_enrolled` produced seven blocking
 * errors against `reached_qualified`, `contact_closed_lost`, `enrollment_complete` and
 * `family_withdrew` — outcomes nobody had touched, whose targets have real executors.
 *
 * The schema has no authoring-version marker to gate them on correctly: `StageOperatingPlanV1
 * .version` is the literal `1` on legacy and new plans alike, and `StageCompletionOutcomeV1`
 * carries none. So the diagnostics are withdrawn rather than re-gated on a second guess.
 */

import { describe, expect, it } from "vitest";

import { validateStageOperatingPlanOperatingContract } from "@/lib/lifecycle/validateStageOperatingPlanOperatingContract";
import { validateBusinessProcessForPublish } from "@/lib/businessProcesses/configuration/businessProcessPublishValidation";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

/** Firefly's Lead shape: supported legacy targets, plus the transition that tripped the old gate. */
function leadPlan(withTransition: boolean): StageOperatingPlanV1 {
    return {
        version: 1,
        lifecycle_key: "enrollment",
        stage_key: "lead",
        journey_segment: "family",
        work_templates: [],
        outcomes: [
            { outcome_key: "reached_qualified", label: "Reached / Qualified" },
            { outcome_key: "contact_closed_lost", label: "Closed Lost" },
        ],
        outcome_rules: [
            {
                rule_key: "reached_move",
                when_outcome_key: "reached_qualified",
                targets: [
                    { kind: "update_family_case_status", status_key: "open" },
                    { kind: "mark_stage_work_complete" },
                ],
            },
            {
                rule_key: "contact_closed_lost",
                when_outcome_key: "contact_closed_lost",
                targets: [
                    { kind: "update_family_case_status", status_key: "closed" },
                    { kind: "mark_stage_work_complete" },
                ],
            },
        ],
        attention_rules: [],
        ...(withTransition
            ? {
                  outgoing_transitions: [
                      {
                          transition_ref: "lead_to_tour",
                          source_stage_key: "lead",
                          target_stage_key: "tour",
                          label: "Move to Tour",
                          available: true,
                      },
                  ],
              }
            : {}),
    } as unknown as StageOperatingPlanV1;
}

const STAGES = [
    { key: "lead", label: "Lead", grain: "family" },
    { key: "tour", label: "Tour", grain: "family" },
];

const validate = (plan: StageOperatingPlanV1) =>
    validateStageOperatingPlanOperatingContract({
        plan,
        processStages: STAGES,
        processStageKeys: STAGES.map((s) => s.key),
        transitionOptions: (plan.outgoing_transitions ?? []).map((t) => ({
            transition_ref: t.transition_ref,
            label: t.label,
            target_stage_key: t.target_stage_key,
            target_stage_label: t.target_stage_key,
        })),
    });

describe("an unrelated transition does not invalidate supported targets", () => {
    it("says nothing about the legacy targets before a transition exists", () => {
        expect(validate(leadPlan(false))).toEqual([]);
    });

    it("STILL says nothing after a transition is added — the regression this fixes", () => {
        expect(validate(leadPlan(true))).toEqual([]);
    });

    it("keeps reached_qualified valid", () => {
        const issues = validate(leadPlan(true));
        expect(issues.filter((i) => i.outcome_key === "reached_qualified")).toEqual([]);
    });

    it("keeps contact_closed_lost valid", () => {
        const issues = validate(leadPlan(true));
        expect(issues.filter((i) => i.outcome_key === "contact_closed_lost")).toEqual([]);
    });

    it("no longer emits the withdrawn diagnostics at all", () => {
        const codes = validate(leadPlan(true)).map((i) => i.code as string);
        expect(codes).not.toContain("legacy_status_close_invalid");
        expect(codes).not.toContain("legacy_work_completion_invalid");
    });
});

describe("genuinely malformed configuration is still caught", () => {
    it("flags an outcome whose transition is not an edge", () => {
        const plan = leadPlan(true);
        plan.outcome_rules.push({
            rule_key: "bad",
            when_outcome_key: "reached_qualified",
            targets: [{ kind: "move_to_stage", transition_ref: "ghost" }],
        } as never);
        const codes = validate(plan).map((i) => i.code as string);
        expect(codes).toContain("outcome_transition_invalid");
    });

    it("flags a cross-grain saved path", () => {
        const plan = leadPlan(true);
        plan.outgoing_transitions![0]!.target_stage_key = "waitlist";
        const issues = validateStageOperatingPlanOperatingContract({
            plan,
            processStages: [...STAGES, { key: "waitlist", label: "Waitlist", grain: "child" }],
            processStageKeys: ["lead", "tour", "waitlist"],
        });
        expect(issues.map((i) => i.code as string)).toContain("transition_destination_grain_mismatch");
    });
});

describe("the editor and publication share one contract result", () => {
    /** Points the plan's transition at a child stage — a grain mismatch, which the contract owns. */
    function crossGrain(plan: StageOperatingPlanV1, outcomeKey: string): StageOperatingPlanV1 {
        plan.outgoing_transitions![0]!.target_stage_key = "waitlist";
        plan.outcome_rules.push({
            rule_key: `move_${outcomeKey}`,
            when_outcome_key: outcomeKey,
            targets: [{ kind: "move_to_stage", transition_ref: "lead_to_tour" }],
        } as never);
        return plan;
    }

    function processPayload(plan: StageOperatingPlanV1) {
        return {
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
                    command_set_v1: { version: 1, commands: [] },
                    stages: [
                        {
                            id: "s1",
                            key: "lead",
                            label: "Lead",
                            sort_order: 0,
                            is_active: true,
                            grain: "family",
                            stage_operating_plan_v1: plan,
                        },
                        { id: "s2", key: "tour", label: "Tour", sort_order: 1, is_active: true, grain: "family" },
                        { id: "s3", key: "waitlist", label: "Waitlist", sort_order: 2, is_active: true, grain: "child" },
                    ],
                },
            ],
        };
    }

    it("publication reports nothing when the contract reports nothing", () => {
        const result = validateBusinessProcessForPublish(processPayload(leadPlan(true)));
        expect(result.errors.filter((e) => e.code === "stage_operating_contract")).toEqual([]);
        expect(result.warnings.filter((w) => w.code === "stage_operating_contract")).toEqual([]);
    });

    it("publication surfaces a contract error the editor would also show", () => {
        const plan = crossGrain(leadPlan(true), "reached_qualified");
        const result = validateBusinessProcessForPublish(processPayload(plan));
        const contract = result.errors.filter((e) => e.code === "stage_operating_contract");
        expect(contract.length).toBeGreaterThan(0);
        // A clean Validate must not coexist with stage issues.
        expect(validate(plan).length).toBeGreaterThan(0);
    });

    it("carries stage, outcome and the underlying diagnosis for operator presentation", () => {
        const plan = crossGrain(leadPlan(true), "contact_closed_lost");
        const result = validateBusinessProcessForPublish(processPayload(plan));
        const issue = result.errors.find(
            (e) =>
                e.code === "stage_operating_contract"
                && (e.detail as { outcome_key?: string }).outcome_key === "contact_closed_lost",
        )!;
        expect(issue.stage_key).toBe("lead");
        const detail = issue.detail as { contract_code?: string; outcome_key?: string };
        expect(detail.contract_code).toBeTruthy();
        expect(detail.outcome_key).toBe("contact_closed_lost");
    });

    it("keeps distinct outcomes distinct", () => {
        let plan = crossGrain(leadPlan(true), "reached_qualified");
        plan.outcome_rules.push({
            rule_key: "move_contact_closed_lost",
            when_outcome_key: "contact_closed_lost",
            targets: [{ kind: "move_to_stage", transition_ref: "lead_to_tour" }],
        } as never);
        const result = validateBusinessProcessForPublish(processPayload(plan));
        const outcomes = result.errors
            .filter((e) => e.code === "stage_operating_contract")
            .map((e) => (e.detail as { outcome_key?: string }).outcome_key)
            .filter(Boolean);
        expect(new Set(outcomes)).toEqual(new Set(["reached_qualified", "contact_closed_lost"]));
    });

    it("renders one issue per identity", () => {
        const plan = crossGrain(leadPlan(true), "reached_qualified");
        const result = validateBusinessProcessForPublish(processPayload(plan));
        const keys = result.errors
            .filter((e) => e.code === "stage_operating_contract")
            .map((e) => {
                const d = e.detail as { contract_code?: string; control_id?: string; outcome_key?: string };
                return `${e.stage_key}|${d.control_id}|${d.contract_code}|${d.outcome_key ?? ""}`;
            });
        expect(new Set(keys).size).toBe(keys.length);
    });
});

describe("a pure caller cannot resolve the status catalog, so it does not guess", () => {
    it("skips close-status checks when no catalog is supplied", () => {
        // `undefined` means "cannot evaluate". Defaulting to [] made publication report a missing
        // closed status on every closing outcome — a false positive of exactly the kind removed.
        const plan = leadPlan(true);
        plan.outcome_rules[1]!.targets = [
            { kind: "update_family_case_status", status_key: "closed" },
        ] as never;
        const issues = validateStageOperatingPlanOperatingContract({ plan });
        expect(issues.map((i) => i.code as string)).not.toContain("outcome_close_status_missing");
    });
});
