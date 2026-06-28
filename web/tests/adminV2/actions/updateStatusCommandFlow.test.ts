import { describe, expect, it } from "vitest";
import { buildCommandFlow } from "@/lib/adminV2/actions/commandFlow";
import { resolveCommandContext } from "@/lib/adminV2/actions/invocationContext";
import { updateStatusAction } from "@/lib/adminV2/actions/definitions/updateStatusAction";
import type { ActionEligibility } from "@/lib/adminV2/actions/actionTypes";

/**
 * Phase 8 (light) — Update Status as the second reference command, modeled through the same
 * runtime (no UI wiring). Validates that Focus Panel Manage resolves the current record as
 * the subject, and that the flow expresses blocker vs. preview states. Eligibility itself is
 * resolved server-side by updateStatusAction.resolveEligibility; here we feed representative
 * eligibility snapshots to validate the flow composition only.
 */

const validTransition: ActionEligibility = {
    eligible: true,
    blockers: [],
    availableTransitions: [
        { key: "qualification", label: "Qualification" },
        { key: "tour_scheduled", label: "Tour Scheduled" },
    ],
    requiredInputs: [{ key: "status_key", label: "Target status", type: "status", required: true }],
};

const invalidTransition: ActionEligibility = {
    eligible: false,
    blockers: [
        {
            code: "invalid_transition",
            message: "This record cannot move to Enrolled because the agreement is not signed.",
        },
    ],
    availableTransitions: [],
    requiredInputs: [],
};

describe("Update Status command — Focus Panel Manage", () => {
    it("resolves the current record as the subject (no selection required)", () => {
        const ctx = resolveCommandContext({
            action: updateStatusAction,
            surface: "record_header",
            inheritedSubjectId: "opp-1",
        });
        expect(ctx.requiredSubject).toBe("opportunity");
        expect(ctx.contextResolution).toBe("current_record");
        expect(ctx.subject).toEqual({ mode: "execute", subjectId: "opp-1" });
    });

    it("a valid transition produces a confirmable preview", () => {
        const ctx = resolveCommandContext({
            action: updateStatusAction,
            surface: "record_header",
            inheritedSubjectId: "opp-1",
        });
        const flow = buildCommandFlow({
            requiredSubject: ctx.requiredSubject,
            subject: ctx.subject,
            eligibility: validTransition,
            confirmationPolicy: updateStatusAction.confirmationPolicy,
            commandLabel: "Update status",
        });
        expect(flow.stages.find((s) => s.stage === "resolve_subject")?.status).toBe("complete");
        expect(flow.state).toBe("confirmation_required");
        expect(flow.currentStage).toBe("confirm");
    });

    it("an invalid transition produces blocker copy at resolve_constraints", () => {
        const ctx = resolveCommandContext({
            action: updateStatusAction,
            surface: "record_header",
            inheritedSubjectId: "opp-1",
        });
        const flow = buildCommandFlow({
            requiredSubject: ctx.requiredSubject,
            subject: ctx.subject,
            eligibility: invalidTransition,
            confirmationPolicy: updateStatusAction.confirmationPolicy,
            commandLabel: "Update status",
        });
        expect(flow.state).toBe("disabled_blocked");
        expect(flow.currentStage).toBe("resolve_constraints");
        expect(flow.message).toMatch(/agreement is not signed/i);
    });

    it("Work Unit Update Status requires choosing a record (no inherited subject)", () => {
        const ctx = resolveCommandContext({ action: updateStatusAction, surface: "work_unit" });
        expect(ctx.contextResolution).toBe("user_selection");
        expect(ctx.subject.mode).toBe("needs_subject");
    });
});
