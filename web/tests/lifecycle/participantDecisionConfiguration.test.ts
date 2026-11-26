/**
 * Configuration model for per-child Decision.
 *
 * Proves the shape is CONSUMED rather than hardcoded: labels, order, capability, destination stage,
 * disposition and required inputs all come out of `participant_decisions`, and the parser refuses
 * the shapes that would let a per-child decision touch the family.
 */

import { describe, expect, it } from "vitest";
import {
    parseStageOperatingPlanV1,
    STAGE_PARTICIPANT_DECISION_ALLOWED_TARGET_KINDS,
} from "@/lib/lifecycle/stageOperatingPlanV1";
import { validateStageOperatingPlanOperatingContract } from "@/lib/lifecycle/validateStageOperatingPlanOperatingContract";

const PROCESS_STAGES = [
    { key: "decision", label: "Decision", grain: "family" },
    { key: "waitlist", label: "Waitlist", grain: "child" },
    { key: "enrolling", label: "Enrolling", grain: "child" },
    { key: "closed_withdrawn", label: "Closed / Withdrawn", grain: "child" },
    { key: "closed", label: "Closed", grain: "family" },
];

function decisionPlanRaw(overrides?: {
    decisions?: unknown[];
    completionPolicy?: Record<string, unknown>;
}) {
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
                ...(overrides?.completionPolicy ? { completion_policy: overrides.completionPolicy } : {}),
                participant_decisions: overrides?.decisions ?? [
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
                        required_inputs: [
                            {
                                key: "close_reason_key",
                                label: "Reason",
                                type: "select",
                                required: true,
                                binds_to_target_field: "close_reason_key",
                                options: [
                                    { value: "chose_another_provider", label: "Chose another provider" },
                                    { value: "no_capacity", label: "No suitable capacity" },
                                ],
                            },
                        ],
                    },
                ],
            },
        ],
        outcomes: [
            { outcome_key: "paths_chosen", label: "Child paths chosen", completes_work: true },
            { outcome_key: "needs_follow_up", label: "Needs follow-up" },
        ],
        outcome_rules: [],
        attention_rules: [],
    };
}

describe("participant_decisions configuration model", () => {
    it("parses labels, order, capability, destination stage and disposition from configuration", () => {
        const plan = parseStageOperatingPlanV1(decisionPlanRaw());
        const decisions = plan?.work_templates[0]?.participant_decisions ?? [];

        expect(decisions.map((d) => d.label)).toEqual(["Waitlist", "Begin Enrolling", "Not Enrolling"]);
        // Order is array order — no sort, no priority field.
        expect(decisions.map((d) => d.decision_key)).toEqual([
            "child_waitlist",
            "child_begin_enrolling",
            "child_not_enrolling",
        ]);
        expect(decisions.map((d) => d.action_ref)).toEqual([
            "waitlist_child",
            "enroll_child",
            "update_child_enrollment_status",
        ]);
        expect(
            decisions.map(
                (d) => d.targets.find((t) => t.kind === "update_child_enrollment_status")?.disposition_key,
            ),
        ).toEqual(["waitlisted", "enrolling", "not_enrolling"]);
        expect(
            decisions.map((d) => d.targets.find((t) => t.kind === "move_to_stage")?.stage_key),
        ).toEqual(["waitlist", "enrolling", "closed_withdrawn"]);
    });

    it("carries the explicit required-input binding, never a naming convention", () => {
        const plan = parseStageOperatingPlanV1(decisionPlanRaw());
        const notEnrolling = plan?.work_templates[0]?.participant_decisions?.[2];
        expect(notEnrolling?.required_inputs?.[0]?.binds_to_target_field).toBe("close_reason_key");
        expect(notEnrolling?.required_inputs?.[0]?.options).toHaveLength(2);
    });

    it("drops an input binding that was never declared, even when the key matches a target field", () => {
        // The same key, WITHOUT `binds_to_target_field`. A convention-based implementation would
        // bind it; this one must not.
        const plan = parseStageOperatingPlanV1(
            decisionPlanRaw({
                decisions: [
                    {
                        decision_key: "child_not_enrolling",
                        action_ref: "update_child_enrollment_status",
                        subject_grain: "child",
                        targets: [{ kind: "update_child_enrollment_status", disposition_key: "not_enrolling" }],
                        required_inputs: [
                            { key: "close_reason_key", label: "Reason", type: "text", required: true },
                        ],
                    },
                ],
            }),
        );
        expect(
            plan?.work_templates[0]?.participant_decisions?.[0]?.required_inputs?.[0]?.binds_to_target_field,
        ).toBeUndefined();
    });

    it("refuses a family-status target on a per-child decision", () => {
        const plan = parseStageOperatingPlanV1(
            decisionPlanRaw({
                decisions: [
                    {
                        decision_key: "sneaky_family_close",
                        action_ref: "close_lead",
                        subject_grain: "child",
                        targets: [
                            { kind: "update_child_enrollment_status", disposition_key: "not_enrolling" },
                            { kind: "update_family_case_status", status_key: "closed" },
                        ],
                    },
                ],
            }),
        );
        const kinds = plan?.work_templates[0]?.participant_decisions?.[0]?.targets.map((t) => t.kind);
        expect(kinds).toEqual(["update_child_enrollment_status"]);
        expect(kinds).not.toContain("update_family_case_status");
        expect(STAGE_PARTICIPANT_DECISION_ALLOWED_TARGET_KINDS).not.toContain("update_family_case_status");
    });

    it("refuses a decision declaring family grain, and one with no state target", () => {
        const familyGrain = parseStageOperatingPlanV1(
            decisionPlanRaw({
                decisions: [
                    {
                        decision_key: "x",
                        action_ref: "waitlist_child",
                        subject_grain: "family",
                        targets: [{ kind: "update_child_enrollment_status", disposition_key: "waitlisted" }],
                    },
                ],
            }),
        );
        expect(familyGrain?.work_templates[0]?.participant_decisions).toEqual([]);

        const noState = parseStageOperatingPlanV1(
            decisionPlanRaw({
                decisions: [
                    {
                        decision_key: "x",
                        action_ref: "waitlist_child",
                        subject_grain: "child",
                        targets: [{ kind: "move_to_stage", stage_key: "waitlist" }],
                    },
                ],
            }),
        );
        expect(noState?.work_templates[0]?.participant_decisions).toEqual([]);
    });

    it("keeps the family completion gate on the work template", () => {
        const plan = parseStageOperatingPlanV1(
            decisionPlanRaw({ completionPolicy: { requires_all_participants_resolved: true } }),
        );
        expect(plan?.work_templates[0]?.completion_policy?.requires_all_participants_resolved).toBe(true);
    });
});

