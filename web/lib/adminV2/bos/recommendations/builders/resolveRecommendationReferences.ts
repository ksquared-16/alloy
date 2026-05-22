/**
 * Workflow / communication / escalation reference assembly (Phase 1 / Card 1.3).
 */

import { renderCatalogTemplate } from "@/lib/adminV2/bos/recommendations/catalog/recommendationCopyTemplates";
import type {
    CatalogInterpolationValues,
    OperationalRecommendationCatalogEntryV1,
} from "@/lib/adminV2/bos/recommendations/catalog/recommendationCatalogTypes";
import type {
    CommunicationReferenceV1,
    EscalationReferenceV1,
    WorkflowReferenceV1,
} from "@/lib/adminV2/bos/recommendations/types";

export function resolveRecommendationReferences(args: {
    catalog: OperationalRecommendationCatalogEntryV1;
    template_values: CatalogInterpolationValues;
    primary_reason_code: string | null;
    workflow_reference: WorkflowReferenceV1 | null | undefined;
    communication_reference: CommunicationReferenceV1 | null | undefined;
    escalation_reference: EscalationReferenceV1 | null | undefined;
}): {
    workflow_reference: WorkflowReferenceV1 | null;
    communication_reference: CommunicationReferenceV1 | null;
    escalation_reference: EscalationReferenceV1 | null;
} {
    const workflow_reference = args.workflow_reference ?? null;

    let communication_reference = args.communication_reference ?? null;
    if (!communication_reference && args.catalog.communication_reference_hints) {
        const hints = args.catalog.communication_reference_hints;
        communication_reference = {
            channel_hint: hints.channel_hint,
            timing_hint: hints.timing_hint_template
                ? renderCatalogTemplate(hints.timing_hint_template, args.template_values, {
                      field: "communication_reference.timing_hint",
                  })
                : null,
            template_key: null,
            prefill_instruction: null,
        };
    }

    let escalation_reference = args.escalation_reference ?? null;
    if (!escalation_reference && args.catalog.escalation_hints) {
        const hints = args.catalog.escalation_hints;
        escalation_reference = {
            policy_basis: renderCatalogTemplate(hints.policy_basis_template, args.template_values, {
                required: ["primary_label", "sla_tier"],
                field: "escalation_reference.policy_basis",
            }),
            sla_tier: String(args.template_values.sla_tier ?? "breached"),
            reason_code:
                args.primary_reason_code ??
                args.catalog.attention_reason_code ??
                String(args.catalog.catalog_key),
        };
    }

    if (args.catalog.recommendation_type !== "communication" && !args.communication_reference) {
        communication_reference = null;
    }
    if (args.catalog.recommendation_type !== "escalation" && !args.escalation_reference) {
        escalation_reference = null;
    }

    return { workflow_reference, communication_reference, escalation_reference };
}
