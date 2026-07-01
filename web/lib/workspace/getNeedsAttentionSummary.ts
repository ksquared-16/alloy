import type { JobRowForWorkspaceMetrics } from "./jobMetricsRow";
import {
    NEEDS_ATTENTION_EXCEPTION_ORDER,
    NEEDS_ATTENTION_EXCEPTIONS,
    type NeedsAttentionExceptionType,
} from "./exceptionTypes";

function previewLabel(j: JobRowForWorkspaceMetrics): string {
    const t = (j._job_label ?? j.title ?? "").trim();
    return t || j.id.slice(-8);
}

export type NeedsAttentionExceptionSummaryEntry = {
    type: NeedsAttentionExceptionType;
    label: string;
    description: string;
    severity: (typeof NEEDS_ATTENTION_EXCEPTIONS)[NeedsAttentionExceptionType]["severity"];
    count: number;
    previews: { id: string; label: string }[];
    defaultAction: (typeof NEEDS_ATTENTION_EXCEPTIONS)[NeedsAttentionExceptionType]["defaultAction"];
    quickActions?: (typeof NEEDS_ATTENTION_EXCEPTIONS)[NeedsAttentionExceptionType]["quickActions"];
    filterLogic: string;
};

/**
 * Org-scoped summary over a merged job sample (same cap as workspace signals).
 * Callers obtain `merged` the same way as `useOperationsWorkspaceData` (dept + unassigned lists merged by id).
 */
export type NeedsAttentionSummary = {
    orgId: string;
    sampleSize: number;
    generatedAt: string;
    exceptions: NeedsAttentionExceptionSummaryEntry[];
    /** Distinct job ids matching at least one exception predicate (union across types). */
    totalDistinctExceptionJobs: number;
};

/**
 * Primary data helper for the Needs Attention exception work unit — counts, previews, and action metadata.
 */
export function getNeedsAttentionSummary(
    orgId: string,
    merged: JobRowForWorkspaceMetrics[],
    now: Date = new Date()
): NeedsAttentionSummary {
    const nowMs = now.getTime();
    const seenUnion = new Set<string>();
    const exceptions: NeedsAttentionExceptionSummaryEntry[] = [];

    for (const t of NEEDS_ATTENTION_EXCEPTION_ORDER) {
        const def = NEEDS_ATTENTION_EXCEPTIONS[t];
        const rows = merged.filter((j) => def.matches(j, nowMs));
        for (const r of rows) seenUnion.add(r.id);
        exceptions.push({
            type: t,
            label: def.label,
            description: def.description,
            severity: def.severity,
            count: rows.length,
            previews: rows.slice(0, 4).map((r) => ({ id: r.id, label: previewLabel(r) })),
            defaultAction: def.defaultAction,
            quickActions: def.quickActions,
            filterLogic: def.filterLogic,
        });
    }

    return {
        orgId,
        sampleSize: merged.length,
        generatedAt: now.toISOString(),
        exceptions,
        totalDistinctExceptionJobs: seenUnion.size,
    };
}
