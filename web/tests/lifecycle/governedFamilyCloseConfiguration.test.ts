/**
 * Governed family close — configuration model and authoring validation.
 *
 * The two halves of the operation have OPPOSITE grain requirements, and getting either backwards
 * produces a close that strands the record it was meant to end. These prove the parser refuses the
 * malformed shapes outright and the validator reports the misdirected ones in operator language.
 */

import { describe, expect, it } from "vitest";
import {
    parseStageOperatingPlanV1,
    STAGE_FAMILY_CLOSE_ALLOWED_FAMILY_TARGET_KINDS,
    STAGE_PARTICIPANT_DECISION_ALLOWED_TARGET_KINDS,
} from "@/lib/lifecycle/stageOperatingPlanV1";
import { validateStageOperatingPlanOperatingContract } from "@/lib/lifecycle/validateStageOperatingPlanOperatingContract";
import { planGovernedFamilyClose } from "@/lib/lifecycle/planGovernedFamilyClose";

const PROCESS_STAGES = [
    { key: "decision", label: "Decision", grain: "family" },
    { key: "waitlist", label: "Waitlist", grain: "child" },
    { key: "closed", label: "Closed", grain: "family" },
    { key: "closed_withdrawn", label: "Closed / Withdrawn", grain: "child" },
];

const STATUSES = [
    { status_key: "open", status_label: "Open", entity_type: "opportunities", is_active: true, metadata: null },
    {
        status_key: "closed",
        status_label: "Closed",
        entity_type: "opportunities",
        is_active: true,
        metadata: { closes_record: true },
    },
];

function planWith(familyClose: unknown) {
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
                due_policy: { kind: "same_day" },
                owner_strategy: "record_owner",
                ...(familyClose ? { family_close: familyClose } : {}),
            },
        ],
        outcomes: [],
        outcome_rules: [],
        attention_rules: [],
    };
}

const CANONICAL = {
    action_ref: "close_lead",
    label: "Close Family",
    child_outcome_label: "Not Enrolling",
    child_targets: [
        { kind: "update_child_enrollment_status", disposition_key: "not_enrolling" },
        { kind: "move_to_stage", stage_key: "closed_withdrawn" },
    ],
    family_targets: [
        { kind: "update_family_case_status", status_key: "closed" },
        { kind: "move_to_stage", stage_key: "closed" },
    ],
    required_inputs: [
        {
            key: "close_reason_key",
            label: "Reason",
            type: "select",
            required: true,
            binds_to_target_field: "close_reason_key",
            options: [{ value: "chose_another_provider", label: "Chose another provider" }],
        },
    ],
};

const parseClose = (fc: unknown) =>
    parseStageOperatingPlanV1(planWith(fc))?.work_templates[0]?.family_close;

describe("family_close configuration model", () => {
    it("parses both halves, the labels and the bound reason", () => {
        const close = parseClose(CANONICAL);
        expect(close?.action_ref).toBe("close_lead");
        expect(close?.label).toBe("Close Family");
        expect(close?.child_outcome_label).toBe("Not Enrolling");
        expect(close?.child_targets.map((t) => t.kind)).toEqual([
            "update_child_enrollment_status",
            "move_to_stage",
        ]);
        expect(close?.family_targets.map((t) => t.kind)).toEqual([
            "update_family_case_status",
            "move_to_stage",
        ]);
        expect(close?.required_inputs?.[0]?.binds_to_target_field).toBe("close_reason_key");
    });

    it("keeps the two target vocabularies separate", () => {
        expect(STAGE_PARTICIPANT_DECISION_ALLOWED_TARGET_KINDS).not.toContain("update_family_case_status");
        expect(STAGE_FAMILY_CLOSE_ALLOWED_FAMILY_TARGET_KINDS).toContain("update_family_case_status");
        expect(STAGE_FAMILY_CLOSE_ALLOWED_FAMILY_TARGET_KINDS).not.toContain(
            "update_child_enrollment_status",
        );
    });

    it("drops a family-status target smuggled into the child half", () => {
        const close = parseClose({
            ...CANONICAL,
            child_targets: [
                { kind: "update_child_enrollment_status", disposition_key: "not_enrolling" },
                { kind: "update_family_case_status", status_key: "closed" },
            ],
        });
        expect(close?.child_targets.map((t) => t.kind)).toEqual(["update_child_enrollment_status"]);
    });

    it("refuses a close missing either half's state write", () => {
        expect(
            parseClose({ ...CANONICAL, child_targets: [{ kind: "move_to_stage", stage_key: "closed_withdrawn" }] }),
        ).toBeUndefined();
        expect(
            parseClose({ ...CANONICAL, family_targets: [{ kind: "move_to_stage", stage_key: "closed" }] }),
        ).toBeUndefined();
    });

    it("refuses two state writes in one half — an ambiguous operation", () => {
        expect(
            parseClose({
                ...CANONICAL,
                child_targets: [
                    { kind: "update_child_enrollment_status", disposition_key: "not_enrolling" },
                    { kind: "update_child_enrollment_status", disposition_key: "withdrawn" },
                ],
            }),
        ).toBeUndefined();
    });
});

