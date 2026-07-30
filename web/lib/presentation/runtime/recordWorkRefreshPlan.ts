/**
 * Record-work refresh policy for Focus Panel / What's Next.
 *
 * Distinguishes field-readiness mutations (program/placement) from work-lifecycle
 * mutations (outcomes, stage moves). Field readiness must recompose "Still needed"
 * from the patched record without a stage-work refetch that can overwrite truth.
 */

export type RecordWorkRefreshKind = "field_readiness" | "tour_surface" | "work_lifecycle";

export type RecordWorkRefreshPlan = {
    kind: RecordWorkRefreshKind;
    /** Drop session drawer VM so the next cold load is authoritative. */
    invalidateVmCache: boolean;
    /** Drop stage-work warm entries for this record. */
    invalidateStageWork: boolean;
    /** Full VM reload through the record-work runtime. */
    reloadDisplayVm: boolean;
    /** Force stage-work network resolve (bypass warm) during that reload. */
    forceStageWork: boolean;
    /** Tour surfaces: refresh header actions only. */
    refreshHeaderActions: boolean;
};

/** Placement / program / identity field saves — readiness recomposes from record patch. */
const FIELD_READINESS_ACTION_KEYS = new Set([
    "inquiry_child_placement_scope",
    "inquiry_child_identity",
    "inquiry_children_placement",
    "customer_member_inline_save",
    "person_contact_save",
    "person_record_updated",
    "inline_save",
]);

const TOUR_SURFACE_ACTION_KEYS = new Set([
    "schedule_tour",
    "reschedule_tour",
    "tour_booking",
    "record_tour_outcome",
    "confirm_tour",
]);

export function classifyRecordWorkRefreshKind(actionKey: string | null | undefined): RecordWorkRefreshKind {
    const key = (actionKey ?? "").trim();
    if (FIELD_READINESS_ACTION_KEYS.has(key)) return "field_readiness";
    if (TOUR_SURFACE_ACTION_KEYS.has(key)) return "tour_surface";
    return "work_lifecycle";
}

export function planRecordWorkRefresh(actionKey: string | null | undefined): RecordWorkRefreshPlan {
    const kind = classifyRecordWorkRefreshKind(actionKey);
    switch (kind) {
        case "field_readiness":
            return {
                kind,
                // Future cold loads must not resurrect pre-save field truth.
                invalidateVmCache: true,
                // Keep seeded / warm stage-work — work identity did not change.
                invalidateStageWork: false,
                // Do not reload: a session cache_hit would overwrite optimistic record patches.
                reloadDisplayVm: false,
                forceStageWork: false,
                refreshHeaderActions: false,
            };
        case "tour_surface":
            return {
                kind,
                invalidateVmCache: false,
                invalidateStageWork: true,
                reloadDisplayVm: false,
                forceStageWork: false,
                refreshHeaderActions: true,
            };
        case "work_lifecycle":
            return {
                kind,
                invalidateVmCache: true,
                invalidateStageWork: true,
                reloadDisplayVm: true,
                forceStageWork: true,
                refreshHeaderActions: false,
            };
    }
}

export function isFieldReadinessRecordWorkActionKey(actionKey: string | null | undefined): boolean {
    return classifyRecordWorkRefreshKind(actionKey) === "field_readiness";
}
