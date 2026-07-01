import { describe, expect, it } from "vitest";
import { buildCommandFlow, type CommandFlowStage } from "@/lib/adminV2/actions/commandFlow";
import type { CommandSubjectResolution } from "@/lib/adminV2/actions/invocationContext";
import type { ActionEligibility } from "@/lib/adminV2/actions/actionTypes";

const eligibleOk: ActionEligibility = { eligible: true, blockers: [], availableTransitions: [], requiredInputs: [] };

const tourInputs: ActionEligibility = {
    eligible: true,
    blockers: [],
    availableTransitions: [],
    requiredInputs: [
        { key: "date", label: "Date", type: "date", required: true },
        { key: "time", label: "Time", type: "text", required: true },
        { key: "calendar", label: "Calendar", type: "select", required: true },
    ],
};

const needsSubject: CommandSubjectResolution = {
    mode: "needs_subject",
    resolution: "user_selection",
    requiredSubject: "opportunity",
    suggestedSubjectId: null,
};
const inheritedSubject: CommandSubjectResolution = { mode: "execute", subjectId: "opp-1" };
const openSubject: CommandSubjectResolution = { mode: "open", subjectId: null };

function statusOf(flow: ReturnType<typeof buildCommandFlow>, stage: CommandFlowStage) {
    return flow.stages.find((s) => s.stage === stage)?.status;
}

describe("Schedule Tour flow composition across entry points", () => {
    it("Work Unit: first open stage is resolve_subject (choose a family)", () => {
        const flow = buildCommandFlow({
            requiredSubject: "opportunity",
            subject: needsSubject,
            eligibility: tourInputs,
            confirmationPolicy: "required",
            commandLabel: "Schedule Tour",
            subjectLabel: "family",
        });
        expect(flow.currentStage).toBe("resolve_subject");
        expect(flow.state).toBe("needs_subject");
        expect(statusOf(flow, "resolve_context")).toBe("complete");
        expect(statusOf(flow, "resolve_subject")).toBe("active");
        expect(statusOf(flow, "resolve_required_inputs")).toBe("pending");
        expect(statusOf(flow, "preview")).toBe("pending");
    });

    it("Focus Panel: subject inherited, first open stage is required inputs", () => {
        const flow = buildCommandFlow({
            requiredSubject: "opportunity",
            subject: inheritedSubject,
            eligibility: {
                eligible: false,
                blockers: [{ code: "missing_required_input", message: "Date is required.", field: "date" }],
                availableTransitions: [],
                requiredInputs: tourInputs.requiredInputs,
            },
            commandLabel: "Schedule Tour",
        });
        expect(flow.currentStage).toBe("resolve_required_inputs");
        expect(statusOf(flow, "resolve_subject")).toBe("complete");
        expect(flow.message).toMatch(/Missing required information/i);
    });

    it("Focus Panel: everything resolved → confirmation stage", () => {
        const flow = buildCommandFlow({
            requiredSubject: "opportunity",
            subject: inheritedSubject,
            eligibility: tourInputs.requiredInputs.length ? { ...tourInputs } : eligibleOk,
            confirmationPolicy: "required",
            commandLabel: "Schedule Tour",
        });
        expect(flow.currentStage).toBe("confirm");
        expect(flow.state).toBe("confirmation_required");
        expect(statusOf(flow, "resolve_subject")).toBe("complete");
        expect(statusOf(flow, "resolve_required_inputs")).toBe("complete");
        expect(statusOf(flow, "preview")).toBe("complete");
        expect(statusOf(flow, "execute")).toBe("pending");
    });

    it("BOS: subject + inputs resolved → first open stage is preview/confirm", () => {
        const flow = buildCommandFlow({
            requiredSubject: "opportunity",
            subject: inheritedSubject,
            eligibility: eligibleOk,
            confirmationPolicy: "none",
            commandLabel: "Schedule Tour",
        });
        // confirmation skipped → preview is the review stage before execute.
        expect(statusOf(flow, "confirm")).toBe("skipped");
        expect(flow.currentStage).toBe("preview");
    });
});

describe("Create Lead flow composition", () => {
    it("Work Unit: no subject stage (capture-first)", () => {
        const flow = buildCommandFlow({
            requiredSubject: "none",
            subject: openSubject,
            eligibility: eligibleOk,
            confirmationPolicy: "required",
            commandLabel: "Create Lead",
        });
        expect(statusOf(flow, "resolve_subject")).toBe("skipped");
        expect(flow.currentStage).toBe("confirm");
    });
});

describe("flow phases", () => {
    it("executing marks execute active", () => {
        const flow = buildCommandFlow({
            requiredSubject: "opportunity",
            subject: inheritedSubject,
            eligibility: eligibleOk,
            phase: "executing",
            commandLabel: "Schedule Tour",
        });
        expect(flow.currentStage).toBe("execute");
        expect(statusOf(flow, "execute")).toBe("active");
        expect(flow.state).toBe("executing");
    });

    it("success completes the whole flow", () => {
        const flow = buildCommandFlow({
            requiredSubject: "opportunity",
            subject: inheritedSubject,
            eligibility: eligibleOk,
            phase: "success",
            successMessage: "Tour scheduled.",
        });
        expect(flow.currentStage).toBeNull();
        expect(statusOf(flow, "success")).toBe("complete");
        expect(statusOf(flow, "execute")).toBe("complete");
        expect(flow.message).toBe("Tour scheduled.");
    });

    it("hard constraint blocks at resolve_constraints", () => {
        const flow = buildCommandFlow({
            requiredSubject: "opportunity",
            subject: inheritedSubject,
            eligibility: {
                eligible: false,
                blockers: [{ code: "invalid_transition", message: "This family cannot move to Enrolled because the agreement has not been signed." }],
                availableTransitions: [],
                requiredInputs: [],
            },
            commandLabel: "Move Forward",
        });
        expect(flow.currentStage).toBe("resolve_constraints");
        expect(statusOf(flow, "resolve_constraints")).toBe("blocked");
        expect(flow.state).toBe("disabled_blocked");
        expect(flow.message).toMatch(/agreement has not been signed/i);
    });
});
