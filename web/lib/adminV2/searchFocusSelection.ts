import type { DrawerCardFocus } from "@/lib/workUnits/lifecycleSubjectContracts";

/**
 * Transport for a Search selection across a provider boundary AND across a route
 * transition.
 *
 * `GlobalSearchBox` renders in `TopNavBar`, which mounts OUTSIDE
 * `AdminDrawerProvider` — calling `useAdminDrawer()` there throws and takes the
 * whole top nav down with it (browser certification caught exactly that). So the
 * control states intent and a listener inside the provider applies it.
 *
 * This is NOT a second selection authority. There is one: `AdminDrawerContext`.
 * This carries a request to it, the way the deleted drawer listener carried one —
 * the difference being that the request now names a subject AND a card, and is
 * applied to the inline Focus Panel rather than a modal overlay.
 *
 * ── ONE EVENT, TWO APPLIERS, AND NO ROUTE PUSH ──
 *
 * Clicking a Search result usually changes surface: the subject's Focus Panel is
 * hosted by a Work Unit, and the operator may be anywhere. It is tempting to make
 * that a navigation. It cannot be. `/workspace/work-unit/:slug` is SEED-ONLY — the
 * route renders nothing, and the Surface Host inside the Runtime Kernel is the one
 * renderer of the work-unit surface, committed from focus. A URL may establish
 * attention exactly once, on cold load; after that only a kernel adapter can move
 * it. A `router.push` therefore changes the address and blanks the surface, with no
 * error and no recovery — measured, and the failure mode the kernel's own entry
 * gesture documents.
 *
 * So this event states the whole intent once, and it is applied where the search
 * control cannot reach:
 *
 *   SearchAttentionListener       (inside RuntimeKernelProvider)
 *       → SURFACE movement to the host work unit, then a SUBJECT movement pinning
 *         the host record. The URL is projected FROM that commit.
 *
 *   SearchFocusSelectionListener  (inside AdminDrawerProvider)
 *       → card + item focus on the one selection authority.
 *
 * The two are order-independent: the panel keys its focus request on subject +
 * card + item, so it lands whichever arrives first. Rapid clicks need no
 * bookkeeping here — the kernel supersedes an in-flight attention movement with a
 * newer one, so the last click is the one that commits.
 */
export const ADMINV2_SEARCH_FOCUS_SELECTION_EVENT = "adminv2:search-focus-selection";

export type SearchFocusSelectionDetail = {
    /** Record whose Focus Panel hosts the subject. */
    entity_type: string;
    entity_id: string;
    /** Configured work-unit host to navigate to first, when one exists. */
    host_work_unit_key?: string | null;
    /** Card + item to land on inside that panel. */
    card_focus: DrawerCardFocus;
    /** `case_default` for a household subject, `subject_highlight` otherwise. */
    subject_highlight: boolean;
};

/** State a Search selection. Both listeners above receive it. */
export function dispatchSearchFocusSelection(detail: SearchFocusSelectionDetail): void {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(ADMINV2_SEARCH_FOCUS_SELECTION_EVENT, { detail }));
}
