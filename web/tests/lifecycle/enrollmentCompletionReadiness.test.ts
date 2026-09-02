/**
 * The operator's readiness story.
 *
 * What is pinned here is that the story an operator READS and the verdict the gate ENFORCES are the
 * same fact — a surface that says "Ready to enroll" and then gets refused has shown a second
 * opinion — and that the two things an operator must be able to tell apart, satisfied and excepted,
 * stay apart.
 */

import { describe, expect, it } from "vitest";

import {
    describeCompletionEffects,
    projectEnrollmentCompletionReadiness,
} from "@/lib/enrollment/completion/projectEnrollmentCompletionReadiness";
import { evaluateEnrollmentCompletionSufficiency } from "@/lib/enrollment/completion/enrollmentCompletionSufficiency";
import type { EnrollmentRequirementProgress } from "@/lib/enrollment/participantProgress/enrollmentParticipantProgressTypes";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

const req = (
    id: string,
    level: EnrollmentRequirementProgress["level"],
    status: EnrollmentRequirementProgress["status"],
): EnrollmentRequirementProgress =>
    ({ requirement_id: id, kind: "form", artifact: { kind: "form", id: `f-${id}` }, level, status }) as
        EnrollmentRequirementProgress;

const sufficiencyOf = (
    requirements: EnrollmentRequirementProgress[],
    exceptions?: Record<string, { requirement_id: string; reason: string; approved_by: string | null; approved_at: string }>,
) => evaluateEnrollmentCompletionSufficiency({ progress: { requirements }, exceptions });

const EXCEPTION = {
    requirement_id: "immunization",
    reason: "Medical exemption on file with the state.",
    approved_by: "user-admin",
    approved_at: "2026-09-01T00:00:00.000Z",
};

describe("the ready story", () => {
    it("reads as the operator story: complete, resolved, ready", () => {
        const readiness = projectEnrollmentCompletionReadiness({
            sufficiency: sufficiencyOf([
                req("a", "required", "satisfied"),
                req("b", "required", "satisfied"),
                req("c", "enforced", "satisfied"),
            ]),
        });

        expect(readiness.state).toBe("ready");
        expect(readiness.headline).toBe("Enrollment paperwork complete");
        expect(readiness.detail).toBe("3 of 3 requirements resolved");
        expect(readiness.action).toMatchObject({ enabled: true, blocked_reason: null });
        expect(readiness.outstanding).toEqual([]);
    });

    it("counts an EXCEPTED requirement as resolved, and still lists it as a decision", () => {
        const readiness = projectEnrollmentCompletionReadiness({
            sufficiency: sufficiencyOf(
                [req("cis", "required", "satisfied"), req("immunization", "required", "outstanding")],
                { immunization: EXCEPTION },
            ),
        });

        expect(readiness.state).toBe("ready");
        expect(readiness.detail).toBe("2 of 2 requirements resolved");
        // Resolved, but NOT dressed up as satisfied: the decision travels with it.
        expect(readiness.exceptions).toHaveLength(1);
        expect(readiness.exceptions[0]).toMatchObject({
            requirement_id: "immunization",
            status: "outstanding",
            exception: { reason: EXCEPTION.reason, approved_by: "user-admin" },
        });
    });

    it("keeps advisory requirements OUT of the fraction, so count and verdict agree", () => {
        const readiness = projectEnrollmentCompletionReadiness({
            sufficiency: sufficiencyOf([
                req("a", "required", "satisfied"),
                req("b", "recommended", "outstanding"),
            ]),
        });

        // Not "1 of 2 resolved · Ready to enroll", which an operator has to stop and reconcile.
        expect(readiness.state).toBe("ready");
        expect(readiness.detail).toBe("1 of 1 requirements resolved");
        expect(readiness.recommended.map((r) => r.requirement_id)).toEqual(["b"]);
        expect(readiness.counts).toMatchObject({ resolved: 1, accountable: 1, recommended: 1 });
    });

    it("says so plainly when an org configures no Enrollment paperwork at all", () => {
        const readiness = projectEnrollmentCompletionReadiness({ sufficiency: sufficiencyOf([]) });
        expect(readiness.state).toBe("ready");
        expect(readiness.detail).toBe("No Enrollment requirements are configured");
    });
});