describe("family_close authoring validation", () => {
    const validate = (fc: unknown) =>
        validateStageOperatingPlanOperatingContract({
            plan: parseStageOperatingPlanV1(planWith(fc))!,
            processStages: PROCESS_STAGES,
            configuredStatuses: STATUSES,
        }).filter((i) => i.code.startsWith("family_close"));

    it("accepts the canonical configuration", () => {
        expect(validate(CANONICAL)).toEqual([]);
    });

    it("refuses sending children to a family stage", () => {
        const issues = validate({
            ...CANONICAL,
            child_targets: [
                { kind: "update_child_enrollment_status", disposition_key: "not_enrolling" },
                { kind: "move_to_stage", stage_key: "closed" },
            ],
        });
        const found = issues.find((i) => i.code === "family_close_child_destination_grain_mismatch");
        expect(found).toBeTruthy();
        expect(found?.message).toContain("the family case");
        expect(found?.message).not.toContain("closed_withdrawn");
    });

    it("refuses sending the family to a child stage", () => {
        const issues = validate({
            ...CANONICAL,
            family_targets: [
                { kind: "update_family_case_status", status_key: "closed" },
                { kind: "move_to_stage", stage_key: "closed_withdrawn" },
            ],
        });
        expect(
            issues.some((i) => i.code === "family_close_family_destination_grain_mismatch"),
        ).toBe(true);
    });

    it("refuses a close whose family status does not close the record", () => {
        const issues = validate({
            ...CANONICAL,
            family_targets: [{ kind: "update_family_case_status", status_key: "open" }],
        });
        const found = issues.find((i) => i.code === "family_close_status_not_closing");
        expect(found).toBeTruthy();
        expect(found?.message).toContain("leaves the lead itself open");
    });

    it("refuses a destination the process does not configure", () => {
        const issues = validate({
            ...CANONICAL,
            child_targets: [
                { kind: "update_child_enrollment_status", disposition_key: "not_enrolling" },
                { kind: "move_to_stage", stage_key: "nowhere" },
            ],
        });
        expect(issues.some((i) => i.code === "family_close_destination_invalid")).toBe(true);
    });
});

describe("family close planner — classification reuse", () => {
    const rows = (states: Array<[string, string | null]>) =>
        states.map(([id, state], i) => ({ id: `pi-${i}`, subject_id: id, state }));
    const names = new Map([
        ["a", "Emma Rivera"],
        ["b", "Liam Rivera"],
        ["c", "Sophia Rivera"],
    ]);

    it("splits children into closing, skipped and blocking using the shared classifier", () => {
        const plan = planGovernedFamilyClose({
            read: { ok: true, rows: rows([["a", "waitlisted"], ["b", "not_enrolling"], ["c", null]]) },
            childNames: names,
        });
        expect(plan.allowed).toBe(true);
        expect(plan.closing.map((c) => c.label)).toEqual(["Emma Rivera", "Sophia Rivera"]);
        expect(plan.skipped.map((c) => c.label)).toEqual(["Liam Rivera"]);
    });

    it("blocks on enrolled with the exact operator sentence, and offers no override", () => {
        const plan = planGovernedFamilyClose({
            read: { ok: true, rows: rows([["a", "enrolled"], ["b", "waitlisted"]]) },
            childNames: names,
        });
        expect(plan.allowed).toBe(false);
        expect(plan.blocks[0]?.message).toBe(
            "Emma Rivera is already enrolled. This family cannot be closed. End or withdraw "
            + "Emma Rivera's enrollment through the enrolled-child process first.",
        );
        // The live sibling is not offered up as closable while a block stands.
        expect(plan.closing.map((c) => c.label)).toEqual(["Liam Rivera"]);
    });

    it("leads with the enrolled block when several problems exist", () => {
        const plan = planGovernedFamilyClose({
            read: { ok: true, rows: rows([["a", "mystery"], ["b", "enrolled"]]) },
            childNames: names,
        });
        expect(plan.blocks.map((b) => b.code)).toEqual(["child_enrolled", "child_state_unknown"]);
    });

    it("blocks when the children cannot be read, and never reads that as 'no children'", () => {
        const plan = planGovernedFamilyClose({ read: { ok: false, error: "timeout" } });
        expect(plan.allowed).toBe(false);
        expect(plan.blocks[0]?.code).toBe("children_unreadable");
        expect(plan.blocks[0]?.detail).toBe("timeout");
        expect(plan.closing).toEqual([]);
    });

    it("allows a family with no children at all", () => {
        const plan = planGovernedFamilyClose({ read: { ok: true, rows: [] } });
        expect(plan.allowed).toBe(true);
        expect(plan.closing).toEqual([]);
    });
});
