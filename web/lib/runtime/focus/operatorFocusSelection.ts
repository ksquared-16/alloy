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
    /** Card + item to land on inside that panel, carried as the kernel's ASPECT. */
    card_focus?: CardFocusInput | null;
};

/** State an operator focus intent. `OperatorFocusAttentionListener` performs it. */
export function dispatchOperatorFocusSelection(detail: OperatorFocusSelectionDetail): void {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(ADMINV2_OPERATOR_FOCUS_SELECTION_EVENT, { detail }));
}
