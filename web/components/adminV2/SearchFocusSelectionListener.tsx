"use client";

import { useEffect } from "react";
import { useAdminDrawer, type AdminDrawerEntityType } from "@/contexts/AdminDrawerContext";
import {
    ADMINV2_SEARCH_FOCUS_SELECTION_EVENT,
    type SearchFocusSelectionDetail,
} from "@/lib/adminV2/searchFocusSelection";

/**
 * Applies a Search selection's CARD AND ITEM focus to the ONE selection authority.
 *
 * Mounted inside `AdminDrawerProvider` because the search control is not — the top nav renders
 * outside it. This listener owns no state; it forwards subject + card focus to `openDrawer`, and
 * `OpportunityFocusPanelModeBody` bridges `drawerSubjectContext.card_focus` into the grid's existing
 * `activeDepth`/`elevatedCellKey` machinery. It never opens the modal drawer product: on work-unit
 * surfaces `AdminEntityDrawer` returns null and the inline panel owns rendering.
 *
 * It is deliberately NOT responsible for getting the operator to the hosting surface. That is an
 * attention movement through the Runtime Kernel, and `SearchAttentionListener` — mounted inside the
 * kernel, which sits above this provider — performs it from the same event. The two are
 * order-independent: the panel keys its focus request on subject + card + item, so the request lands
 * whether it was written before or after the surface composed.
 */
export default function SearchFocusSelectionListener() {
    const { openDrawer } = useAdminDrawer();

    useEffect(() => {
        const onSelect = (ev: Event) => {
            const d = (ev as CustomEvent<SearchFocusSelectionDetail>).detail;
            const id = d?.entity_id?.trim();
            const type = d?.entity_type?.trim();
            if (!id || !type) return;

            // ── DO NOT OPEN THE DRAWER WHEN THE DESTINATION IS AN INLINE SURFACE ──
            //
            // `AdminEntityDrawer` suppresses the modal on work-unit surfaces by testing
            // `usePathname()`. That test cannot succeed here: a Search click is an
            // attention movement, and the kernel projects the resulting address with
            // `replaceState`, which Next's `usePathname` does not observe — on a gesture
            // entry from the Workspace the route even stays `/workspace`. So the drawer
            // does not know it is on a work-unit surface, and `openDrawer` mounts the
            // exact modal overlay this work exists to remove. Measured: `modal: 1` over
            // a correctly composed inline panel.
            //
            // A destination with a host work unit is therefore left entirely to
            // `SearchAttentionListener`. Card and item focus for the INLINE panel is not
            // yet delivered — it must ride the attention movement rather than the drawer,
            // because the drawer is not the selection authority on that surface.
            if ((d.host_work_unit_key ?? "").trim()) return;

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
