/**
 * Operator triage actions for communication_threads.attention_state.
 */
import type { ConversationSummary } from "@/lib/communications/v2/commandCenterViewModel";

/** Persisted when operator marks a thread resolved / done. */
export const RESOLVED_ATTENTION_STATE = "resolved" as const;

/** Inbound-written value (backend); surfaced as Needs response in UI. */
export const INBOUND_NEEDS_RESPONSE_STATE = "needs_response" as const;

const OPERATIONAL_ATTENTION_LABELS: Record<string, string> = {
    awaiting_parent_reply: "Awaiting Parent Reply",
    needs_follow_up: "Needs Follow-Up",
    documents_missing: "Documents Missing",
    re_enrollment_outreach: "Re-enrollment Outreach",
    waitlist_update: "Waitlist Update",
};

const OPERATIONAL_ATTENTION_KEYS = new Set<string>(Object.keys(OPERATIONAL_ATTENTION_LABELS));

export type TriageActionKey = "needs_review" | "needs_response" | "resolved";

export type TriageAction = {
    key: TriageActionKey;
    label: string;
    /** null clears attention_state (Needs review bucket). */
    attentionState: string | null;
};

export const TRIAGE_OPERATOR_ACTIONS: TriageAction[] = [
    { key: "needs_review", label: "Needs review", attentionState: null },
    { key: "needs_response", label: "Needs response", attentionState: "awaiting_parent_reply" },
    { key: "resolved", label: "Resolved", attentionState: RESOLVED_ATTENTION_STATE },
];

const OPERATIONAL_KEYS = OPERATIONAL_ATTENTION_KEYS;

export function triageAttentionStateForAction(key: TriageActionKey): string | null {
    const action = TRIAGE_OPERATOR_ACTIONS.find((a) => a.key === key);
    return action?.attentionState ?? null;
}

/** Operator-facing label for the current attention_state on a thread. */
export function conversationAttentionLabel(attentionState: string | null | undefined): string {
    const attn = (attentionState ?? "").trim();
    if (!attn) return "Needs review";
    if (attn === RESOLVED_ATTENTION_STATE) return "Resolved";
    if (attn === INBOUND_NEEDS_RESPONSE_STATE || attn === "awaiting_parent_reply") return "Needs response";
    if (attn === "needs_follow_up") return "Follow up";
    const opLabel = OPERATIONAL_ATTENTION_LABELS[attn];
    if (opLabel) return opLabel;
    return "Needs review";
}

export function isResolvedConversation(c: Pick<ConversationSummary, "attention_state">): boolean {
    return (c.attention_state ?? "").trim() === RESOLVED_ATTENTION_STATE;
}

export function isNeedsReviewConversation(c: Pick<ConversationSummary, "attention_state">): boolean {
    const attn = (c.attention_state ?? "").trim();
    if (!attn) return true;
    if (attn === RESOLVED_ATTENTION_STATE) return false;
    return !OPERATIONAL_KEYS.has(attn) && attn !== INBOUND_NEEDS_RESPONSE_STATE;
}
