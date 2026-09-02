/**
 * The gate on "Complete Enrollment": a governed completion may not bypass requirement sufficiency.
 *
 * The properties pinned here are the ones that make completion honest — it is gated by what the
 * outcome DOES rather than what it is called, an unresolvable check blocks rather than passes, a
 * governed exception lets exactly its own requirement through, and a family that is leaving is
 * never held up by paperwork they were never going to send.
 */

import { describe, expect, it, vi } from "vitest";

import {
    formatCompletionSufficiencyBlockMessage,
    outcomeDurablyEnrolls,
    preflightEnrollmentCompletionSufficiency,
} from "@/lib/enrollment/completion/preflightEnrollmentCompletionSufficiency";
import type { EnrollmentCompletionSufficiency } from "@/lib/enrollment/completion/enrollmentCompletionSufficiency";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

/** A plan carrying one outcome whose targets are supplied by the test. */
function planWith(outcomeKey: string, targets: Array<Record<string, unknown>>): StageOperatingPlanV1 {
    return {
        version: 1,
        stage_key: "enrolling",
        journey_segment: "child",
        purpose: "test",
        work_templates: [],
        outcomes: [{ outcome_key: outcomeKey, label: outcomeKey, successful: true }],
        outcome_rules: [{ rule_key: "r", when_outcome_key: outcomeKey, targets }],
        attention_rules: [],
    } as unknown as StageOperatingPlanV1;
}

const ENROLLING_PLAN = planWith("enrollment_complete", [
    { kind: "stamp_enrollment_date" },
    { kind: "update_child_enrollment_status", disposition_key: "enrolled" },
    { kind: "move_to_stage", stage_key: "enrolled" },
]);

describe("what is gated is the outcome's EFFECT, not its name", () => {
    it("gates an outcome that writes a durable enrolled disposition", () => {
        expect(outcomeDurablyEnrolls({ plan: ENROLLING_PLAN, outcomeKey: "enrollment_complete" })).toBe(true);
    });

    it("gates a DIFFERENTLY NAMED outcome with the same effect", () => {
        // `future_start` ships this one as `enrolled`; an org may configure a third name.
        const plan = planWith("all_done_here", [
            { kind: "update_child_enrollment_status", disposition_key: "enrolled" },
        ]);
        expect(outcomeDurablyEnrolls({ plan, outcomeKey: "all_done_here" })).toBe(true);
    });

    it("does NOT gate a withdrawal — a family that is leaving is not trapped by paperwork", () => {
        const plan = planWith("family_withdrew", [
            { kind: "update_child_enrollment_status", disposition_key: "withdrawn" },
        ]);
        expect(outcomeDurablyEnrolls({ plan, outcomeKey: "family_withdrew" })).toBe(false);
    });

    it("does not gate an outcome that only moves stage or raises attention", () => {
        const plan = planWith("packet_pending", [
            { kind: "create_needs_attention", status_key: "x" },
            { kind: "move_to_stage", stage_key: "enrolling" },
        ]);
        expect(outcomeDurablyEnrolls({ plan, outcomeKey: "packet_pending" })).toBe(false);
    });
});

