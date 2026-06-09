/**
 * Un-gated queue row enrichment for layout runtime binding.
 *
 * Work-unit row_preview gates can omit contact/child/tour fields from semanticCrmCompact
 * while QueueService enrichment still carries them on the raw row. Layout runtime reads
 * this passthrough so cards never show generic placeholders when data exists upstream.
 */

import type { InquirySummaryTaskPreviewPayload } from "@/lib/admin/drawer/opportunityInquirySummaryTaskPreview";
import { parseInquirySummaryTaskPreview } from "@/lib/admin/drawer/opportunityInquirySummaryTaskPreview";

export type QueueRowLayoutRuntimeEnrichment = {
    customerName?: string | null;
    contactLine?: string | null;
    primaryPhone?: string | null;
    primaryEmail?: string | null;
    tourDisplay?: string | null;
    statusDisplay?: string | null;
    statusKey?: string | null;
    locationLabel?: string | null;
    programLabel?: string | null;
    childDisplayName?: string | null;
    /** `_crm_compact_children` from QueueService — structured child lines. */
    crmCompactChildren?: unknown;
    /** Raw inquiry child blocks when present on queue row payload. */
    inquiryChildren?: unknown;
    /** Active household customer_member child rows when present on queue row payload. */
    householdChildren?: unknown;
    /** `_primary_person_id` from QueueService — primary contact person id. */
    primaryPersonId?: string | null;
    primaryChildPersonId?: string | null;
    attentionReason?: string | null;
    inquirySummaryTasks?: InquirySummaryTaskPreviewPayload | null;
    /** Passthrough from queue row — More guidance resolution (no new resolver precedence). */
    operationalAttention?: unknown;
    operationalRecommendation?: unknown;
    operationalRecommendationPreview?: unknown;
    attentionSuggestion?: unknown;
    attentionSuggestionPreview?: unknown;
};

/** Build enrichment blob from a queue runtime row (server or work-unit page). */
export function buildQueueRowLayoutRuntimeEnrichment(row: Record<string, unknown>): QueueRowLayoutRuntimeEnrichment {
    const str = (key: string) => {
        const v = row[key];
        return typeof v === "string" && v.trim() ? v.trim() : null;
    };
    return {
        customerName: str("_customer_name") ?? str("name") ?? str("title"),
        contactLine: str("_primary_contact_line"),
        primaryPhone: str("_primary_phone"),
        primaryEmail: str("_primary_email"),
        tourDisplay: str("_tour_queue_display") ?? str("_tour_context"),
        statusDisplay: str("_status_display"),
        statusKey: str("status_key"),
        locationLabel: str("_location_label"),
        programLabel: str("_requested_program"),
        childDisplayName: str("_child_display_name"),
        crmCompactChildren: row._crm_compact_children,
        inquiryChildren:
            row._inquiry_children ??
            (row.metadata && typeof row.metadata === "object"
                ? (row.metadata as Record<string, unknown>).inquiry_children
                : undefined),
        householdChildren: row._household_children ?? row.household_children,
        primaryPersonId: str("_primary_person_id") ?? str("primary_person_id"),
        primaryChildPersonId: str("_primary_child_person_id") ?? str("primary_child_person_id"),
        attentionReason: str("_attention_reason_label") ?? str("_attention_reason"),
        inquirySummaryTasks:
            parseInquirySummaryTaskPreview(row)
            ?? ({ state: "loaded", open_tasks: [], open_count: 0 } satisfies InquirySummaryTaskPreviewPayload),
        operationalAttention: row._operational_attention,
        operationalRecommendation: row._operational_recommendation,
        operationalRecommendationPreview: row._operational_recommendation_preview,
        attentionSuggestion: row._attention_suggestion,
        attentionSuggestionPreview: row._attention_suggestion_preview,
    };
}
