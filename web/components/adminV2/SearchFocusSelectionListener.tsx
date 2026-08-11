"use client";

import { useEffect } from "react";
import { useAdminDrawer, type AdminDrawerEntityType } from "@/contexts/AdminDrawerContext";
import {
    ADMINV2_SEARCH_FOCUS_SELECTION_EVENT,
    type SearchFocusSelectionDetail,
} from "@/lib/adminV2/searchFocusSelection";

/**
 * Applies a Search selection to the ONE selection authority.
 *
 * Mounted inside `AdminDrawerProvider` because the search control is not — the
 * top nav renders outside it. The listener owns no state; it forwards subject +
 * card focus to `openDrawer` so the inline Focus Panel lands on the requested
 * card. It never opens the modal drawer product: on work-unit surfaces
 * `AdminEntityDrawer` returns null and the inline panel owns rendering, which is
 * why the caller navigates to the configured host first.
 */
export default function SearchFocusSelectionListener() {
    const { openDrawer } = useAdminDrawer();

    useEffect(() => {
        const onSelect = (ev: Event) => {
            const d = (ev as CustomEvent<SearchFocusSelectionDetail>).detail;
            const id = d?.entity_id?.trim();
            const type = d?.entity_type?.trim();
            if (!id || !type) return;

            openDrawer({
                type: type as AdminDrawerEntityType,
                id,
                source: "global_search",
                drawerSubjectContext: {
                    focus_mode: d.subject_highlight ? "subject_highlight" : "case_default",
                    lifecycle_visual_stage_key: "",
                    related_subjects: [],
                    card_focus: d.card_focus,
                },
            });
        };
        window.addEventListener(ADMINV2_SEARCH_FOCUS_SELECTION_EVENT, onSelect);
        return () => window.removeEventListener(ADMINV2_SEARCH_FOCUS_SELECTION_EVENT, onSelect);
    }, [openDrawer]);

    return null;
}
