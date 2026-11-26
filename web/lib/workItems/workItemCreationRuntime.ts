/**
 * Work Items V3 — shared creation runtime (Intent → Draft → Validation → Commit).
 */

import { applyValidationToWorkItemDraft, createWorkItemDraft, markWorkItemDraftCancelled, markWorkItemDraftCommitted, type WorkItemDraftSeed, type WorkItemDraftV1 } from "@/lib/workItems/workItemDraftV1";
import { validateWorkItemDraft } from "@/lib/workItems/validateWorkItemDraft";
import {
    applyWorkItemConversationMutation,
    buildInitialSystemTurn,
    createConversationTurnId,
    resolveWorkItemConversationTurn,
    type WorkItemClarificationChip,
    type WorkItemConversationMutation,
    type WorkItemConversationTurn,
} from "@/lib/workItems/resolveWorkItemConversation";

export type WorkItemCreationSession = {
    draft: WorkItemDraftV1;
    turns: WorkItemConversationTurn[];
    chips: WorkItemClarificationChip[];
};

export function beginWorkItemDraft(params: {
    seed?: WorkItemDraftSeed;
    defaultAssigneeUserId?: string | null;
}): WorkItemCreationSession {
    const draft = createWorkItemDraft(params);
    const validated = revalidateDraft(draft);
    return {
        draft: validated,
        turns: [buildInitialSystemTurn()],
        chips: [],
    };
}

function revalidateDraft(draft: WorkItemDraftV1): WorkItemDraftV1 {
    const validation = validateWorkItemDraft(draft);
    return applyValidationToWorkItemDraft(draft, validation.issues);
}

export function applyConversationInput(
    session: WorkItemCreationSession,
    operatorText: string,
    currentUserId?: string | null,
): WorkItemCreationSession {
    const trimmed = operatorText.trim();
    if (!trimmed) return session;

    const operatorTurn: WorkItemConversationTurn = {
        id: createConversationTurnId(),
        role: "operator",
        text: trimmed,
    };

    const resolved = resolveWorkItemConversationTurn({
        draft: session.draft,
        operatorText: trimmed,
        currentUserId,
    });

    const systemTurn: WorkItemConversationTurn = {
        id: createConversationTurnId(),
        role: "system",
        text: resolved.systemReply,
    };

    return {
        draft: revalidateDraft(resolved.draft),
        turns: [...session.turns, operatorTurn, systemTurn],
        chips: resolved.chips,
    };
}

export function applyDraftMutation(
    session: WorkItemCreationSession,
    mutation: WorkItemConversationMutation,
): WorkItemCreationSession {
    const nextDraft = applyWorkItemConversationMutation(session.draft, mutation);
    return {
        ...session,
        draft: revalidateDraft(nextDraft),
    };
}

export function cancelWorkItemCreationSession(session: WorkItemCreationSession): WorkItemCreationSession {
    return {
        ...session,
        draft: markWorkItemDraftCancelled(session.draft),
    };
}

export function markSessionCommitted(session: WorkItemCreationSession): WorkItemCreationSession {
    return {
        ...session,
        draft: markWorkItemDraftCommitted(session.draft),
    };
}

export function sessionCanCommit(session: WorkItemCreationSession): boolean {
    return validateWorkItemDraft(session.draft).canCommit;
}
