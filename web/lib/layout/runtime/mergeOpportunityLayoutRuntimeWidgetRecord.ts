/**
 * Merge VM paint-record widget payloads onto layout runtime records (client + server).
 */

import { resolveOpportunityLayoutRuntimeChildrenRows } from "@/lib/layout/runtime/mapLayoutRuntimeChildrenRows";
import { overlayPrimaryChildScalarsOnRecord } from "@/lib/layout/runtime/overlayPrimaryChildScalarsOnRecord";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

const WIDGET_OVERLAY_KEYS = [
    "_inquiry_summary_tasks",
    "_work_intent_runtime",
    "_stage_work_runtime",
    "_tasks_preview",
    "_operational_attention",
    "_operational_recommendation",
    "_operational_summary",
    "_attention",
    "_activity_timeline_events",
    "_related_activity_timeline_events",
    "follow_up_notes",
] as const;

function layoutChildrenCount(record: ProofRuntimeRecord): number {
    const a = record.children;
    const b = record.enrollment_children;
    const lenA = Array.isArray(a) ? a.length : 0;
    const lenB = Array.isArray(b) ? b.length : 0;
    return Math.max(lenA, lenB);
}

function layoutChildrenHaveDisplayNames(record: ProofRuntimeRecord): boolean {
    for (const key of ["children", "enrollment_children"] as const) {
        const raw = record[key];
        if (!Array.isArray(raw)) continue;
        for (const row of raw) {
            if (!row || typeof row !== "object") continue;
            const rec = row as Record<string, unknown>;
            const name = rec["child.name"] ?? rec["child.display_name"] ?? rec["child.first_name"];
            if (typeof name === "string" && name.trim() && name.trim() !== "—") return true;
        }
    }
    return false;
}

/** Overlay VM child rows when the layout-runtime record is stale or empty. */
function mergeOpportunityLayoutRuntimeChildrenRecord(
    layoutRecord: ProofRuntimeRecord,
    vmRecord: Record<string, unknown>,
): ProofRuntimeRecord {
    const vmChildren = resolveOpportunityLayoutRuntimeChildrenRows(vmRecord);
    if (vmChildren.length === 0) return layoutRecord;

    const layoutCount = layoutChildrenCount(layoutRecord);
    const shouldOverlay =
        layoutCount === 0 ||
        !layoutChildrenHaveDisplayNames(layoutRecord) ||
        layoutCount < vmChildren.length;

    if (!shouldOverlay) return layoutRecord;

    return {
        ...layoutRecord,
        children: vmChildren,
        enrollment_children: vmChildren,
        _inquiry_children: vmRecord._inquiry_children ?? layoutRecord._inquiry_children,
    };
}

/** Overlay VM widget/attention/children fields onto a layout runtime record. */
export function mergeOpportunityLayoutRuntimeWidgetRecord(
    layoutRecord: ProofRuntimeRecord,
    vmRecord: Record<string, unknown> | null | undefined,
): ProofRuntimeRecord {
    if (!vmRecord) return layoutRecord;
    let merged: ProofRuntimeRecord = { ...layoutRecord };
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
    merged = mergeOpportunityLayoutRuntimeChildrenRecord(merged, vmRecord);
    if (vmRecord._inquiry_children !== undefined) {
        merged._inquiry_children = vmRecord._inquiry_children;
    }
    const mergedChildren = resolveOpportunityLayoutRuntimeChildrenRows({
        ...merged,
        _inquiry_children: vmRecord._inquiry_children ?? merged._inquiry_children,
        _household_children: vmRecord._household_children ?? merged._household_children,
    });
    merged = overlayPrimaryChildScalarsOnRecord(merged, mergedChildren);
    return merged;
}
