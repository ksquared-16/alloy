import type { DrawerCardFocus } from "@/lib/workUnits/lifecycleSubjectContracts";

/**
 * Transport for a Search selection across a provider boundary.
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

export function dispatchSearchFocusSelection(detail: SearchFocusSelectionDetail): void {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(ADMINV2_SEARCH_FOCUS_SELECTION_EVENT, { detail }));
}
