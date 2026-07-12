/**
 * BOS Operational Recommendation Intelligence — canonical contract (Phase 1).
 * @see docs/sprints/archive/05_2026/bos_operational_recommendation_phase1_execution.md
 */

import type { AttentionSuggestionActionFamily } from "@/lib/agent/needsAttentionSuggestion/types";

export const OPERATIONAL_RECOMMENDATION_VERSION = 1 as const;

/** Phase 1 builder output; Phase 4+ may set hybrid / ai_refined on enrich overlay only. */
export const OPERATIONAL_RECOMMENDATION_DETERMINISTIC_MODES = [
    "deterministic",
    "hybrid",
    "ai_refined",
] as const;

/** Modes allowed on wire in Phase 1 (validator enforces). */
export const OPERATIONAL_RECOMMENDATION_PHASE1_DETERMINISTIC_MODES = ["deterministic"] as const;

export type DeterministicVsAiAssistedV1 = (typeof OPERATIONAL_RECOMMENDATION_DETERMINISTIC_MODES)[number];

export const RECOMMENDATION_TYPES_V1 = [
    "informational",
    "operational",
    "escalation",
    "communication",
    "conversion",
    "risk",
    "workflow",
] as const;

export type RecommendationTypeV1 = (typeof RECOMMENDATION_TYPES_V1)[number];

export const URGENCY_BANDS_V1 = ["p0_urgent", "p1_today", "p2_soon", "p3_fyi"] as const;

export type UrgencyBandV1 = (typeof URGENCY_BANDS_V1)[number];

export const CONFIDENCE_LEVELS_V1 = ["high", "medium", "low"] as const;

export type ConfidenceLevelV1 = (typeof CONFIDENCE_LEVELS_V1)[number];

export const TRUST_BOUNDARIES_V1 = ["insight_only", "governed_proposal", "routing_only"] as const;

export type TrustBoundaryV1 = (typeof TRUST_BOUNDARIES_V1)[number];

export const STALE_REASONS_V1 = [
    "status_changed",
    "reason_changed",
    "wait_bucket_changed",
    "wait_since_changed",
    "activity_changed",
    "resolver_recomputed",
    "entity_mismatch",
] as const;

export type StaleReasonV1 = (typeof STALE_REASONS_V1)[number];

export const GROUNDING_SIGNAL_SOURCE_TYPES_V1 = [
    "attention_resolver",
    "activity_signal",
    "enrollment_operational",
    "entity_field",
    "operational_task",
    "scheduled_send",
    "communication_thread",
] as const;

export type GroundingSignalSourceTypeV1 = (typeof GROUNDING_SIGNAL_SOURCE_TYPES_V1)[number];

export const GROUNDING_SIGNAL_SEVERITIES_V1 = ["critical", "high", "medium", "low"] as const;

export const GROUNDING_SIGNAL_SLA_TIERS_V1 = ["ok", "approaching", "breached"] as const;

export const OPERATIONAL_CONTEXT_ENTITY_TYPES_V1 = ["opportunities"] as const;

export type OperationalContextEntityTypeV1 = (typeof OPERATIONAL_CONTEXT_ENTITY_TYPES_V1)[number];

export const OPERATIONAL_CONTEXT_SOURCE_SURFACES_V1 = ["entity_get", "queue_enrich"] as const;

export type OperationalContextSourceSurfaceV1 = (typeof OPERATIONAL_CONTEXT_SOURCE_SURFACES_V1)[number];

export const AVAILABLE_ACTION_KINDS_V1 = ["task_assist_intent", "admin_action", "drawer_tab"] as const;

export type AvailableActionKindV1 = (typeof AVAILABLE_ACTION_KINDS_V1)[number];

export const COMMUNICATION_CHANNEL_HINTS_V1 = ["sms", "email", "call_task"] as const;

export type CommunicationChannelHintV1 = (typeof COMMUNICATION_CHANNEL_HINTS_V1)[number];

/** Max string lengths enforced by {@link validateOperationalRecommendationV1}. */
export const OPERATIONAL_RECOMMENDATION_MAX_LENGTHS = {
    title: 80,
    current_state_summary: 400,
    why_it_matters: 280,
    action_rationale: 200,
    likely_outcome: 160,
    likely_risk: 160,
    urgency_reason: 120,
    confidence_reason: 200,
    recommendation_id: 64,
    inputs_fingerprint: 64,
    queue_why_line: 140,
    drawer_why_line: 220,
    handoff_operational_reason: 240,
} as const;

