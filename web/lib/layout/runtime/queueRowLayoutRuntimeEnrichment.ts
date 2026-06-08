/**
 * Un-gated queue row enrichment for layout runtime binding.
 *
 * Work-unit row_preview gates can omit contact/child/tour fields from semanticCrmCompact
 * while QueueService enrichment still carries them on the raw row. Layout runtime reads
 * this passthrough so cards never show generic placeholders when data exists upstream.
 */

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
    attentionReason?: string | null;
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
        attentionReason: str("_attention_reason_label") ?? str("_attention_reason"),
    };
}
