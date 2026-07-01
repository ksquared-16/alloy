/**
 * Merge VM paint-record widget payloads onto person drawer layout runtime records.
 */

import { buildPersonLayoutRuntimeRecordFromVm } from "@/lib/layout/runtime/buildPersonLayoutRuntimeRecordFromVm";
import { readLayoutRuntimeRepeaterRows } from "@/lib/layout/runtime/readLayoutRuntimeRepeaterRows";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

const PERSON_WIDGET_OVERLAY_KEYS = [
    "_tasks_preview",
    "_operational_attention",
    "_operational_recommendation",
    "_operational_summary",
    "_attention",
    "follow_up_notes",
    "last_activity_summary",
    "last_activity_at",
    "notes",
    "recent_communication",
    "documents",
    "_documents_preview",
] as const;

const CONNECTED_CHILDREN_ITEM = {
    id: "household_children",
    kind: "related_list" as const,
    source: "household_children",
    refKey: "household_children",
};

function connectedChildrenCount(record: ProofRuntimeRecord): number {
    const rows = readLayoutRuntimeRepeaterRows(record, CONNECTED_CHILDREN_ITEM);
    return rows.length;
}

function connectedChildrenHaveDisplayNames(record: ProofRuntimeRecord): boolean {
    const rows = readLayoutRuntimeRepeaterRows(record, CONNECTED_CHILDREN_ITEM);
    for (const row of rows) {
        const name = row["child.name"] ?? row["child.display_name"] ?? row["child.first_name"];
        if (typeof name === "string" && name.trim() && name.trim() !== "—") return true;
    }
    return false;
}

/** Overlay VM connected-children rows when the layout-runtime record is stale or empty. */
function mergePersonLayoutRuntimeChildrenRecord(
    layoutRecord: ProofRuntimeRecord,
    vmRecord: Record<string, unknown>,
    personId: string,
): ProofRuntimeRecord {
    const vmBuilt = buildPersonLayoutRuntimeRecordFromVm({ vmRecord, personId });
    const vmChildren = (vmBuilt.household_children ?? vmBuilt.children) as ProofRuntimeRecord[] | undefined;
    if (!Array.isArray(vmChildren) || vmChildren.length === 0) return layoutRecord;

    const layoutCount = connectedChildrenCount(layoutRecord);
    const shouldOverlay =
        layoutCount === 0 ||
        !connectedChildrenHaveDisplayNames(layoutRecord) ||
        layoutCount < vmChildren.length;

    if (!shouldOverlay) return layoutRecord;

    return {
        ...layoutRecord,
        household_children: vmChildren,
        children: vmChildren,
    };
}

/** Overlay VM widget/attention/children fields onto a person layout runtime record. */
export function mergePersonLayoutRuntimeWidgetRecord(
    layoutRecord: ProofRuntimeRecord,
    vmRecord: Record<string, unknown> | null | undefined,
): ProofRuntimeRecord {
    if (!vmRecord) return layoutRecord;
    const personId = String(layoutRecord["person.id"] ?? layoutRecord.id ?? "").trim();
    if (!personId) return layoutRecord;

    let merged: ProofRuntimeRecord = { ...layoutRecord };
    for (const key of PERSON_WIDGET_OVERLAY_KEYS) {
        if (vmRecord[key] !== undefined) {
            (merged as Record<string, unknown>)[key] = vmRecord[key];
        }
    }

    const overview =
        merged._overview_data && typeof merged._overview_data === "object"
            ? { ...(merged._overview_data as Record<string, unknown>) }
            : { ...vmRecord };
    for (const key of PERSON_WIDGET_OVERLAY_KEYS) {
        if (vmRecord[key] !== undefined) {
            overview[key] = vmRecord[key];
        }
    }
    merged._overview_data = overview;
    merged = mergePersonLayoutRuntimeChildrenRecord(merged, vmRecord, personId);
    return merged;
}