describe("participant_decisions authoring validation", () => {
    const validate = (raw: ReturnType<typeof decisionPlanRaw>) =>
        validateStageOperatingPlanOperatingContract({
            plan: parseStageOperatingPlanV1(raw)!,
            processStages: PROCESS_STAGES,
        });

    it("accepts the canonical three-path configuration", () => {
        const issues = validate(decisionPlanRaw()).filter((i) =>
            i.code.startsWith("participant_"),
        );
        expect(issues).toEqual([]);
    });

    it("refuses a per-child decision that sends a child to a family-grain stage", () => {
        const issues = validate(
            decisionPlanRaw({
                decisions: [
                    {
                        decision_key: "child_close",
                        action_ref: "update_child_enrollment_status",
                        label: "Not Enrolling",
                        subject_grain: "child",
                        targets: [
                            { kind: "update_child_enrollment_status", disposition_key: "not_enrolling" },
                            // `closed` is the FAMILY close stage.
                            { kind: "move_to_stage", stage_key: "closed" },
                        ],
                    },
                ],
            }),
        );
        const found = issues.find((i) => i.code === "participant_decision_destination_grain_mismatch");
        expect(found).toBeTruthy();
        expect(found?.decision_key).toBe("child_close");
        expect(found?.message).toContain("the family case");
        // Operator language, not vocabulary keys.
        expect(found?.message).not.toContain("closed_withdrawn");
    });

    it("refuses a destination the process does not configure", () => {
        const issues = validate(
            decisionPlanRaw({
                decisions: [
                    {
                        decision_key: "child_nowhere",
                        action_ref: "waitlist_child",
                        subject_grain: "child",
                        targets: [
                            { kind: "update_child_enrollment_status", disposition_key: "waitlisted" },
                            { kind: "move_to_stage", stage_key: "not_a_stage" },
                        ],
                    },
                ],
            }),
        );
        expect(issues.some((i) => i.code === "participant_decision_destination_invalid")).toBe(true);
    });

    it("refuses a binding no target can carry, and a select with no options", () => {
        const issues = validate(
            decisionPlanRaw({
                decisions: [
                    {
                        decision_key: "child_waitlist",
                        action_ref: "waitlist_child",
                        subject_grain: "child",
                        // `move_to_stage` cannot carry a close reason and there is no other acceptor.
                        targets: [
                            { kind: "update_child_enrollment_status", disposition_key: "waitlisted" },
                        ],
                        required_inputs: [
                            {
                                key: "note",
                                label: "Note",
                                type: "select",
                                required: false,
                                options: [],
                            },
                        ],
                    },
                ],
            }),
        );
        expect(issues.some((i) => i.code === "participant_decision_input_options_missing")).toBe(true);
    });

    it("refuses a completion gate on a work item with no per-child paths", () => {
        const issues = validate(
            decisionPlanRaw({
                decisions: [],
                completionPolicy: { requires_all_participants_resolved: true },
            }),
        );
        expect(
            issues.some((i) => i.code === "participant_resolution_gate_without_decisions"),
        ).toBe(true);
    });
});
