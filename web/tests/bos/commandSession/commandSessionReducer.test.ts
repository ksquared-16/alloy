import { describe, expect, it } from "vitest";

import {
    bosCommandSessionAllowsEdits,
    createBosCommandSession,
    emptyBosCommandDraft,
    fingerprintBosCommandDraft,
    reduceBosCommandSession,
    type BosCommandInvocation,
} from "@/lib/bos/commandSession";

const INVOCATION: BosCommandInvocation = {
    actionKey: "create_lead",
    displayLabel: "Create Lead",
    placement: "work_unit_actions",
    contextResolution: "bos_proposal",
    workspace: {
        departmentId: "dept-1",
        workUnitId: "wu-1",
        surface: "work_unit",
    },
};

describe("createBosCommandSession", () => {
    it("starts acknowledged with an ack turn and empty draft", () => {
        const session = createBosCommandSession({ invocation: INVOCATION, now: "2026-07-27T12:00:00.000Z" });
        expect(session.sessionId.startsWith("bos_cmd_")).toBe(true);
        expect(session.phase).toBe("acknowledged");
        expect(session.mode).toBe("conversation");
        expect(session.messages).toHaveLength(1);
        expect(session.messages[0]?.kind).toBe("ack");
        expect(session.messages[0]?.body).toContain("Create Lead");
        expect(session.draft).toEqual(emptyBosCommandDraft());
        expect(session.processingCaseId).toBeNull();
        expect(session.requestSeq).toBe(0);
        expect(bosCommandSessionAllowsEdits(session)).toBe(true);
    });
});

describe("reduceBosCommandSession", () => {
    it("switches mode and preserves draft while advancing to gathering", () => {
        let session = createBosCommandSession({ invocation: INVOCATION });
        const draft = emptyBosCommandDraft();
        draft.values.push({
            fieldKey: "first_name",
            value: "Sarah",
            state: "operator_entered",
            evidence: [],
            optionResolved: false,
        });
        session = reduceBosCommandSession(session, { type: "SET_DRAFT", draft });
        session = reduceBosCommandSession(session, { type: "SET_MODE", mode: "form" });
        expect(session.mode).toBe("form");
        expect(session.phase).toBe("gathering");
        expect(session.draft.values[0]?.value).toBe("Sarah");
        expect(session.messages.some((m) => m.kind === "mode_switch")).toBe(true);

        session = reduceBosCommandSession(session, { type: "SET_MODE", mode: "conversation" });
        expect(session.mode).toBe("conversation");
        expect(session.draft.values[0]?.value).toBe("Sarah");
    });

    it("clears preview when draft changes", () => {
        let session = createBosCommandSession({ invocation: INVOCATION });
        session = reduceBosCommandSession(session, {
            type: "SET_PREVIEW",
            preview: {
                title: "Create Lead",
                summaryLines: ["Sarah"],
                householdSummary: null,
                warnings: [],
                sideEffects: ["Opens Processing review."],
                destination: {},
                generatedAt: "2026-07-27T12:00:00.000Z",
                draftFingerprint: "fp_old",
            },
        });
        expect(session.phase).toBe("preview");
        session = reduceBosCommandSession(session, {
            type: "SET_DRAFT",
            draft: emptyBosCommandDraft(),
        });
        expect(session.preview).toBeNull();
        expect(session.phase).toBe("gathering");
    });

    it("transitions execute success into processing_review when case id present", () => {
        let session = createBosCommandSession({ invocation: INVOCATION });
        session = reduceBosCommandSession(session, { type: "BEGIN_EXECUTE" });
        expect(session.phase).toBe("executing");
        session = reduceBosCommandSession(session, {
            type: "EXECUTE_SUCCESS",
            execution: {
                ok: true,
                executionKind: "processing_intake",
                processingCaseId: "case-1",
                success: null,
            },
        });
        expect(session.phase).toBe("processing_review");
        expect(session.processingCaseId).toBe("case-1");
    });

    it("discards and freezes further draft edits", () => {
        let session = createBosCommandSession({ invocation: INVOCATION });
        session = reduceBosCommandSession(session, { type: "DISCARD" });
        expect(session.phase).toBe("discarded");
        expect(bosCommandSessionAllowsEdits(session)).toBe(false);
        const before = session.updatedAt;
        session = reduceBosCommandSession(session, {
            type: "SET_DRAFT",
            draft: emptyBosCommandDraft(),
        });
        expect(session.updatedAt).toBe(before);
    });

    it("completes with optional success message", () => {
        let session = createBosCommandSession({ invocation: INVOCATION });
        session = reduceBosCommandSession(session, {
            type: "COMPLETE",
            successMessage: "Lead ready. Open Lead when you want to continue.",
        });
        expect(session.phase).toBe("completed");
        expect(session.messages.at(-1)?.kind).toBe("success");
        expect(bosCommandSessionAllowsEdits(session)).toBe(false);
    });

    it("records failure recovery without clearing draft by default", () => {
        let session = createBosCommandSession({ invocation: INVOCATION });
        const draft = emptyBosCommandDraft();
        draft.values.push({
            fieldKey: "email",
            value: "a@b.co",
            state: "operator_entered",
            evidence: [],
            optionResolved: false,
        });
        session = reduceBosCommandSession(session, { type: "SET_DRAFT", draft });
        session = reduceBosCommandSession(session, {
            type: "FAIL",
            recovery: {
                reason: "network",
                preserveDraft: true,
                operatorMessage: "Connection lost. Your details are still here — try again.",
            },
        });
        expect(session.phase).toBe("failed");
        expect(session.draft.values[0]?.value).toBe("a@b.co");
        expect(bosCommandSessionAllowsEdits(session)).toBe(true);
    });

    it("bumps requestSeq for stale-response protection", () => {
        let session = createBosCommandSession({ invocation: INVOCATION });
        session = reduceBosCommandSession(session, { type: "BUMP_REQUEST_SEQ" });
        session = reduceBosCommandSession(session, { type: "BUMP_REQUEST_SEQ" });
        expect(session.requestSeq).toBe(2);
    });
});

describe("fingerprintBosCommandDraft", () => {
    it("is stable for equivalent drafts and changes when values change", () => {
        const a = emptyBosCommandDraft();
        a.values.push({
            fieldKey: "first_name",
            value: "Sarah",
            state: "parsed_from_source",
            evidence: [{ kind: "source_span", at: "2026-07-27T12:00:00.000Z", excerpt: "Sarah" }],
            optionResolved: false,
        });
        const b = emptyBosCommandDraft();
        b.values.push({
            fieldKey: "first_name",
            value: "Sarah",
            state: "parsed_from_source",
            evidence: [{ kind: "source_span", at: "2026-07-27T13:00:00.000Z", excerpt: "Sarah" }],
            optionResolved: false,
        });
        expect(fingerprintBosCommandDraft(a)).toBe(fingerprintBosCommandDraft(b));

        b.values[0]!.value = "Sara";
        expect(fingerprintBosCommandDraft(a)).not.toBe(fingerprintBosCommandDraft(b));
    });
});
