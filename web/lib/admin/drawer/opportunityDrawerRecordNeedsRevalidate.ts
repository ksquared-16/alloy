import type { InquiryChildOcmPlacementSource } from "@/lib/admin/drawer/inquiryChildOcmPlacementDisplay";

function trimOrNull(v: unknown): string | null {
    const s = String(v ?? "").trim();
    return s || null;
}

type InquiryChildRevalidateRow = InquiryChildOcmPlacementSource & {
    location_id?: string | null;
    location_label?: string | null;
};

/** OCM placement type keys present without resolved display labels (stale snapshot). */
export function inquiryChildOcmPlacementLabelsIncomplete(
    row: InquiryChildOcmPlacementSource & { location_id?: string | null; location_label?: string | null }
): boolean {
    const programSet = trimOrNull(row.program_category_id) ?? trimOrNull(row.program_key);
    if (programSet && !trimOrNull(row.desired_program_label)) return true;

    const scheduleType = trimOrNull(row.schedule_type);
    if (scheduleType && !trimOrNull(row.desired_schedule_label)) return true;

    const roomKey = trimOrNull(row.program_room_cohort_key);
    if (roomKey && !trimOrNull(row.program_room_cohort_label)) return true;

    const locationId = trimOrNull(row.location_id);
    if (locationId && !trimOrNull(row.location_label)) return true;

    return false;
}

function inquiryChildrenArrayIncomplete(children: unknown): boolean {
    if (!Array.isArray(children)) return true;
    for (const raw of children) {
        if (!raw || typeof raw !== "object") continue;
        if (inquiryChildOcmPlacementLabelsIncomplete(raw as InquiryChildRevalidateRow)) return true;
    }
    return false;
}

const TYPED_DRAWER_SURFACES = new Set([
    "drawer_primary",
    "drawer_initial",
    "drawer_visible",
    "full",
]);

function recordSurface(record: Record<string, unknown>): string {
    return String(record._record_surface ?? "").trim();
}

/** Typed opportunity snapshot suitable for drawer chrome (frame, header, actions). */
export function opportunityDrawerRecordHasTypedSnapshot(record: Record<string, unknown>): boolean {
    return TYPED_DRAWER_SURFACES.has(recordSurface(record));
}

/** Drawer frame (shell contract, tabs rail) may render from this snapshot. */
export function snapshotCanRenderDrawerFrame(record: Record<string, unknown>): boolean {
    return opportunityDrawerRecordHasTypedSnapshot(record);
}

/** Header actions may resolve from this snapshot without inquiry children or OCM labels. */
export function snapshotCanRenderHeaderActions(record: Record<string, unknown>): boolean {
    return snapshotCanRenderDrawerFrame(record);
}

/** Non–inquiry-children overview sections may render; inquiry block uses section pending. */
export function snapshotCanRenderOverviewBody(record: Record<string, unknown>): boolean {
    return snapshotCanRenderDrawerFrame(record);
}

/** Inquiry children section should wait or show section skeleton until hydrate completes. */
export function snapshotInquiryChildrenNeedHydrate(record: Record<string, unknown>): boolean {
    if (!("_inquiry_children" in record)) return true;
    return inquiryChildrenArrayIncomplete(record._inquiry_children);
}

/**
 * Background full hydrate still needed (silent). Does not block drawer chrome.
 */
export function snapshotNeedsFullRevalidate(record: Record<string, unknown>): boolean {
    const surface = recordSurface(record);
    if (surface !== "full") return true;
    if (record._member_person_graph_pending === true) return true;
    return snapshotInquiryChildrenNeedHydrate(record);
}

/** @deprecated Prefer snapshotNeedsFullRevalidate for background hydrate triggers. */
export function opportunityDrawerRecordNeedsRevalidate(record: Record<string, unknown>): boolean {
    return snapshotNeedsFullRevalidate(record);
}

/** Only block global drawer loading when there is no typed snapshot at all. */
export function opportunityDrawerRestoreShouldHoldLoading(record: Record<string, unknown>): boolean {
    return !snapshotCanRenderDrawerFrame(record);
}
