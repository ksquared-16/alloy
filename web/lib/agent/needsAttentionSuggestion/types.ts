/**
 * Needs Attention Suggestion Agent — V1 derived-only contracts.
 * @see docs/sprints/05_2026/ai_agents_v1.md
 */

export const NEEDS_ATTENTION_SUGGESTION_AGENT_KEY = "needs_attention_suggestion" as const;

export type AttentionSuggestionActionFamily =
    | "follow_up"
    | "review"
    | "update_record"
    | "send_message"
    | "schedule"
    | "workflow"
    | "none";

export type AttentionSuggestionChannel = "sms" | "email" | "note";

export type AttentionSuggestionV1 = {
    version: 1;
    agent_key: typeof NEEDS_ATTENTION_SUGGESTION_AGENT_KEY;
    /** Deterministic id for derived V1 (no DB row). */
    suggestion_id: string;
    target: {
        entity_type: "opportunities";
        entity_id: string;
    };
    source: {
        resolver: "opportunity_attention";
        resolver_version: number;
        primary_reason_code: string | null;
        reason_codes: string[];
        /** `stale_signal.key` from Activity Signals V1 when present. */
        activity_signal_key?: string | null;
    };
    next_action: {
        key: string;
        label: string;
        action_family: AttentionSuggestionActionFamily;
        confidence: "deterministic";
    };
    reasoning: {
        summary: string;
        factors: Array<{
            code: string;
            label: string;
            severity?: string;
            sla_tier?: string;
        }>;
    };
    suggested_content?: {
        channel: AttentionSuggestionChannel;
        template_key: string;
        body: string;
        variables: Record<string, string>;
    } | null;
    generated_at_iso: string;
};

/**
 * Work-unit queue row preview only — same `buildNeedsAttentionSuggestion` contract as entity GET,
 * compacted for list payloads. Not authoritative (drawer + entity GET remain SOT).
 */
export type AttentionSuggestionQueuePreviewV1 = {
    next_label: string;
    why_line: string;
};

/** JSON-serializable snapshot for tests / API contracts. */
export function attentionSuggestionV1ToJson(value: AttentionSuggestionV1): Record<string, unknown> {
    return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}
