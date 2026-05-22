/**
 * Deterministic recommendation catalog types (Phase 1 / Card 1.2).
 * @see docs/sprints/05_2026/bos_operational_recommendation_phase1_execution.md §7
 */

import type { AttentionSuggestionActionFamily } from "@/lib/agent/needsAttentionSuggestion/types";
import type { OpportunityAttentionReasonCode } from "@/lib/opportunities/attentionPlatformCatalog";
import type {
    AvailableActionKindV1,
    CommunicationChannelHintV1,
    ConfidenceLevelV1,
    RecommendationTypeV1,
    TrustBoundaryV1,
    UrgencyBandV1,
} from "@/lib/adminV2/bos/recommendations/types";

/** Allowlisted template placeholders (execution pack §7.2). */
export const CATALOG_TEMPLATE_PLACEHOLDERS = [
    "primary_label",
    "days",
    "wait_bucket_label",
    "timing_phrase",
    "status_label",
    "secondary_count",
    "severity",
    "sla_tier",
    "threshold_hours",
] as const;

export type CatalogTemplatePlaceholder = (typeof CATALOG_TEMPLATE_PLACEHOLDERS)[number];

export type CatalogTemplateTier = "full" | "compact" | "fallback";

/**
 * Platform attention reason codes plus supplemental catalog keys for signal-driven overlays.
 * `waiting_on_internal` is not a resolver code — use `waiting_on_staff`.
 */
export type OperationalRecommendationCatalogSupplementalKey = "unanswered_inbound" | "sla_breach";

export type OperationalRecommendationCatalogKey =
    | OpportunityAttentionReasonCode
    | OperationalRecommendationCatalogSupplementalKey;

export type CatalogRecommendedActionTemplate = {
    key: string;
    labelTemplate: string;
    action_family: AttentionSuggestionActionFamily;
};

export type CatalogAvailableActionDef = {
    key: string;
    label: string;
    kind: AvailableActionKindV1;
    intent?: string;
};

export type CatalogCommunicationHints = {
    channel_hint: CommunicationChannelHintV1 | null;
    timing_hint_template: string | null;
    template_key: null;
};

export type CatalogEscalationHints = {
    policy_basis_template: string;
    applies_when_sla_tier: "breached" | "approaching" | null;
};

export type CatalogWorkflowHints = {
    explain_sub_intent: string | null;
    notes: string | null;
};

/**
 * One deterministic catalog entry — templates only; rendered via {@link renderCatalogTemplate}.
 */
export type OperationalRecommendationCatalogEntryV1 = {
    catalog_key: OperationalRecommendationCatalogKey;
    /** Maps to resolver `primary_reason.code` when keyed by reason code. */
    attention_reason_code: OpportunityAttentionReasonCode | null;
    template_id: string;
    tier: CatalogTemplateTier;

    recommendation_type: RecommendationTypeV1;
    default_urgency_band: UrgencyBandV1;
    default_confidence_level: ConfidenceLevelV1;
    trust_boundary: TrustBoundaryV1;

    title_template: string;
    current_state_summary_template: string;
    why_it_matters_template: string;
    urgency_reason_template: string;
    recommended_action: CatalogRecommendedActionTemplate;
    action_rationale_template: string;
    likely_outcome_template: string | null;
    likely_risk_template: string | null;

    available_actions: CatalogAvailableActionDef[];

    /** Grounding signal codes required before using `full` tier (subset of builder output). */
    required_grounding_signals: string[];

    stale_validation_hints: string[];

    workflow_reference_hints: CatalogWorkflowHints | null;
    communication_reference_hints: CatalogCommunicationHints | null;
    escalation_hints: CatalogEscalationHints | null;

    /**
     * Placeholders required in at least one narrative template field when tier is `full`.
     * Optional placeholders may be omitted from interpolation values.
     */
    required_interpolation: CatalogTemplatePlaceholder[];
};

export type RenderedCatalogCopyV1 = {
    catalog_key: OperationalRecommendationCatalogKey;
    template_id: string;
    tier: CatalogTemplateTier;
    title: string;
    current_state_summary: string;
    why_it_matters: string;
    urgency_reason: string;
    recommended_action: {
        key: string;
        label: string;
        action_family: AttentionSuggestionActionFamily;
    };
    action_rationale: string;
    likely_outcome: string | null;
    likely_risk: string | null;
};

export type CatalogInterpolationValues = Partial<Record<CatalogTemplatePlaceholder, string | number | null | undefined>>;
