import { nextBosMessageId } from "@/lib/bos/commandSession/createSession";
import type {
    BosCommandConfirmation,
    BosCommandConversationMessage,
    BosCommandDraft,
    BosCommandExecutionResult,
    BosCommandMode,
    BosCommandPreview,
    BosCommandRecoveryState,
    BosCommandResolutionState,
    BosCommandSession,
    BosCommandSessionPhase,
} from "@/lib/bos/commandSession/types";

export type BosCommandSessionAction =
    | { type: "SET_MODE"; mode: BosCommandMode; note?: string }
    | { type: "SET_PHASE"; phase: BosCommandSessionPhase }
    | { type: "SET_DRAFT"; draft: BosCommandDraft }
    | { type: "SET_RESOLUTION"; resolution: BosCommandResolutionState }
    | { type: "SET_PREVIEW"; preview: BosCommandPreview | null }
    | { type: "SET_CONFIRMATION"; confirmation: BosCommandConfirmation | null }
    | { type: "BEGIN_EXECUTE" }
    | {
          type: "EXECUTE_SUCCESS";
          execution: Extract<BosCommandExecutionResult, { ok: true }>;
          processingCaseId?: string | null;
          phase?: Extract<BosCommandSessionPhase, "processing_review" | "completed">;
      }
    | {
          type: "EXECUTE_FAILURE";
          execution: Extract<BosCommandExecutionResult, { ok: false }>;
          recovery: BosCommandRecoveryState;
      }
    | { type: "SET_PROCESSING_CASE"; processingCaseId: string }
    | { type: "COMPLETE"; successMessage?: string }
    | { type: "FAIL"; recovery: BosCommandRecoveryState; errorMessage?: string }
    | { type: "DISCARD" }
    | { type: "APPEND_MESSAGE"; message: Omit<BosCommandConversationMessage, "id" | "createdAt"> & { id?: string; createdAt?: string } }
    | { type: "BUMP_REQUEST_SEQ" }
    | { type: "TOUCH" };

const TERMINAL: ReadonlySet<BosCommandSessionPhase> = new Set(["completed", "discarded"]);

function nowIso(): string {
    return new Date().toISOString();
}

function touch(session: BosCommandSession, patch: Partial<BosCommandSession>): BosCommandSession {
    return {
        ...session,
        ...patch,
        updatedAt: nowIso(),
    };
}

/**
 * Pure session reducer. Callers supply adapter-derived draft/resolution/preview;
 * this module owns lifecycle transitions only.
 */
export function reduceBosCommandSession(
    session: BosCommandSession,
    action: BosCommandSessionAction
): BosCommandSession {
    if (TERMINAL.has(session.phase) && action.type !== "TOUCH") {
        // Completed/discarded sessions are immutable except TOUCH (no-op refresh).
        if (action.type === "DISCARD" && session.phase === "completed") {
            return touch(session, { phase: "discarded" });
        }
        return session;
    }

    switch (action.type) {
        case "TOUCH":
            return touch(session, {});

        case "BUMP_REQUEST_SEQ":
            return touch(session, { requestSeq: session.requestSeq + 1 });

        case "SET_MODE": {
            const at = nowIso();
            const messages = [...session.messages];
            if (action.mode !== session.mode) {
                messages.push({
                    id: nextBosMessageId(),
                    role: "system",
                    kind: "mode_switch",
                    body:
                        action.note ??
                        (action.mode === "form"
                            ? "Switched to Form. Your details are preserved."
                            : "Switched to Conversation. Your details are preserved."),
                    createdAt: at,
                });
            }
            return touch(session, {
                mode: action.mode,
                messages,
                phase: session.phase === "acknowledged" ? "gathering" : session.phase,
            });
        }

        case "SET_PHASE":
            return touch(session, { phase: action.phase });

        case "SET_DRAFT":
            return touch(session, {
                draft: action.draft,
                phase:
                    session.phase === "acknowledged" || session.phase === "preview" || session.phase === "confirming"
                        ? "gathering"
                        : session.phase,
                preview: null,
                confirmation: null,
                recovery: null,
            });

        case "SET_RESOLUTION":
            return touch(session, { resolution: action.resolution });

        case "SET_PREVIEW":
            return touch(session, {
                preview: action.preview,
                phase: action.preview ? "preview" : session.phase === "preview" ? "gathering" : session.phase,
                confirmation: null,
            });

        case "SET_CONFIRMATION":
            return touch(session, {
                confirmation: action.confirmation,
                phase: action.confirmation?.confirmedByOperator ? "confirming" : session.phase,
            });

        case "BEGIN_EXECUTE":
            return touch(session, {
                phase: "executing",
                recovery: null,
                execution: null,
            });

        case "EXECUTE_SUCCESS": {
            const nextPhase = action.phase ?? (action.processingCaseId || action.execution.processingCaseId
                ? "processing_review"
                : "completed");
            return touch(session, {
                phase: nextPhase,
                execution: action.execution,
                processingCaseId:
                    action.processingCaseId ?? action.execution.processingCaseId ?? session.processingCaseId,
                recovery: null,
            });
        }

        case "EXECUTE_FAILURE":
            return touch(session, {
                phase: "failed",
                execution: action.execution,
                recovery: action.recovery,
            });

        case "SET_PROCESSING_CASE":
            return touch(session, {
                processingCaseId: action.processingCaseId,
                phase: "processing_review",
            });

        case "COMPLETE": {
            const at = nowIso();
            const messages = [...session.messages];
            if (action.successMessage) {
                messages.push({
                    id: nextBosMessageId(),
                    role: "assistant",
                    kind: "success",
                    body: action.successMessage,
                    createdAt: at,
                });
            }
            return touch(session, { phase: "completed", messages, recovery: null });
        }

        case "FAIL": {
            const at = nowIso();
            const messages = [...session.messages];
            if (action.errorMessage || action.recovery.operatorMessage) {
                messages.push({
                    id: nextBosMessageId(),
                    role: "assistant",
                    kind: "error",
                    body: action.errorMessage ?? action.recovery.operatorMessage,
                    createdAt: at,
                });
            }
            return touch(session, {
                phase: "failed",
                recovery: action.recovery,
                messages,
            });
        }

        case "DISCARD":
            return touch(session, { phase: "discarded" });

        case "APPEND_MESSAGE": {
            const at = action.message.createdAt ?? nowIso();
            const message: BosCommandConversationMessage = {
                id: action.message.id ?? nextBosMessageId(),
                role: action.message.role,
                kind: action.message.kind,
                body: action.message.body,
                createdAt: at,
            };
            return touch(session, {
                messages: [...session.messages, message],
                phase: session.phase === "acknowledged" ? "gathering" : session.phase,
            });
        }

        default: {
            const _exhaustive: never = action;
            return _exhaustive;
        }
    }
}

/** Whether the session may still accept draft edits. */
export function bosCommandSessionAllowsEdits(session: BosCommandSession): boolean {
    return (
        session.phase === "acknowledged" ||
        session.phase === "gathering" ||
        session.phase === "resolving" ||
        session.phase === "preview" ||
        session.phase === "confirming" ||
        session.phase === "failed"
    );
}
