/**
 * Merge VM paint-record widget payloads onto layout runtime records (client + server).
 */

import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

const WIDGET_OVERLAY_KEYS = [
    "_inquiry_summary_tasks",
    "_tasks_preview",
    "_operational_attention",
    "_operational_recommendation",
    "_operational_summary",
    "_attention",
    "follow_up_notes",
] as const;

/** Overlay VM widget/attention fields onto a layout runtime record. */
export function mergeOpportunityLayoutRuntimeWidgetRecord(
    layoutRecord: ProofRuntimeRecord,
    vmRecord: Record<string, unknown> | null | undefined,
): ProofRuntimeRecord {
    if (!vmRecord) return layoutRecord;
    const merged: ProofRuntimeRecord = { ...layoutRecord };
    for (const key of WIDGET_OVERLAY_KEYS) {
        if (vmRecord[key] !== undefined) {
            (merged as Record<string, unknown>)[key] = vmRecord[key];
        }
    }
    const overview =
        merged._overview_data && typeof merged._overview_data === "object"
            ? { ...(merged._overview_data as Record<string, unknown>) }
            : { ...vmRecord };
    for (const key of WIDGET_OVERLAY_KEYS) {
        if (vmRecord[key] !== undefined) {
            overview[key] = vmRecord[key];
        }
    }
    merged._overview_data = overview;
    return merged;
}