export type GroundingSignalV1 = {
    code: string;
    label: string;
    source_type: GroundingSignalSourceTypeV1;
    provenance: string;
    severity?: (typeof GROUNDING_SIGNAL_SEVERITIES_V1)[number];
    sla_tier?: (typeof GROUNDING_SIGNAL_SLA_TIERS_V1)[number];
    value_hint?: string;
    priority: number;
    reason_code?: string;
};

export type OperationalContextV1 = {
    entity_type: OperationalContextEntityTypeV1;
    entity_id: string;
    org_id: string;
    status_key: string | null;
    status_label: string | null;
    work_unit_id: string | null;
    primary_display_name: string | null;
    source_surface: OperationalContextSourceSurfaceV1;
};

export type RecommendedActionV1 = {
    key: string;
    label: string;
    action_family: AttentionSuggestionActionFamily;
};

export type RecommendationFactorV1 = {
    code: string;
    label: string;
    severity: string;
    sla_tier: string;
};

export type FingerprintInputsV1 = {
    entity_id: string;
    status_key: string | null;
    primary_reason_code: string | null;
    reason_codes_sorted: string[];
    waiting_bucket: string;
    waiting_since_iso: string | null;
    resolver_version: number;
    attention_computed_at_iso: string;
    activity_signal_key: string | null;
};

export type StaleStateCheckV1 = {
    fingerprint_version: 1;
    inputs_fingerprint: string;
    fingerprint_inputs: FingerprintInputsV1;
    evaluated_at_iso: string;
    is_stale: boolean;
    stale_reason: StaleReasonV1 | null;
};

export type AvailableActionV1 = {
    key: string;
    label: string;
    kind: AvailableActionKindV1;
    intent?: string;
    action_definition_id?: string;
};

export type WorkflowReferenceV1 = {
    workflow_id?: string | null;
    event_type?: string | null;
    explain_href?: string | null;
};

export type CommunicationReferenceV1 = {
    channel_hint: CommunicationChannelHintV1 | null;
    timing_hint: string | null;
    template_key: string | null;
    prefill_instruction: string | null;
};

export type EscalationReferenceV1 = {
    policy_basis: string;
    sla_tier: string;
    reason_code: string;
};

export type OperationalRecommendationQueuePreviewV1 = {
    next_label: string;
    why_line: string;
    urgency_band: UrgencyBandV1;
    recommendation_type: RecommendationTypeV1;
    is_stale: boolean;
};

export type OperationalRecommendationDrawerStripV1 = {
    title: string;
    why_line: string;
    urgency_label: string;
    urgency_reason: string;
    outcome_line: string | null;
    confidence_label: string | null;
    next_action_label: string;
    signal_labels: string[];
    is_stale: boolean;
    stale_banner: string | null;
};

export type OperationalRecommendationHandoffV1 = {
    eyebrow: string;
    primary_recommendation: string;
    operational_reason: string;
    context_line: string;
    cta_label: string;
};

export type OperationalRecommendationDetailV1 = {
    factors: RecommendationFactorV1[];
    signal_labels: string[];
    action_rationale: string;
    likely_outcome: string | null;
    likely_risk: string | null;
};

export type OperationalRecommendationRenderBundleV1 = {
    queue: OperationalRecommendationQueuePreviewV1;
    drawer_strip: OperationalRecommendationDrawerStripV1;
    handoff: OperationalRecommendationHandoffV1;
    detail: OperationalRecommendationDetailV1 | null;
};

/**
 * Canonical deterministic operational recommendation (entity GET / queue enrich).
 * `generated_at_iso` is the wire timestamp (execution pack “generated_at”).
 */
export type OperationalRecommendationV1 = {
    version: typeof OPERATIONAL_RECOMMENDATION_VERSION;
    recommendation_id: string;
    generated_at_iso: string;

    recommendation_type: RecommendationTypeV1;
    trust_boundary: TrustBoundaryV1;
    deterministic_vs_ai_assisted: DeterministicVsAiAssistedV1;

    operational_context: OperationalContextV1;

    source_signal: GroundingSignalV1[];
    grounding_signals: GroundingSignalV1[];

    title: string;
    current_state_summary: string;
    why_it_matters: string;
    recommended_action: RecommendedActionV1;
    action_rationale: string;
    likely_outcome: string | null;
    likely_risk: string | null;

    urgency: UrgencyBandV1;
    urgency_reason: string;
    confidence_level: ConfidenceLevelV1;
    confidence_reason: string;

    secondary_factors: RecommendationFactorV1[];

    stale_state_check: StaleStateCheckV1;

    available_actions: AvailableActionV1[];
    workflow_reference: WorkflowReferenceV1 | null;
    communication_reference: CommunicationReferenceV1 | null;
    escalation_reference: EscalationReferenceV1 | null;

    render: OperationalRecommendationRenderBundleV1;
};
