import { describe, expect, it } from "vitest";
import {
    describeCommandState,
    needsSubjectMessage,
    operatorErrorCopy,
} from "@/lib/adminV2/actions/commandState";
import type { CommandSubjectResolution } from "@/lib/adminV2/actions/invocationContext";
import type { ActionEligibility } from "@/lib/adminV2/actions/actionTypes";

const eligibleOk: ActionEligibility = { eligible: true, blockers: [], availableTransitions: [], requiredInputs: [] };

const needsSubject: CommandSubjectResolution = {
    mode: "needs_subject",
    resolution: "user_selection",
    requiredSubject: "opportunity",
    suggestedSubjectId: null,
};

describe("operatorErrorCopy", () => {
    it("maps the technical entity_id error to a user decision", () => {
        expect(operatorErrorCopy("entity_id required")).toMatch(/Choose a record/i);
    });
    it("passes through friendly server messages", () => {
        expect(operatorErrorCopy("No active tour booking found for this record.")).toMatch(/tour booking/i);
    });
    it("falls back to a blocker message, then a generic message", () => {
        expect(operatorErrorCopy("", [{ code: "x", message: "Cannot do that yet." }])).toBe("Cannot do that yet.");
        expect(operatorErrorCopy(null)).toMatch(/something went wrong/i);
    });
});

describe("needsSubjectMessage", () => {
    it("uses a configured subject label + command label when provided", () => {
        expect(needsSubjectMessage({ requiredSubject: "opportunity", subjectLabel: "family", commandLabel: "Schedule Tour" })).toBe(
            'Choose a family before running "Schedule Tour".',
        );
    });
    it("falls back to a generic noun", () => {
        expect(needsSubjectMessage({ requiredSubject: "child" })).toMatch(/Choose a child/i);
    });
});

describe("describeCommandState — decision chain", () => {
    it("needs_subject when a subject must be selected", () => {
        const view = describeCommandState({ subject: needsSubject, eligibility: eligibleOk, commandLabel: "Schedule Tour", subjectLabel: "family" });
        expect(view.state).toBe("needs_subject");
        expect(view.message).toMatch(/Choose a family/i);
    });

    it("offers a suggested record as a default in recovery copy", () => {
        const view = describeCommandState({
            subject: { ...needsSubject, suggestedSubjectId: "opp-1" },
        });
        expect(view.state).toBe("needs_subject");
        expect(view.recovery).toMatch(/suggested record/i);
    });

    it("needs_required_input when missing-input blockers exist", () => {
        const view = describeCommandState({
            subject: { mode: "execute", subjectId: "opp-1" },
            eligibility: {
                eligible: false,
                blockers: [{ code: "missing_required_input", message: "Child date of birth is required.", field: "dob" }],
                availableTransitions: [],
                requiredInputs: [],
            },
        });
        expect(view.state).toBe("needs_required_input");
        expect(view.message).toMatch(/Missing required information: Child date of birth/i);
    });

    it("disabled_blocked for hard state blockers", () => {
        const view = describeCommandState({
            subject: { mode: "execute", subjectId: "opp-1" },
            eligibility: {
                eligible: false,
                blockers: [{ code: "invalid_transition", message: "This status cannot be changed from Tour Scheduled to Enrolled yet." }],
                availableTransitions: [],
                requiredInputs: [],
            },
        });
        expect(view.state).toBe("disabled_blocked");
        expect(view.message).toMatch(/cannot be changed/i);
    });

    it("confirmation_required when preview is ready and confirmation is required", () => {
        const view = describeCommandState({
            subject: { mode: "execute", subjectId: "opp-1" },
            eligibility: eligibleOk,
            confirmationRequired: true,
            previewReady: true,
            commandLabel: "Update Status",
        });
        expect(view.state).toBe("confirmation_required");
        expect(view.message).toMatch(/Confirm to run "Update Status"/i);
    });

    it("preview_ready when a preview exists without forced confirmation", () => {
        const view = describeCommandState({ subject: { mode: "execute", subjectId: "opp-1" }, eligibility: eligibleOk, previewReady: true });
        expect(view.state).toBe("preview_ready");
    });

    it("available when eligible with nothing pending", () => {
        const view = describeCommandState({ subject: { mode: "open", subjectId: null }, eligibility: eligibleOk });
        expect(view.state).toBe("available");
    });
});

describe("describeCommandState — phases", () => {
    it("executing", () => {
        expect(describeCommandState({ phase: "executing", commandLabel: "Create Lead" })).toMatchObject({
            state: "executing",
            message: "Create Lead…",
        });
    });
    it("success uses the provided message", () => {
        expect(describeCommandState({ phase: "success", successMessage: "Lead created. Opening record." })).toMatchObject({
            state: "success",
            message: "Lead created. Opening record.",
        });
    });
    it("failure maps technical errors to recovery copy", () => {
        const view = describeCommandState({ phase: "failure", errorMessage: "entity_id required" });
        expect(view.state).toBe("failure");
        expect(view.message).toMatch(/Choose a record/i);
        expect(view.recovery).toBeTruthy();
    });
});
