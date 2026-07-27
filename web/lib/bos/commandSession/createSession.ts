import type {
    BosCommandConversationMessage,
    BosCommandDraft,
    BosCommandInvocation,
    BosCommandResolutionState,
    BosCommandSession,
} from "@/lib/bos/commandSession/types";

function newId(prefix: string): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    }
    return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyBosCommandDraft(): BosCommandDraft {
    return {
        values: [],
        sourceTexts: [],
        household: null,
        unmappedText: null,
        schemaVersion: 1,
    };
}

export function emptyBosCommandResolution(): BosCommandResolutionState {
    return {
        missingRequired: [],
        missingOptional: [],
        invalid: [],
        ambiguous: [],
        blockers: [],
        readyForPreview: false,
        readyToExecute: false,
    };
}

export type CreateBosCommandSessionInput = {
    invocation: BosCommandInvocation;
    /** Defaults to conversation. */
    mode?: BosCommandSession["mode"];
    now?: string;
    ackBody?: string;
};

/**
 * Creates a scoped command session with an immediate acknowledgement turn.
 * Does not open Processing cases or execute actions.
 */
export function createBosCommandSession(input: CreateBosCommandSessionInput): BosCommandSession {
    const now = input.now ?? new Date().toISOString();
    const sessionId = newId("bos_cmd");
    const label = input.invocation.displayLabel.trim() || "Command";
    const ack: BosCommandConversationMessage = {
        id: newId("msg"),
        role: "assistant",
        kind: "ack",
        body:
            input.ackBody ??
            `${label} is ready. Paste an email or call note, or describe the lead — I’ll summarize what I understand, then we’ll fill what’s still needed. Conversation and Form stay on the same command.`,
        createdAt: now,
    };

    return {
        sessionId,
        invocation: input.invocation,
        mode: input.mode ?? "conversation",
        phase: "acknowledged",
        draft: emptyBosCommandDraft(),
        messages: [ack],
        resolution: emptyBosCommandResolution(),
        preview: null,
        confirmation: null,
        execution: null,
        recovery: null,
        processingCaseId: null,
        requestSeq: 0,
        createdAt: now,
        updatedAt: now,
        expiresAt: null,
    };
}

export function nextBosMessageId(): string {
    return newId("msg");
}

export function nextBosSourceTextId(): string {
    return newId("src");
}
