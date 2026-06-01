import { isPersonDrawerSeedRecord } from "@/lib/admin/drawer/personDrawerOpenSeed";
import { opportunityInquiryTourDisplayFromPrimaryMetadata } from "@/lib/admin/drawer/opportunityDrawerFirstPaintContract";
import { snapshotCanRenderDrawerFrame } from "@/lib/admin/drawer/opportunityDrawerRecordNeedsRevalidate";

/** Readiness layers for drawer first paint — secondary hydrate must not blank chrome. */
export type DrawerFirstPaintReadiness = {
    frame_ready: boolean;
    header_actions_ready: boolean;
    primary_overview_ready: boolean;
    tab_surfaces_ready: boolean;
};

export function opportunityDrawerFrameReady(
    record: Record<string, unknown> | null | undefined,
    drawerId: string | null | undefined
): boolean {
    if (!drawerId || drawerId === "new" || !record) return false;
    if (String(record.id ?? "").trim() !== String(drawerId).trim()) return false;
    return snapshotCanRenderDrawerFrame(record);
}

export function opportunityDrawerHeaderActionsReady(args: {
    frame_ready: boolean;
    header_actions_resolved: boolean;
    header_actions_loading: boolean;
    expect_registry: boolean;
}): boolean {
    if (!args.frame_ready) return false;
    if (!args.expect_registry) return true;
    return args.header_actions_resolved && !args.header_actions_loading;
}

export function opportunityDrawerTourMetadataReady(record: Record<string, unknown> | null | undefined): boolean {
    if (!record) return false;
    return opportunityInquiryTourDisplayFromPrimaryMetadata(record);
}

export function opportunityDrawerTourSlotReady(args: {
    show_tour_slot: boolean;
    tour_from_metadata: boolean;
    tour_bookings_armed: boolean;
    tour_bookings_settled: boolean;
}): boolean {
    if (!args.show_tour_slot) return true;
    if (args.tour_from_metadata) return true;
    return args.tour_bookings_armed && args.tour_bookings_settled;
}

export function personDrawerTypedSnapshot(record: Record<string, unknown> | null | undefined): boolean {
    return isPersonDrawerSeedRecord(record);
}

export function personDrawerCoordinatedBodyReady(args: {
    typed_snapshot: boolean;
    body_hydrated: boolean;
}): boolean {
    void args.typed_snapshot;
    return args.body_hydrated;
}

/** Above-fold person sections must not show empty reserves — hold reveal instead. */
export function personDrawerSectionShowsCoordinatedReserve(args: {
    section_enabled: boolean;
    coordinated_body_ready: boolean;
    section_has_content: boolean;
}): boolean {
    void args;
    return false;
}
