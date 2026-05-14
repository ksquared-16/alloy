import type { OpportunityAttentionReasonCode } from "@/lib/opportunities/attentionPlatformCatalog";
import { isOpportunityAttentionReasonCode } from "@/lib/opportunities/attentionPlatformCatalog";

const MAX_LEN = 72;

/**
 * Short queue-row line: why this record ranks high (deterministic, not AI).
 * Uses reason code so we do not repeat the full "Needs attention: …" headline.
 */
const PRIORITY_SHORT_BY_CODE: Partial<Record<OpportunityAttentionReasonCode, string>> = {
    follow_up_date_passed: "Overdue follow-up",
    stale_new_inquiry: "Stale new inquiry",
    high_value_stale: "High-priority stale record",
    mid_funnel_stale: "High-priority stale record",
    stale_qualified: "High-priority stale record",
    stale_quote_followup: "High-priority stale record",
    missing_quote_after_execution: "High-priority stale record",
    overdue_commitment: "Overdue follow-up",
    tour_date_passed: "Tour date passed",
    waiting_on_documents: "Waiting on documents",
    waiting_on_family: "Waiting on family",
    waiting_on_staff: "Waiting on staff",
    waiting_on_payment: "Waiting on payment",
    blocked_internal: "Blocked",
    blocked_external: "Blocked",
    missing_identity: "Missing contact details",
};

export function buildQueueRowPriorityExplanationLine(row: Record<string, unknown>): string | null {
    if (row._needs_attention !== true) return null;

    const codeRaw = row._attention_reason;
    const code = typeof codeRaw === "string" && codeRaw.trim() && isOpportunityAttentionReasonCode(codeRaw.trim())
        ? (codeRaw.trim() as OpportunityAttentionReasonCode)
        : null;
    const mapped = code ? PRIORITY_SHORT_BY_CODE[code] : null;
    if (mapped) {
        if (mapped.length <= MAX_LEN) return mapped;
        return `${mapped.slice(0, MAX_LEN - 1)}…`;
    }

    const label = String(row._attention_reason_label ?? "").trim();
    if (!label) return null;
    const compact = label.replace(/^needs attention:\s*/i, "").trim() || label;
    if (compact.length <= MAX_LEN) return compact;
    return `${compact.slice(0, MAX_LEN - 1)}…`;
}
