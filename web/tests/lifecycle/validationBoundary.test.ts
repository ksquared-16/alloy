/**
 * Draft saves and publication ask different questions.
 *
 * `validateProcessCommandSetsForPublish` had exactly one caller — the lifecycle-builder SAVE —
 * and refused it with a 422. Publish never called it at all. The boundary was inverted in both
 * directions: an incomplete draft could not be saved, while a process with orphaned capabilities
 * could be published, because publication never asked.
 *
 * Locked lifecycle:
 *   draft save → structural/referential blocking; command-set completeness reported only
 *   validate   → both blocking
 *   publish    → both blocking
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { validateBusinessProcessForPublish } from "@/lib/businessProcesses/configuration/businessProcessPublishValidation";
import { validateProcessCommandSetsForPublish } from "@/lib/lifecycle/validateProcessCommandSetsForPublish";

/** A structurally valid process whose Work Template uses a capability it has not selected. */
function draftWithCommandGap() {
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
                command_set_v1: { version: 1, commands: [{ capability_key: "update_lead_status", enabled: true }] },
                stages: [
                    {
                        id: "s1",
                        key: "lead",
                        label: "Lead",
                        sort_order: 0,
                        is_active: true,
                        grain: "family",
                        stage_operating_plan_v1: {
                            version: 1,
                            lifecycle_key: "enrollment",
                            stage_key: "lead",
                            journey_segment: "family",
                            work_templates: [
                                {
                                    template_key: "contact_family",
                                    label: "Contact Family",
                                    required: true,
                                    due_policy: { kind: "same_day" },
                                    owner_strategy: "record_owner",
                                    primary_action: { action_ref: "quick_message" },
                                },
                            ],
                            outcomes: [],
                            outcome_rules: [],
                            attention_rules: [],
                        },
                    },
                    { id: "s2", key: "tour", label: "Tour", sort_order: 1, is_active: true, grain: "family" },
                ],
            },
        ],
    };
}

function commandComplete() {
    const c = draftWithCommandGap();
    c.processes[0]!.command_set_v1.commands.push({ capability_key: "quick_message", enabled: true });
    return c;
}

describe("the gap is real and detected", () => {
    it("the command-set validator still reports it", () => {
        const result = validateProcessCommandSetsForPublish(draftWithCommandGap() as never);
        expect(result.ok).toBe(false);
        if (result.ok) throw new Error("expected issues");
        expect(result.issues[0]!.code).toBe("work_template_orphan");
        expect(result.issues[0]!.capabilityKey).toBe("quick_message");
        expect(result.issues[0]!.stageKey).toBe("lead");
    });
});

describe("Validate and Publish block on it", () => {
    // Both routes call this one function; neither carries its own copy.
    it("maps command-set gaps into blocking errors, not warnings", () => {
        const result = validateBusinessProcessForPublish(draftWithCommandGap());
        const blocking = result.errors.filter((e) => e.code === "process_command_set_incomplete");
        expect(blocking.length).toBeGreaterThan(0);
        expect(result.warnings.some((w) => w.code === "process_command_set_incomplete")).toBe(false);
    });

    it("keeps stage context for operator presentation", () => {
        const result = validateBusinessProcessForPublish(draftWithCommandGap());
        const issue = result.errors.find((e) => e.code === "process_command_set_incomplete")!;
        expect(issue.stage_key).toBe("lead");
        expect(issue.message).toContain("quick_message");
    });

    it("passes once the process selects the capability", () => {
        const result = validateBusinessProcessForPublish(commandComplete());
        expect(result.errors.filter((e) => e.code === "process_command_set_incomplete")).toEqual([]);
    });

    it("does not downgrade or lose the issue between save and publish", () => {
        const saveView = validateProcessCommandSetsForPublish(draftWithCommandGap() as never);
        const publishView = validateBusinessProcessForPublish(draftWithCommandGap());
        expect(publishView.errors.filter((e) => e.code === "process_command_set_incomplete")).toHaveLength(
            saveView.ok ? 0 : saveView.issues.length,
        );
    });

    /**
     * Structural failure must reach THIS entry point, not merely the mutator underneath it.
     *
     * An earlier version of this test asserted `dangling_stage_reference` and failed — not because
     * publication was permissive, but because the assertion named the wrong code. The execution
     * graph validator reaches these first and reports them MORE precisely, distinguishing the same
     * two defects the reference copy now distinguishes:
     *
     *   missing transition        -> movement_transition_not_found
     *   missing destination stage -> transition_destination_unknown
     */
    it("blocks a movement whose transition does not exist", () => {
        const broken = draftWithCommandGap();
        const plan = broken.processes[0]!.stages[0]!.stage_operating_plan_v1!;
        plan.outcomes = [{ outcome_key: "x", label: "X" }] as never;
        plan.outcome_rules = [
            { rule_key: "r", when_outcome_key: "x", targets: [{ kind: "move_to_stage", transition_ref: "ghost" }] },
        ] as never;

        const result = validateBusinessProcessForPublish(broken);
        expect(result.errors.some((e) => e.code === "movement_transition_not_found")).toBe(true);
        // Blocking, never downgraded — `warnings` are documented as never blocking.
        expect(result.warnings.some((w) => w.code === "movement_transition_not_found")).toBe(false);
    });

    it("blocks a transition whose destination stage is not configured", () => {
        const broken = draftWithCommandGap();
        (broken.processes[0]!.stages[0]!.stage_operating_plan_v1 as unknown as {
            outgoing_transitions: unknown;
        }).outgoing_transitions = [
            {
                transition_ref: "lead_to_nowhere",
                source_stage_key: "lead",
                target_stage_key: "atlantis",
                label: "x",
                available: true,
            },
        ] as never;

        const result = validateBusinessProcessForPublish(broken);
        expect(result.errors.some((e) => e.code === "transition_destination_unknown")).toBe(true);
        expect(result.warnings.some((w) => w.code === "transition_destination_unknown")).toBe(false);
    });

    it("keeps structural and completeness blockers distinct", () => {
        // Both reach publish, under their own codes — neither masks the other.
        const broken = draftWithCommandGap();
        (broken.processes[0]!.stages[0]!.stage_operating_plan_v1 as unknown as {
            outgoing_transitions: unknown;
        }).outgoing_transitions = [
            {
                transition_ref: "lead_to_nowhere",
                source_stage_key: "lead",
                target_stage_key: "atlantis",
                label: "x",
                available: true,
            },
        ] as never;
        const codes = validateBusinessProcessForPublish(broken).errors.map((e) => e.code);
        expect(codes).toContain("transition_destination_unknown");
        expect(codes).toContain("process_command_set_incomplete");
    });
});

describe("the save path no longer refuses on completeness", () => {
    const route = readFileSync(
        resolve(__dirname, "../../app/api/admin/departments/[departmentId]/lifecycle-builder/route.ts"),
        "utf8",
    );

    it("does not 422 on the command-set check", () => {
        expect(route).not.toContain("process_command_set_invalid");
    });

    it("returns the issues as non-blocking readiness instead", () => {
        expect(route).toContain("publication_readiness");
        expect(route).toContain("ready: commandSetCheck.ok");
    });

    it("keeps the structural gates blocking", () => {
        // dangling references and grain checks must still refuse the save.
        expect(route).toContain("validateConfiguredStageReferences");
        expect(route).toContain("dangling_stage_reference");
        expect(route).toContain("stage_grain_mismatch");
    });
});
