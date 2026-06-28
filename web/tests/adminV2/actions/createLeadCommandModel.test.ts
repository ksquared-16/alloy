import { describe, expect, it } from "vitest";
import {
    deriveCreateLeadCommandFromBosProposal,
    deriveCreateLeadCommandState,
} from "@/lib/adminV2/actions/createLead/createLeadCommandModel";
import { CREATE_LEAD_ACTION_KEY } from "@/lib/adminV2/actions/createLead/createLeadRequiredInputs";
import type { ActionResultOk } from "@/lib/adminV2/actions/actionTypes";

const complete = { first_name: "Ada", last_name: "Lovelace", email: "ada@example.com" };
const partial = { first_name: "Ada" };

function stageStatus(snap: ReturnType<typeof deriveCreateLeadCommandState>, stage: string) {
    return snap.flow.stages.find((s) => s.stage === stage)?.status;
}

describe("Create Lead command model — Work Unit / manual", () => {
    it("Work Unit Create Lead has no subject stage and starts at required inputs", () => {
        const snap = deriveCreateLeadCommandState({ knownInputs: {}, entryPoint: "work_unit_actions" });
        expect(snap.actionKey).toBe(CREATE_LEAD_ACTION_KEY);
        // No subject: resolve_subject is skipped (capture-first).
        expect(stageStatus(snap, "resolve_subject")).toBe("skipped");
        expect(snap.context.requiredSubject).toBe("none");
        expect(snap.context.contextResolution).toBe("open");
        // First open stage is required inputs.
        expect(snap.stage).toBe("resolve_required_inputs");
        expect(snap.state).toBe("needs_required_input");
        expect(snap.missingInputs.length).toBeGreaterThan(0);
    });

    it("manual entry with complete inputs is ready to confirm/execute", () => {
        const snap = deriveCreateLeadCommandState({ knownInputs: complete, entryPoint: "manual" });
        expect(snap.missingInputs).toHaveLength(0);
        expect(snap.readyForPreview).toBe(true);
        expect(snap.readyToExecute).toBe(true);
        expect(snap.state).toBe("confirmation_required");
        expect(stageStatus(snap, "preview")).toBe("complete");
    });

    it("executePayload mirrors known inputs and never mutates", () => {
        const snap = deriveCreateLeadCommandState({ knownInputs: complete, entryPoint: "manual" });
        expect(snap.executePayload).toEqual(complete);
        // Snapshot carries the registered action key — execution goes through it, not a fork.
        expect(snap.actionKey).toBe("create_lead");
    });
});

describe("Create Lead command model — BOS", () => {
    it("BOS with complete parsed data starts at preview/confirm (stages progressively removed)", () => {
        const snap = deriveCreateLeadCommandFromBosProposal({ parsedValues: complete });
        expect(snap.entryPoint).toBe("bos");
        expect(snap.readyForPreview).toBe(true);
        expect(snap.state).toBe("confirmation_required");
        expect(snap.message).toMatch(/found enough information/i);
    });

    it("BOS with missing parsed data surfaces missing fields in operator language", () => {
        const snap = deriveCreateLeadCommandFromBosProposal({ parsedValues: partial });
        expect(snap.state).toBe("needs_required_input");
        // Human language, not raw payload jargon.
        expect(snap.message).toMatch(/I still need/i);
        expect(snap.message).not.toMatch(/last_name/);
        expect(snap.message.toLowerCase()).toContain("last name");
    });

    it("BOS and manual produce compatible snapshots for the same inputs", () => {
        const bos = deriveCreateLeadCommandFromBosProposal({ parsedValues: complete });
        const manual = deriveCreateLeadCommandState({ knownInputs: complete, entryPoint: "manual" });
        // Same command, same context resolution, same flow shape — only voice differs.
        expect(bos.actionKey).toBe(manual.actionKey);
        expect(bos.context.contextResolution).toBe(manual.context.contextResolution);
        expect(bos.stage).toBe(manual.stage);
        expect(bos.state).toBe(manual.state);
        expect(bos.executePayload).toEqual(manual.executePayload);
    });
});

describe("Create Lead command model — success / refresh", () => {
    const okResult: ActionResultOk = {
        ok: true,
        correlationId: "c1",
        result: {
            actionKey: "create_lead",
            entityType: "opportunity",
            entityId: "opp-123",
            affectedId: "opp-123",
            detail: { kind: "create_lead", opportunity_id: "opp-123" },
        },
    };

    it("standardizes created id, next surface, refresh targets, and copy", () => {
        const snap = deriveCreateLeadCommandState({
            knownInputs: complete,
            entryPoint: "manual",
            phase: "success",
            result: okResult,
        });
        expect(snap.state).toBe("success");
        expect(snap.success?.createdRecordId).toBe("opp-123");
        expect(snap.success?.nextSurface).toBe("focus_panel");
        expect(snap.success?.refreshTargets).toEqual([{ entityType: "opportunity", entityId: "opp-123" }]);
        expect(snap.success?.successCopy).toMatch(/Created lead for Ada Lovelace/);
    });

    it("BOS success copy is conversational and human-readable", () => {
        const snap = deriveCreateLeadCommandFromBosProposal({
            parsedValues: complete,
            phase: "success",
            result: okResult,
        });
        expect(snap.message).toMatch(/Lead created for Ada Lovelace\. Opening record\./);
    });
});

describe("Create Lead command model — failure", () => {
    it("surfaces operator recovery copy, not a stack trace", () => {
        const snap = deriveCreateLeadCommandState({
            knownInputs: complete,
            entryPoint: "manual",
            phase: "failure",
            errorMessage: "Lead was created but no opportunity id was returned.",
        });
        expect(snap.state).toBe("failure");
        expect(snap.message).toBe("Lead was created but no opportunity id was returned.");
    });
});