describe("the preflight", () => {
    const supabase = {} as never;

    it("passes straight through for an outcome that does not enrol", async () => {
        const result = await preflightEnrollmentCompletionSufficiency({
            supabase,
            orgId: "org-1",
            plan: planWith("packet_pending", [{ kind: "no_movement" }]),
            outcomeKey: "packet_pending",
            processInstanceId: "pi-1",
        });
        expect(result).toMatchObject({ blocked: false, gated: false, sufficiency: null });
    });

    it("BLOCKS a durable-enrolled outcome whose journey cannot be identified", async () => {
        const result = await preflightEnrollmentCompletionSufficiency({
            supabase,
            orgId: "org-1",
            plan: ENROLLING_PLAN,
            outcomeKey: "enrollment_complete",
            processInstanceId: null,
        });
        expect(result.blocked).toBe(true);
        expect(result.gated).toBe(true);
        expect(result.message).toMatch(/could not be identified/i);
    });

    it("BLOCKS when sufficiency cannot be resolved — 'could not check' is not 'nothing blocks'", async () => {
        vi.resetModules();
        vi.doMock("@/lib/enrollment/completion/enrollmentCompletionSufficiency", () => ({
            resolveEnrollmentCompletionSufficiency: async () => ({
                ok: false,
                refusal: { code: "progress_unavailable", detail: "the projection was unavailable" },
            }),
        }));
        const mod = await import("@/lib/enrollment/completion/preflightEnrollmentCompletionSufficiency");
        const result = await mod.preflightEnrollmentCompletionSufficiency({
            supabase,
            orgId: "org-1",
            plan: ENROLLING_PLAN,
            outcomeKey: "enrollment_complete",
            processInstanceId: "pi-1",
        });
        expect(result.blocked).toBe(true);
        expect(result.message).toMatch(/could not be checked/i);
        vi.doUnmock("@/lib/enrollment/completion/enrollmentCompletionSufficiency");
        vi.resetModules();
    });

    it("ALLOWS completion when nothing blocks, including a journey with no requirements", async () => {
        vi.resetModules();
        vi.doMock("@/lib/enrollment/completion/enrollmentCompletionSufficiency", () => ({
            resolveEnrollmentCompletionSufficiency: async () => ({
                ok: true,
                sufficiency: {
                    eligible: true,
                    requirements: [],
                    blocking: [],
                    counts: { total: 0, satisfied: 0, excepted: 0, blocking: 0 },
                },
            }),
        }));
        const mod = await import("@/lib/enrollment/completion/preflightEnrollmentCompletionSufficiency");
        const result = await mod.preflightEnrollmentCompletionSufficiency({
            supabase,
            orgId: "org-1",
            plan: ENROLLING_PLAN,
            outcomeKey: "enrollment_complete",
            processInstanceId: "pi-1",
        });
        expect(result).toMatchObject({ blocked: false, gated: true });
        vi.doUnmock("@/lib/enrollment/completion/enrollmentCompletionSufficiency");
        vi.resetModules();
    });

    it("BLOCKS while a required requirement is outstanding, and names it", async () => {
        vi.resetModules();
        vi.doMock("@/lib/enrollment/completion/enrollmentCompletionSufficiency", () => ({
            resolveEnrollmentCompletionSufficiency: async () => ({
                ok: true,
                sufficiency: {
                    eligible: false,
                    requirements: [],
                    blocking: [
                        {
                            requirement_id: "cis",
                            artifact: { kind: "form", id: "f-1" },
                            level: "required",
                            status: "outstanding",
                            disposition: "blocking",
                            blocked_reason: "The paperwork has not been submitted yet.",
                        },
                    ],
                    counts: { total: 2, satisfied: 1, excepted: 0, blocking: 1 },
                },
            }),
        }));
        const mod = await import("@/lib/enrollment/completion/preflightEnrollmentCompletionSufficiency");
        const result = await mod.preflightEnrollmentCompletionSufficiency({
            supabase,
            orgId: "org-1",
            plan: ENROLLING_PLAN,
            outcomeKey: "enrollment_complete",
            processInstanceId: "pi-1",
        });
        expect(result.blocked).toBe(true);
        expect(result.message).toContain("cis");
        expect(result.message).toMatch(/1 requirement needs attention/);
        vi.doUnmock("@/lib/enrollment/completion/enrollmentCompletionSufficiency");
        vi.resetModules();
    });
});

describe("the operator message", () => {
    const blocking = (id: string, reason: string) => ({
        requirement_id: id,
        artifact: { kind: "form" as const, id: `f-${id}` },
        level: "required" as const,
        status: "outstanding" as const,
        disposition: "blocking" as const,
        blocked_reason: reason,
    });

    it("names every blocker and says why", () => {
        const sufficiency = {
            eligible: false,
            requirements: [],
            blocking: [
                blocking("tuition_agreement", "The paperwork has not been submitted yet."),
                blocking("cis", "The paperwork has not been submitted yet."),
            ],
            counts: { total: 5, satisfied: 3, excepted: 0, blocking: 2 },
        } as unknown as EnrollmentCompletionSufficiency;

        const message = formatCompletionSufficiencyBlockMessage(sufficiency);
        expect(message).toMatch(/2 requirements need attention/);
        expect(message).toContain("tuition_agreement");
        expect(message).toContain("cis");
    });

    it("never names an EXCEPTED requirement — an exception is not an obstacle", () => {
        const sufficiency = {
            eligible: false,
            requirements: [
                {
                    requirement_id: "immunization",
                    artifact: { kind: "form", id: "f-imm" },
                    level: "required",
                    status: "outstanding",
                    disposition: "excepted",
                    exception: {
                        requirement_id: "immunization",
                        reason: "Medical exemption on file.",
                        approved_by: "user-admin",
                        approved_at: "2026-09-01T00:00:00.000Z",
                    },
                },
            ],
            blocking: [blocking("cis", "The paperwork has not been submitted yet.")],
            counts: { total: 2, satisfied: 0, excepted: 1, blocking: 1 },
        } as unknown as EnrollmentCompletionSufficiency;

        const message = formatCompletionSufficiencyBlockMessage(sufficiency);
        expect(message).toContain("cis");
        expect(message).not.toContain("immunization");
    });
});
