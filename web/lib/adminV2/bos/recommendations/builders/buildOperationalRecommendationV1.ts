/**
 * Deterministic operational recommendation builder (Phase 1 / Card 1.3).
 */

import {
    getOperationalRecommendationCatalogEntry,
    renderCatalogEntryCopy,
} from "@/lib/adminV2/bos/recommendations/catalog/operationalRecommendationCatalog";
import type { CatalogInterpolationValues } from "@/lib/adminV2/bos/recommendations/catalog/recommendationCatalogTypes";
import { RecommendationCatalogValidationError } from "@/lib/adminV2/bos/recommendations/catalog/recommendationCatalogValidation";
import { attachRenderBundle } from "@/lib/adminV2/bos/recommendations/builders/projectOperationalRecommendationRender";
import { resolveRecommendationReferences } from "@/lib/adminV2/bos/recommendations/builders/resolveRecommendationReferences";
import {
    resolveConfidence,
    resolveUrgencyBand,
} from "@/lib/adminV2/bos/recommendations/builders/resolveUrgencyAndConfidence";
import { assembleStaleStateCheck } from "@/lib/adminV2/bos/recommendations/fingerprints/assembleStaleStateCheck";
import { buildRecommendationId } from "@/lib/adminV2/bos/recommendations/fingerprints/operationalRecommendationFingerprint";
import {
    assertRequiredCatalogSignalsPresent,
    normalizeGroundingSignals,
    OperationalRecommendationSignalError,
} from "@/lib/adminV2/bos/recommendations/signals/normalizeGroundingSignals";
import {
    type BuildOperationalRecommendationInputV1,
    toRecommendationFactors,
} from "@/lib/adminV2/bos/recommendations/signals/operationalRecommendationSignals";
import type { OperationalRecommendationV1 } from "@/lib/adminV2/bos/recommendations/types";
import { validateOperationalRecommendationV1 } from "@/lib/adminV2/bos/recommendations/validation/validateOperationalRecommendationV1";

export class OperationalRecommendationBuilderError extends Error {
    readonly code: string;

    constructor(code: string, message: string) {
        super(`operational_recommendation_builder:${code}: ${message}`);
        this.name = "OperationalRecommendationBuilderError";
        this.code = code;
    }
}

function mergeTemplateValues(
    input: BuildOperationalRecommendationInputV1
): CatalogInterpolationValues {
    return {
        ...input.template_values,
        primary_label: input.template_values.primary_label ?? input.primary_label,
        status_label: input.template_values.status_label ?? input.status_label ?? undefined,
    };
}

/**
 * Build a validated {@link OperationalRecommendationV1} from explicit deterministic inputs.
 * Does not call resolvers, queues, or persistence layers.
 */
export function buildOperationalRecommendationV1(
    input: BuildOperationalRecommendationInputV1
): OperationalRecommendationV1 {
    const catalog = getOperationalRecommendationCatalogEntry(input.catalog_key);
    if (!catalog) {
        throw new OperationalRecommendationBuilderError(
            "unknown_catalog_key",
            `no catalog entry for key: ${input.catalog_key}`
        );
    }

    const generated_at_iso = input.generated_at_iso ?? new Date().toISOString();
    const normalized_signals = normalizeGroundingSignals(input.raw_signals);

    try {
        assertRequiredCatalogSignalsPresent(catalog.required_grounding_signals, normalized_signals);
    } catch (e) {
        if (e instanceof OperationalRecommendationSignalError) {
            throw new OperationalRecommendationBuilderError("missing_grounding_signals", e.message);
        }
        throw e;
    }

    const template_values = mergeTemplateValues(input);
    let rendered;
    try {
        rendered = renderCatalogEntryCopy(input.catalog_key, template_values);
    } catch (e) {
        if (e instanceof RecommendationCatalogValidationError) {
            throw new OperationalRecommendationBuilderError("catalog_template", e.message);
        }
        throw e;
    }

    const urgency = resolveUrgencyBand({ catalog, normalized_signals });
    const { confidence_level, confidence_reason } = resolveConfidence({
        catalog,
        normalized_signals,
        secondary_factor_count: input.secondary_factors?.length ?? 0,
        template_values,
    });

    const refs = resolveRecommendationReferences({
        catalog,
        template_values,
        primary_reason_code: input.stale_inputs.primary_reason_code,
        workflow_reference: input.workflow_reference,
        communication_reference: input.communication_reference,
        escalation_reference: input.escalation_reference,
    });

    const secondary_factors = toRecommendationFactors(input.secondary_factors ?? []);

    const stale_state_check = assembleStaleStateCheck({
        entity_id: input.entity_id,
        stale_inputs: input.stale_inputs,
        evaluated_at_iso: generated_at_iso,
        normalized_signals,
        is_stale: false,
    });

    const recommendation_id = buildRecommendationId({
        entity_id: input.entity_id,
        catalog_key: input.catalog_key,
        primary_reason_code: input.stale_inputs.primary_reason_code,
        generated_at_iso,
    });

    const available_actions =
        input.available_action_hints && input.available_action_hints.length > 0
            ? input.available_action_hints
            : catalog.available_actions.map((a) => ({
                  key: a.key,
                  label: a.label,
                  kind: a.kind,
                  ...(a.intent ? { intent: a.intent } : {}),
              }));

    const partial: Omit<OperationalRecommendationV1, "render"> = {
        version: 1,
        recommendation_id,
        generated_at_iso,

        recommendation_type: catalog.recommendation_type,
        trust_boundary: catalog.trust_boundary,
        deterministic_vs_ai_assisted: "deterministic",

        operational_context: {
            entity_type: input.entity_type,
            entity_id: input.entity_id.trim(),
            org_id: input.org_id.trim(),
            status_key: input.status_key ?? input.stale_inputs.status_key,
            status_label: input.status_label ?? null,
            work_unit_id: input.work_unit_id ?? null,
            primary_display_name: input.primary_display_name ?? null,
            source_surface: input.source_surface,
        },

        source_signal: normalized_signals,
        grounding_signals: normalized_signals,

        title: rendered.title,
        current_state_summary: rendered.current_state_summary,
        why_it_matters: rendered.why_it_matters,
        recommended_action: rendered.recommended_action,
        action_rationale: rendered.action_rationale,
        likely_outcome: rendered.likely_outcome,
        likely_risk: rendered.likely_risk,

        urgency,
        urgency_reason: rendered.urgency_reason,
        confidence_level,
        confidence_reason,

        secondary_factors,

        stale_state_check,

        available_actions,
        workflow_reference: refs.workflow_reference,
        communication_reference: refs.communication_reference,
        escalation_reference: refs.escalation_reference,
    };

    const withRender = attachRenderBundle(partial, {
        recommendation_type: catalog.recommendation_type,
        urgency,
        confidence_level,
        title: rendered.title,
        why_it_matters: rendered.why_it_matters,
        urgency_reason: rendered.urgency_reason,
        likely_outcome: rendered.likely_outcome,
        recommended_action_label: rendered.recommended_action.label,
        action_rationale: rendered.action_rationale,
        likely_risk: rendered.likely_risk,
        action_family: rendered.recommended_action.action_family,
        primary_display_name: input.primary_display_name ?? null,
        normalized_signals,
        secondary_factors,
        is_stale: false,
    });

    return validateOperationalRecommendationV1(withRender);
}
