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

/**
 * THE FOCUS PANEL SUMMARY IS NOT AN OPPORTUNITY DRAWER, THOUGH IT LOOKS LIKE ONE HERE.
 *
 * `entity_layouts` addresses both surfaces as `opportunities` / `drawer`, and
 * `resolveSurfaceLayoutKeyFromDoc` classifies purely on that pair — so it answers
 * "opportunity_drawer" for a Focus Panel Summary document. Every Focus Panel Summary
 * version therefore appeared in the drawer assignment dropdowns, and an operator could
 * assign one to a Work View or a Business Process stage.
 *
 * Those assignments were inert. The Focus Panel Summary runtime does not resolve by an
 * assigned layout id at all: it selects the applicable published variant through
 * `resolveSurfaceVariant`, by the constraints a layout declares in its own metadata, and
 * breaks ties by highest version. Pinning a row id could only ever pin a VERSION — and
 * measured on the live tenant that is exactly what had happened: two Work Views pointed at
 * focus_panel_summary v10 and v132 while the runtime was resolving v143.
 *
 * The layout key is the only thing that separates the two surfaces at this seam, so it is
 * what excludes them. Kept as a local constant rather than imported from the Focus Panel
 * model to avoid a cycle (`focusPanelLayoutDocModel` already reads from `lib/layout`);
 * `layoutAssignmentLayoutOptions.test.ts` pins the two spellings together.
 */
const FOCUS_PANEL_SUMMARY_LAYOUT_KEY = "focus_panel_summary";

/** A Focus Panel Summary layout may never be assigned as a drawer surface. PURE. */
export function isFocusPanelSummaryLayoutRecord(record: Pick<EntityLayoutRecord, "layoutKey">): boolean {
    return record.layoutKey === FOCUS_PANEL_SUMMARY_LAYOUT_KEY;
}

function layoutMatchesAssignmentSurface(record: EntityLayoutRecord, surfaceKey: LayoutAssignmentSurfaceKey): boolean {
    const identity = LAYOUT_ASSIGNMENT_SURFACE_IDENTITIES[surfaceKey];
    if (record.entityType !== identity.entityType || record.surface !== identity.surface) return false;
    if (record.status !== "published") return false;
    if (isFocusPanelSummaryLayoutRecord(record)) return false;

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
