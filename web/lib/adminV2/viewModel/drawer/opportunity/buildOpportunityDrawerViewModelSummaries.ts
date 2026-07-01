import type { OpportunityAttentionResult } from "@/lib/opportunities/opportunityAttentionResolver";
import type { AttentionSummaryVm, BosSummaryVm } from "@/lib/adminV2/viewModel/drawer/types";

function trimOrNull(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    return s ? s : null;
}

export function buildOpportunityDrawerBosSummary(record: Record<string, unknown>): BosSummaryVm | null {
    const recommendation = record._operational_recommendation;
    const summary = record._operational_summary;
    if (recommendation && typeof recommendation === "object") {
        const rec = recommendation as Record<string, unknown>;
        return {
            visible: true,
            headline: trimOrNull(rec.headline) ?? trimOrNull(rec.title),
            operational_read: trimOrNull(rec.operational_read) ?? trimOrNull(rec.summary),
        };
    }
    if (summary && typeof summary === "object") {
        const sum = summary as Record<string, unknown>;
        return {
            visible: true,
            headline: trimOrNull(sum.headline),
            operational_read: trimOrNull(sum.operational_read),
        };
    }
    return null;
}

export function buildOpportunityDrawerAttentionSummary(
    attention: OpportunityAttentionResult | null | undefined
): AttentionSummaryVm | null {
    if (!attention) return null;
    const reasons = Array.isArray(attention.reasons) ? attention.reasons : [];
    const primary = reasons[0];
    return {
        visible: true,
        needs_attention: attention.needs_attention === true,
        primary_reason: primary?.label != null ? String(primary.label) : primary?.code != null ? String(primary.code) : null,
        reason_count: reasons.length,
    };
}

export function parseInquirySummaryTasksFromRecord(
    record: Record<string, unknown>
): import("@/lib/admin/drawer/opportunityInquirySummaryTaskPreview").InquirySummaryTaskPreviewPayload {
    const raw = record._inquiry_summary_tasks;
    if (raw && typeof raw === "object" && (raw as { state?: unknown }).state === "loaded") {
        const o = raw as {
            open_tasks?: unknown[];
            open_count?: number;
        };
        const open_tasks = Array.isArray(o.open_tasks) ? o.open_tasks : [];
        return {
            state: "loaded",
            open_tasks: open_tasks as import("@/lib/admin/drawer/opportunityInquirySummaryTaskPreview").InquirySummaryTaskPreviewPayload["open_tasks"],
            open_count:
                typeof o.open_count === "number" && Number.isFinite(o.open_count) ?
                    Math.max(0, Math.floor(o.open_count))
                :   open_tasks.length,
        };
    }
    return { state: "loaded", open_tasks: [], open_count: 0 };
}
