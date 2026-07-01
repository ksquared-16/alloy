/** Frozen read model for deterministic packet review assist (contract_version: 1). */

export const PACKET_REVIEW_INSIGHT_CONTRACT_VERSION = 1 as const;

export const PACKET_REVIEW_INSIGHT_HUMAN_AUTHORITY_NOTE =
    "Read-only guidance from submitted data. You approve, reject, or request correction — nothing applies automatically.";

/** Operational readiness — generic across standalone, intake, and multi-step packet review. */
export type PacketReviewReadinessState =
    | "incomplete"
    | "needs_attention"
    | "awaiting_correction"
    | "ready_for_review"
    | "blocked"
    | "approved"
    | "rejected";

export type PacketReviewInsightChecklistStatus = "ok" | "attention" | "blocked";

export type PacketReviewInsightChecklistItem = {
    key: string;
    label: string;
    status: PacketReviewInsightChecklistStatus;
};

export type PacketReviewInsightV1 = {
    contract_version: typeof PACKET_REVIEW_INSIGHT_CONTRACT_VERSION;
    packet_session_id: string;
    readiness_state: PacketReviewReadinessState;
    summary_bullets: string[];
    key_changes: string[];
    attention_items: string[];
    suggested_focus: string;
    review_paths: string[];
    confidence_notes: string[];
    human_authority_note: string;
    checklist: PacketReviewInsightChecklistItem[];
};
