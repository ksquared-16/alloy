import type { WorkflowAssistCreateTemplateIdV1 } from "@/lib/agent/workflowAssist/workflowAssistCreateFromCommandV1";
import {
    buildWorkflowAssistDraftReviewV1,
    normalizeWorkflowAssistEventType,
    type WorkflowAssistDraftReviewV1,
    type WorkflowAssistEnrichmentContextV1,
} from "@/lib/agent/workflowAssist/workflowAssistDraftEnrichmentV1";
import { resolveWorkflowAssistMessagePreview } from "@/lib/agent/workflowAssist/workflowAssistMessageProvenanceV1";
import { buildStubWorkflowAssistDraftEnrichmentRaw } from "@/lib/agent/workflowAssist/workflowAssistStubDraftEnrichmentV1";
import type { WorkflowAssistSuggestionV1 } from "@/lib/agent/workflowAssist/workflowAssistProposalV1";
import {
    buildWorkflowMetadataWithScope,
    type WorkflowAssistWorkflowMetadataV1,
} from "@/lib/workflows/workflowScopeMetadata";

export type EnrichWorkflowAssistCreateInputV1 = {
    suggestion: WorkflowAssistSuggestionV1;
    template_id: WorkflowAssistCreateTemplateIdV1;
    source_command: string;
    lead_days_before_tour?: number | null;
    scope_label?: string | null;
    interpreted?: {
        trigger_label: string;
        actions_label: string;
        unknowns: string[];
    };
    org_metadata: unknown;
    /** When true, run stub enrichment; otherwise deterministic review only. */
    enrichment_enabled: boolean;
};

function parseTemplateIdFromMetadata(metadata: unknown): WorkflowAssistCreateTemplateIdV1 | null {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
    const wa = (metadata as Record<string, unknown>).workflow_assist;
    if (!wa || typeof wa !== "object" || Array.isArray(wa)) return null;
    const tid = (wa as Record<string, unknown>).template_id;
    if (tid === "tour_reminder" || tid === "enrollment_when_move" || tid === "generic_stub") return tid;
    return null;
}

/**
 * Attaches advisory draft_review + metadata enrichment snapshot to a create suggestion.
 * Authoritative apply fields (draft_row) are normalized; AI never widens schema.
 */
export function enrichWorkflowAssistCreateSuggestionV1(
    input: EnrichWorkflowAssistCreateInputV1
): WorkflowAssistSuggestionV1 {
    if (input.suggestion.proposal_kind !== "create_workflow" || !input.suggestion.draft_row) {
        return input.suggestion;
    }

    const row = input.suggestion.draft_row;
    const template_id =
        parseTemplateIdFromMetadata(row.metadata) ?? input.template_id;

    const context: WorkflowAssistEnrichmentContextV1 = {
        template_id,
        source_command: input.source_command,
        lead_days_before_tour: input.lead_days_before_tour,
        scope_label: input.scope_label ?? input.suggestion.scope_display?.label ?? null,
        deterministic: {
            name: row.name,
            description: row.description ?? null,
            event_type: row.event_type,
            entity_type: row.entity_type,
            trigger_label: input.interpreted?.trigger_label ?? `${row.event_type} · ${row.entity_type}`,
            actions_label: input.interpreted?.actions_label ?? "Review actions in Automations",
            unknowns: input.interpreted?.unknowns ?? [],
        },
    };

    const rejected_fields: string[] = [];
    const raw =
        input.enrichment_enabled ?
            buildStubWorkflowAssistDraftEnrichmentRaw({
                template_id,
                source_command: input.source_command,
                lead_days_before_tour: input.lead_days_before_tour,
                deterministic_name: row.name,
                deterministic_description: row.description ?? null,
                event_type: row.event_type,
            })
        :   null;

    const message = resolveWorkflowAssistMessagePreview({
        template_id,
        lead_days: input.lead_days_before_tour,
        org_metadata: input.org_metadata,
        ai_raw: raw,
    });

    const draft_review: WorkflowAssistDraftReviewV1 = buildWorkflowAssistDraftReviewV1({
        context,
        raw,
        message,
        enrichment_source: input.enrichment_enabled ? "stub_v1" : "deterministic_v1",
        rejected_fields,
    });

    const eventNorm = normalizeWorkflowAssistEventType(
        draft_review.trigger.event_type,
        normalizeWorkflowAssistEventType(row.event_type, "opportunity_status_changed").value
    );

    const normalized_row = {
        ...row,
        name: draft_review.workflow_summary.name.slice(0, 200),
        description: draft_review.workflow_summary.description,
        event_type: eventNorm.value,
        entity_type: draft_review.trigger.entity_type,
        enabled: false as const,
    };

    const existingWa =
        row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ?
            (row.metadata as WorkflowAssistWorkflowMetadataV1).workflow_assist
        :   undefined;

    const metadataRecord = buildWorkflowMetadataWithScope({
        scope:
            row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ?
                ((row.metadata as WorkflowAssistWorkflowMetadataV1).scope ?? null)
            :   null,
        workflow_assist: {
            ...existingWa,
            enrichment_v1: {
                generated_at_iso: input.suggestion.generated_at_iso,
                enrichment_source: draft_review.ai_suggestions.source,
                message_provenance: draft_review.message_preview.provenance,
                normalized_event_type: normalized_row.event_type,
                normalized_channel: draft_review.action_preview.channel,
                advisory_only: true,
            },
            message_preview: {
                body: draft_review.message_preview.body.slice(0, 4000),
                provenance: draft_review.message_preview.provenance,
                needs_review: draft_review.message_preview.needs_review,
                unresolved_tokens: draft_review.message_preview.unresolved_tokens,
            },
        },
    });

    normalized_row.metadata = metadataRecord;

    return {
        ...input.suggestion,
        draft_row: normalized_row,
        draft_review,
        reasoning: {
            summary: `${draft_review.operator.display_title} · ${draft_review.operator.scope_label}`,
            warnings: [],
        },
    };
}
