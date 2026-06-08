/**
 * Builder input types for grounding signals (Phase 1 / Card 1.3).
 */

import type { CatalogInterpolationValues } from "@/lib/adminV2/bos/recommendations/catalog/recommendationCatalogTypes";
import type { OperationalRecommendationCatalogKey } from "@/lib/adminV2/bos/recommendations/catalog/recommendationCatalogTypes";
import type {
    AvailableActionV1,
    CommunicationReferenceV1,
    EscalationReferenceV1,
    GroundingSignalSourceTypeV1,
    GROUNDING_SIGNAL_SEVERITIES_V1,
    GROUNDING_SIGNAL_SLA_TIERS_V1,
    OperationalContextEntityTypeV1,
    OperationalContextSourceSurfaceV1,
    RecommendationFactorV1,
    WorkflowReferenceV1,
} from "@/lib/adminV2/bos/recommendations/types";

export const MAX_GROUNDING_SIGNALS_V1 = 12 as const;
export const MAX_DRAWER_STRIP_SIGNAL_LABELS_V1 = 2 as const;
export const MAX_DETAIL_SIGNAL_LABELS_V1 = 6 as const;

/** Raw signal before normalization (builder input). */
export type RawGroundingSignalInputV1 = {
    code: string;
    label: string;
    source_type: GroundingSignalSourceTypeV1;
    provenance: string;
    severity?: (typeof GROUNDING_SIGNAL_SEVERITIES_V1)[number];
    sla_tier?: (typeof GROUNDING_SIGNAL_SLA_TIERS_V1)[number];
    value_hint?: string | null;
    priority?: number;
    reason_code?: string | null;
    /** Optional disambiguator when the same code appears from multiple sources. */
    source_id?: string | null;
};

export type OperationalRecommendationStaleInputsV1 = {
    status_key: string | null;
    primary_reason_code: string | null;
    reason_codes_sorted: string[];
    waiting_bucket: string;
    waiting_since_iso: string | null;
    resolver_version: number;
    attention_computed_at_iso: string;
    activity_signal_key: string | null;
};

export type SecondaryFactorInputV1 = {
    code: string;
    label: string;
    severity: string;
    sla_tier: string;
};

/**
 * Explicit deterministic builder input — no resolver/DB calls in Card 1.3.
 */
export type BuildOperationalRecommendationInputV1 = {
    org_id: string;
    entity_type: OperationalContextEntityTypeV1;
    entity_id: string;
    department_id?: string | null;
    work_unit_id?: string | null;
    catalog_key: OperationalRecommendationCatalogKey;
    /** Operator-facing primary reason label for templates (`primary_label`). */
    primary_label: string;
    status_key?: string | null;
    status_label?: string | null;
    primary_display_name?: string | null;
    source_surface: OperationalContextSourceSurfaceV1;
    generated_at_iso?: string;
    raw_signals: RawGroundingSignalInputV1[];
    template_values: CatalogInterpolationValues;
    secondary_factors?: SecondaryFactorInputV1[];
    stale_inputs: OperationalRecommendationStaleInputsV1;
    workflow_reference?: WorkflowReferenceV1 | null;
    communication_reference?: CommunicationReferenceV1 | null;
    escalation_reference?: EscalationReferenceV1 | null;
    /** Overrides catalog `available_actions` when provided. */
    available_action_hints?: AvailableActionV1[] | null;
};

export function toRecommendationFactors(input: SecondaryFactorInputV1[]): RecommendationFactorV1[] {
    return input.slice(0, 4).map((f) => ({
        code: f.code.trim(),
        label: f.label.trim(),
        severity: f.severity.trim(),
        sla_tier: f.sla_tier.trim(),
    }));
}
