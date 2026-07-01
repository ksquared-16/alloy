/**
 * Published layout options for BP stage assignment dropdowns.
 * Keeps UI filtering aligned with validateBusinessProcessLayoutAssignment.
 */

import {
    LAYOUT_ASSIGNMENT_SURFACE_IDENTITIES,
    type LayoutAssignmentSurfaceKey,
} from "@/lib/layout/businessProcessLayoutAssignmentTypes";
import type { EntityLayoutRecord } from "@/lib/layout/layoutV2";
import { isWaitlistQueueLayoutDoc } from "@/lib/layout/runtime/resolveQueueRecordLayoutConfig";
import { resolveSurfaceLayoutKeyFromDoc } from "@/lib/layout/surfaceLayoutRegistry";

function queueLayoutHasV3Metadata(record: EntityLayoutRecord): boolean {
    const meta = record.doc.metadata as { queue_record_layout?: unknown } | undefined;
    return meta?.queue_record_layout != null;
}

function layoutMatchesAssignmentSurface(record: EntityLayoutRecord, surfaceKey: LayoutAssignmentSurfaceKey): boolean {
    const identity = LAYOUT_ASSIGNMENT_SURFACE_IDENTITIES[surfaceKey];
    if (record.entityType !== identity.entityType || record.surface !== identity.surface) return false;
    if (record.status !== "published") return false;

    const docSurface = resolveSurfaceLayoutKeyFromDoc(record.doc);
    if (docSurface && docSurface !== surfaceKey) return false;

    if (surfaceKey === "queue_record") {
        if (isWaitlistQueueLayoutDoc(record.doc)) return false;
        return queueLayoutHasV3Metadata(record) || record.layoutKey === identity.defaultLayoutKey;
    }
    if (surfaceKey === "waitlist_queue_record") {
        if (!isWaitlistQueueLayoutDoc(record.doc)) return false;
        return queueLayoutHasV3Metadata(record) || record.layoutKey === identity.defaultLayoutKey;
    }

    return true;
}

/** Latest published layout per layout_key for a BP assignment slot. */
export function publishedLayoutOptionsForAssignmentSlot(
    records: EntityLayoutRecord[],
    surfaceKey: LayoutAssignmentSurfaceKey,
): EntityLayoutRecord[] {
    const published = records.filter((r) => layoutMatchesAssignmentSurface(r, surfaceKey));
    const byKey = new Map<string, EntityLayoutRecord>();
    for (const row of published) {
        const prev = byKey.get(row.layoutKey);
        if (!prev || row.version > prev.version) byKey.set(row.layoutKey, row);
    }
    return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}
