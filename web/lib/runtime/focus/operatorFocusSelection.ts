import type { CardFocusInput } from "@/lib/runtime/kernel/attentionCardFocus";

/**
 * Transport for an operator focus intent stated OUTSIDE the Runtime Kernel.
 *
 * Two mounting facts make this necessary, and neither is incidental:
 *
 *   - `GlobalSearchBox` renders in `TopNavBar`, which is mounted above the workspace providers
 *     entirely. It cannot hold the kernel.
 *   - `ContextualRecordOpenListener` and the shell chrome mount in `AdminV2ShellDrawerScope`, which
 *     wraps the workspace tree — so they are INSIDE the workspace layout but ABOVE the kernel.
 *
 * That second case is the subtle one and the reason this is an event rather than a route push. A
 * `router.push` from inside the workspace layout to `/workspace/work-unit/:slug` does not navigate in
 * any useful sense: the route is SEED-ONLY, the layout does not remount, so nothing re-reads the URL
 * and the surface goes blank with no error. Only an adapter mounted inside the kernel can move
 * attention once the layout is live — so callers above it state intent, and
 * `OperatorFocusAttentionListener` performs the movement through the same adapter every other
 * work-unit entry point uses.
 *
 * (A push IS correct when crossing out of the workspace layout — `/admin/messages` → a work unit is a
 * genuine cold entry, and a URL may establish attention exactly once, on cold load. That branch lives
 * in `useOperatorRecordFocus`, which is the only place that knows which world the caller is in.)
 */
export const ADMINV2_OPERATOR_FOCUS_SELECTION_EVENT = "adminv2:operator-focus-selection";

export type OperatorFocusSelectionDetail = {
    /** The record whose Focus Panel hosts the subject. */
    entity_type: string;
    entity_id: string;
    /** Configured work-unit host to move to. Without one there is no operational surface. */
    host_work_unit_key?: string | null;
    /**
     * The configured Work View holding THIS PARTICIPANT's stage. Preferred over
     * `host_work_unit_key`, which answers at case grain — a child in the same case can sit in a
     * different stage, and the family answer sends them to a queue that does not contain them.
     * Both occupy the same slug position: `/workspace/work-unit/:slug` resolves work-unit keys and
     * Work View slugs alike.
     */
    host_work_view_id?: string | null;
    /**
     * The Work View ROW to select — `subjectRows[].entityId`.
     *
     * Separate from `entity_id` above, which stays the HOST the panel composes against. For a
     * family-grain lens the two coincide; for a child-grain lens the row is a participation and the
     * host is the case, and sending the host as the subject is refused by the runtime's membership
     * guard. Absent, the host remains the subject and nothing changes for existing callers.
     */
    operational_member_id?: string | null;
    /** Card + item to land on inside that panel, carried as the kernel's ASPECT. */
    card_focus?: CardFocusInput | null;
};

/** State an operator focus intent. `OperatorFocusAttentionListener` performs it. */
export function dispatchOperatorFocusSelection(detail: OperatorFocusSelectionDetail): void {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(ADMINV2_OPERATOR_FOCUS_SELECTION_EVENT, { detail }));
}

/** The fields of a Search destination a focus selection is built from (`SearchDestination` subset). */
export type FocusDestinationLike = {
    target?: string | null;
    card_key?: string | null;
    item_id?: string | null;
    context_key?: string | null;
    host_entity_type?: string | null;
    host_entity_id?: string | null;
    host_work_unit_key?: string | null;
    host_work_view_id?: string | null;
    operational_member_id?: string | null;
};

/**
 * THE ONE MAPPING from a resolved destination to the focus intent that opens it.
 *
 * Search built this inline; the Children card (E2E-18) opens a tracked child through the SAME
 * destination — the durable record's `relatedWork`, produced by Search's own resolver — so the mapping
 * lives here and both dispatch byte-identical selections. Null when the destination cannot be opened
 * in a Focus Panel (wrong target, or no host record).
 */
export function operatorFocusSelectionFromDestination(
    destination: FocusDestinationLike,
): OperatorFocusSelectionDetail | null {
    const hostType = (destination.host_entity_type ?? "").trim();
    const hostId = (destination.host_entity_id ?? "").trim();
    if (destination.target !== "focus_panel" || !destination.card_key || !hostType || !hostId) return null;
    return {
        entity_type: hostType,
        entity_id: hostId,
        host_work_unit_key: (destination.host_work_unit_key ?? "").trim() || null,
        // The participant's own Work View, when their stage has one — preferred over the case unit.
        host_work_view_id: (destination.host_work_view_id ?? "").trim() || null,
        // The Work View's own ROW identity (a participation on a child-grain lens), kept apart from
        // the host the panel composes against.
        operational_member_id: (destination.operational_member_id ?? "").trim() || null,
        card_focus: {
            card_key: destination.card_key,
            item_id: destination.item_id ?? null,
            context_key: destination.context_key ?? null,
        },
    };
}