describe("the blocked story", () => {
    const readiness = projectEnrollmentCompletionReadiness({
        sufficiency: sufficiencyOf([
            req("tuition_agreement", "required", "outstanding"),
            req("cis", "enforced", "outstanding"),
            req("photo_release", "recommended", "outstanding"),
            req("emergency_contacts", "required", "satisfied"),
        ]),
        labels: { tuition_agreement: "Tuition & Enrollment Agreement", cis: "CIS" },
    });

    it("reads as the operator story: incomplete, N need attention, button off", () => {
        expect(readiness.state).toBe("blocked");
        expect(readiness.headline).toBe("Enrollment paperwork incomplete");
        expect(readiness.detail).toBe("2 requirements need attention");
        expect(readiness.action.enabled).toBe(false);
    });

    it("names WHICH ones, using their human names", () => {
        expect(readiness.outstanding.map((r) => r.label)).toEqual([
            "Tuition & Enrollment Agreement",
            "CIS",
        ]);
        expect(readiness.action.blocked_reason).toContain("Tuition & Enrollment Agreement");
        expect(readiness.action.blocked_reason).toContain("CIS");
    });

    it("carries a reason per outstanding row rather than only a count", () => {
        expect(readiness.outstanding[0]?.reason).toBeTruthy();
    });

    it("does not present an advisory requirement as a reason the button is off", () => {
        expect(readiness.outstanding.map((r) => r.requirement_id)).not.toContain("photo_release");
        expect(readiness.recommended.map((r) => r.requirement_id)).toEqual(["photo_release"]);
    });

    it("falls back to the id when nothing names a requirement — never blank", () => {
        const unlabelled = projectEnrollmentCompletionReadiness({
            sufficiency: sufficiencyOf([req("mystery", "required", "outstanding")]),
        });
        expect(unlabelled.outstanding[0]?.label).toBe("mystery");
    });
});

describe("what the button will do is read from configuration, not assumed", () => {
    const plan = {
        version: 1,
        stage_key: "enrolling",
        journey_segment: "child",
        purpose: "t",
        work_templates: [],
        outcomes: [{ outcome_key: "enrollment_complete", label: "Enrollment complete", successful: true }],
        outcome_rules: [
            {
                rule_key: "complete_to_enrolled",
                when_outcome_key: "enrollment_complete",
                targets: [
                    { kind: "stamp_enrollment_date" },
                    { kind: "update_child_enrollment_status", disposition_key: "enrolled" },
                    { kind: "move_to_stage", stage_key: "enrolled" },
                    { kind: "mark_stage_work_complete" },
                ],
            },
        ],
        attention_rules: [],
    } as unknown as StageOperatingPlanV1;

    it("describes each configured consequence in the operator's words", () => {
        const effects = describeCompletionEffects({ plan, outcomeKey: "enrollment_complete" });
        expect(effects).toEqual([
            "Record the enrollment date.",
            'Set this child\'s enrollment state to "enrolled".',
            'Move the journey to the "enrolled" stage.',
            "Close the open work for this stage.",
        ]);
    });

    it("is empty for an outcome that is not configured here, rather than invented", () => {
        expect(describeCompletionEffects({ plan, outcomeKey: "something_else" })).toEqual([]);
    });

    it("rides along on the readiness projection when the plan is supplied", () => {
        const readiness = projectEnrollmentCompletionReadiness({
            sufficiency: sufficiencyOf([req("a", "required", "satisfied")]),
            plan,
            outcomeKey: "enrollment_complete",
        });
        expect(readiness.effects).toContain('Set this child\'s enrollment state to "enrolled".');
    });
});

describe("the surface and the gate cannot disagree", () => {
    it("is ready exactly when sufficiency is eligible, across every mix", () => {
        const cases: EnrollmentRequirementProgress[][] = [
            [],
            [req("a", "required", "satisfied")],
            [req("a", "required", "outstanding")],
            [req("a", "recommended", "outstanding")],
            [req("a", "required", "unrealized")],
            [req("a", "enforced", "unsupported")],
            [req("a", "required", "satisfied"), req("b", "recommended", "outstanding")],
        ];
        for (const requirements of cases) {
            const sufficiency = sufficiencyOf(requirements);
            const readiness = projectEnrollmentCompletionReadiness({ sufficiency });
            expect(readiness.state === "ready").toBe(sufficiency.eligible);
            expect(readiness.action.enabled).toBe(sufficiency.eligible);
        }
    });
});
