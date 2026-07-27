import { beforeEach, describe, expect, it, vi } from "vitest";

import {
    BOS_COMMAND_SOURCE_TEXT_MAX_CHARS,
    applyIfBosRequestSeqCurrent,
    clearPersistedBosCommandSession,
    createBosCommandSession,
    emptyBosCommandDraft,
    isBosRequestSeqCurrent,
    loadPersistedBosCommandSession,
    persistBosCommandSession,
    reduceBosCommandSession,
    sanitizeBosCommandSessionForPersistence,
    syncPersistedBosCommandSession,
    type BosCommandInvocation,
} from "@/lib/bos/commandSession";

const INVOCATION: BosCommandInvocation = {
    actionKey: "create_lead",
    displayLabel: "Create Lead",
    placement: "workspace_actions_menu",
    contextResolution: "bos_proposal",
    workspace: { departmentId: null, workUnitId: null, surface: "right_rail" },
};

function installSessionStorageMock(): void {
    const store = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => {
            store.set(key, value);
        },
        removeItem: (key: string) => {
            store.delete(key);
        },
    });
    vi.stubGlobal("window", { sessionStorage: globalThis.sessionStorage });
}

describe("bos command session persistence", () => {
    beforeEach(() => {
        installSessionStorageMock();
        clearPersistedBosCommandSession();
    });

    it("persists and restores an unfinished session", () => {
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
        expect(persistBosCommandSession(session)).toBe(true);

        const loaded = loadPersistedBosCommandSession();
        expect(loaded?.sessionId).toBe(session.sessionId);
        expect(loaded?.draft.values[0]?.value).toBe("Sarah");
        expect(loaded?.phase).toBe("gathering");
    });

    it("clears storage on discard and complete via sync", () => {
        let session = createBosCommandSession({ invocation: INVOCATION });
        persistBosCommandSession(session);
        session = reduceBosCommandSession(session, { type: "DISCARD" });
        syncPersistedBosCommandSession(session);
        expect(loadPersistedBosCommandSession()).toBeNull();

        session = createBosCommandSession({ invocation: INVOCATION });
        persistBosCommandSession(session);
        session = reduceBosCommandSession(session, { type: "COMPLETE", successMessage: "Done" });
        syncPersistedBosCommandSession(session);
        expect(loadPersistedBosCommandSession()).toBeNull();
    });

    it("truncates oversized source texts for persistence", () => {
        let session = createBosCommandSession({ invocation: INVOCATION });
        const draft = emptyBosCommandDraft();
        draft.sourceTexts.push({
            id: "src_1",
            text: "x".repeat(BOS_COMMAND_SOURCE_TEXT_MAX_CHARS + 50),
            capturedAt: "2026-07-27T12:00:00.000Z",
        });
        session = reduceBosCommandSession(session, { type: "SET_DRAFT", draft });
        const sanitized = sanitizeBosCommandSessionForPersistence(session);
        expect(sanitized.draft.sourceTexts[0]?.text.length).toBe(BOS_COMMAND_SOURCE_TEXT_MAX_CHARS);
        expect(session.draft.sourceTexts[0]?.text.length).toBe(BOS_COMMAND_SOURCE_TEXT_MAX_CHARS + 50);
    });
});

describe("bos requestSeq stale guards", () => {
    it("detects current vs stale seq", () => {
        expect(isBosRequestSeqCurrent({ startedWithSeq: 3, currentSeq: 3 })).toBe(true);
        expect(isBosRequestSeqCurrent({ startedWithSeq: 2, currentSeq: 3 })).toBe(false);
    });

    it("applies async results only when seq still matches (latest input wins)", () => {
        let session = createBosCommandSession({ invocation: INVOCATION });
        session = reduceBosCommandSession(session, { type: "BUMP_REQUEST_SEQ" });
        const startedWithSeq = session.requestSeq;

        session = reduceBosCommandSession(session, { type: "BUMP_REQUEST_SEQ" });
        const stale = applyIfBosRequestSeqCurrent(session, startedWithSeq, (s) =>
            reduceBosCommandSession(s, {
                type: "APPEND_MESSAGE",
                message: { role: "assistant", kind: "summary", body: "stale" },
            })
        );
        expect(stale.applied).toBe(false);
        expect(stale.session.messages.some((m) => m.body === "stale")).toBe(false);

        const currentSeq = session.requestSeq;
        const fresh = applyIfBosRequestSeqCurrent(session, currentSeq, (s) =>
            reduceBosCommandSession(s, {
                type: "APPEND_MESSAGE",
                message: { role: "assistant", kind: "summary", body: "fresh" },
            })
        );
        expect(fresh.applied).toBe(true);
        expect(fresh.session.messages.at(-1)?.body).toBe("fresh");
    });
});
