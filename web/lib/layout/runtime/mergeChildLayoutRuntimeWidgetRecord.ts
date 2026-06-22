/**
 * Merge VM paint-record widget payloads onto child drawer layout runtime records.
 */

import { buildChildLayoutRuntimeRecordFromVm } from "@/lib/layout/runtime/buildChildLayoutRuntimeRecordFromVm";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

const CHILD_WIDGET_OVERLAY_KEYS = [
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

function familyAdultsCount(record: ProofRuntimeRecord): number {
    const adults = record.family_adults;
    return Array.isArray(adults) ? adults.length : 0;
}

function familyAdultsHaveDisplayNames(record: ProofRuntimeRecord): boolean {
    const adults = record.family_adults;
    if (!Array.isArray(adults)) return false;
    for (const row of adults) {
        if (!row || typeof row !== "object") continue;
        const rec = row as Record<string, unknown>;
        const name = rec["person.primary_contact_name"] ?? rec["person.name"];
        if (typeof name === "string" && name.trim() && name.trim() !== "—") return true;
    }
    return false;
}

/** Overlay VM family rows when the layout-runtime record is stale or empty. */
function mergeChildLayoutRuntimeFamilyRecord(
    layoutRecord: ProofRuntimeRecord,
    vmRecord: Record<string, unknown>,
    personId: string,
): ProofRuntimeRecord {
    const vmBuilt = buildChildLayoutRuntimeRecordFromVm({ vmRecord, personId });
    const vmFamily = vmBuilt.family_adults;
    if (!Array.isArray(vmFamily) || vmFamily.length === 0) return layoutRecord;

    const layoutCount = familyAdultsCount(layoutRecord);
    const shouldOverlay =
        layoutCount === 0 ||
        !familyAdultsHaveDisplayNames(layoutRecord) ||
        layoutCount < vmFamily.length;

    if (!shouldOverlay) return layoutRecord;

    return {
        ...layoutRecord,
        family_adults: vmFamily,
    };
}

/** Overlay VM widget/family/enrollment fields onto a child layout runtime record. */
export function mergeChildLayoutRuntimeWidgetRecord(
    layoutRecord: ProofRuntimeRecord,
    vmRecord: Record<string, unknown> | null | undefined,
): ProofRuntimeRecord {
    if (!vmRecord) return layoutRecord;
    const personId = String(layoutRecord["child.id"] ?? layoutRecord.person_id ?? layoutRecord.id ?? "").trim();
    if (!personId) return layoutRecord;

    let merged: ProofRuntimeRecord = { ...layoutRecord };
    for (const key of CHILD_WIDGET_OVERLAY_KEYS) {
        if (vmRecord[key] !== undefined) {
            (merged as Record<string, unknown>)[key] = vmRecord[key];
        }
    }

    const overview =
        merged._overview_data && typeof merged._overview_data === "object"
            ? { ...(merged._overview_data as Record<string, unknown>) }
            : { ...vmRecord };
    for (const key of CHILD_WIDGET_OVERLAY_KEYS) {
        if (vmRecord[key] !== undefined) {
            overview[key] = vmRecord[key];
        }
    }
    merged._overview_data = overview;

    const vmBuilt = buildChildLayoutRuntimeRecordFromVm({ vmRecord, personId });
    for (const scalarKey of [
        "child.status",
        "child.program",
        "inquiry_child.desired_program_type",
        "inquiry_child.desired_start_date",
        "inquiry_child.outcome_status_key",
        "customer.household_name",
        "location.household_address",
    ] as const) {
        const vmVal = vmBuilt[scalarKey];
        const layoutVal = merged[scalarKey];
        if (vmVal != null && String(vmVal).trim() && (!layoutVal || String(layoutVal).trim() === "—")) {
            merged[scalarKey] = vmVal;
        }
    }

    merged = mergeChildLayoutRuntimeFamilyRecord(merged, vmRecord, personId);
    return merged;
}
