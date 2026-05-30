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
    const programType = trimOrNull(row.desired_program_type);
    if (programType && !trimOrNull(row.desired_program_label)) return true;

    const scheduleType = trimOrNull(row.desired_schedule_type);
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

/**
 * Whether an opportunity drawer cache snapshot needs full hydrate before showing
 * inquiry/placement-dependent content (restore from person nav, incomplete cache hit).
 */
export function opportunityDrawerRecordNeedsRevalidate(record: Record<string, unknown>): boolean {
    const surface = String(record._record_surface ?? "").trim();
    if (surface !== "full") return true;
    if (record._member_person_graph_pending === true) return true;

    if (!("_inquiry_children" in record)) return true;

    return inquiryChildrenArrayIncomplete(record._inquiry_children);
}

/** Hold coordinated overview / primary loading shell until snapshot is authoritative. */
export function opportunityDrawerRestoreShouldHoldLoading(record: Record<string, unknown>): boolean {
    return opportunityDrawerRecordNeedsRevalidate(record);
}
