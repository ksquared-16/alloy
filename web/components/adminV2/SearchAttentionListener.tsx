"use client";

import { useEffect } from "react";
import { operatorWorkUnitHrefFromKey } from "@/lib/admin/canonicalOperatorRoutes";
import { useWorkUnitEntryMovement } from "@/lib/runtime/kernel/useWorkUnitEntryGesture";
import { formatCardFocusAspect } from "@/lib/runtime/kernel/attentionCardFocus";
import {
    ADMINV2_SEARCH_FOCUS_SELECTION_EVENT,
    type SearchFocusSelectionDetail,
} from "@/lib/adminV2/searchFocusSelection";

/**
 * Takes a Search selection into the Runtime Kernel as an ATTENTION MOVEMENT.
 *
 * ── WHY THIS EXISTS AT ALL ──
 *
 * `/workspace/work-unit/:slug` is SEED-ONLY: `WorkUnitSlugRouteHost` renders `null` and the Surface
 * Host — mounted above the route, inside `RuntimeKernelProvider` — is the one renderer of the
 * work-unit surface, committed from focus. A URL may establish attention exactly once, on cold load
 * (Art 2.4); after that only an adapter can move it.
 *
 * So `router.push` to a work-unit route does not open anything. It is not slow, and it does not
 * error: the URL changes, the server renders the route perfectly, and the surface goes blank and
 * stays blank. That is precisely what a Search click did, and it is the documented failure mode in
 * `useWorkUnitEntryGesture` — "an entry point that is not wired to K1 is not merely un-migrated; it
 * is broken."
 *
 * ── WHY A LISTENER RATHER THAN A HOOK IN THE SEARCH CONTROL ──
 *
 * `GlobalSearchBox` renders in the top nav, which is mounted ABOVE `RuntimeKernelProvider` — the
 * kernel is deliberately above the Surface Host and outside the route subtree so one kernel survives
 * every Workspace ⇄ Work Unit movement. The control therefore cannot hold the kernel; it states
 * intent, and this listener — mounted inside the kernel — performs the movement through the SAME
 * adapter every other work-unit entry point uses. Adding a second gesture path is what created the
 * blank-surface defect in the first place.
 *
 * ── CARD AND ITEM FOCUS RIDE THE SAME MOVEMENT ──
 *
 * They are carried as the ASPECT — the kernel's own scope for "finer than the Operational Subject" —
 * not as drawer state. `openDrawer` was tried and is wrong here: on a work-unit surface it mounts the
 * modal overlay this work removes, because `AdminEntityDrawer` suppresses itself by testing
 * `usePathname()`, which cannot observe the address the kernel projects with `replaceState`.
 * Measured `modal: 1` over a correctly composed inline panel.
 */
export default function SearchAttentionListener() {
    const move = useWorkUnitEntryMovement();

    useEffect(() => {
        const onSelect = (ev: Event) => {
            const detail = (ev as CustomEvent<SearchFocusSelectionDetail>).detail;
            const hostKey = (detail?.host_work_unit_key ?? "").trim();
            const hostId = (detail?.entity_id ?? "").trim();
            // No work unit holds this record: there is no operational surface to move to, and
            // inventing one would commit the operator to a queue the record is not in.
            if (!hostKey || !hostId) return;

            // The href is the destination's honest address; the adapter parses the attention it
            // expresses. The subject rides along so the surface commits the record the operator
            // asked for rather than the lens's default subject, and the card + item ride along as
            // the ASPECT — the kernel's own name for "finer than the subject".
            move(
                operatorWorkUnitHrefFromKey(hostKey),
                null,
                hostId,
                formatCardFocusAspect(detail.card_focus),
            );
        };

        window.addEventListener(ADMINV2_SEARCH_FOCUS_SELECTION_EVENT, onSelect);
        return () => window.removeEventListener(ADMINV2_SEARCH_FOCUS_SELECTION_EVENT, onSelect);
    }, [move]);

    return null;
}
