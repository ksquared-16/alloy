"use client";

import { useEffect } from "react";
import { operatorWorkUnitHrefFromKey } from "@/lib/admin/canonicalOperatorRoutes";
import { useWorkUnitEntryMovement } from "@/lib/runtime/kernel/useWorkUnitEntryGesture";
import { formatCardFocusAspect } from "@/lib/runtime/kernel/attentionCardFocus";
import {
    ADMINV2_OPERATOR_FOCUS_SELECTION_EVENT,
    type OperatorFocusSelectionDetail,
} from "@/lib/runtime/focus/operatorFocusSelection";

/**
 * Takes an operator focus intent into the Runtime Kernel as an ATTENTION MOVEMENT.
 *
 * This is the one applier for every producer that cannot reach the kernel itself — Search in the top
 * nav, contextual record opens in shell chrome, quick-message record chips. It was written for Search
 * (`SearchAttentionListener`) and is unchanged in behaviour; only its name and its event stopped
 * pretending Search is special.
 *
 * ── WHY A MOVEMENT AND NOT A NAVIGATION ──
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
 * ── CARD AND ITEM FOCUS RIDE THE SAME MOVEMENT ──
 *
 * They are carried as the ASPECT — the kernel's own scope for "finer than the Operational Subject" —
 * not as drawer state. `openDrawer` was tried and is wrong here: on a work-unit surface it mounts the
 * modal overlay this work removes, because `AdminEntityDrawer` suppresses itself by testing
 * `usePathname()`, which cannot observe the address the kernel projects with `replaceState`.
 * Measured `modal: 1` over a correctly composed inline panel.
 */
export default function OperatorFocusAttentionListener() {
    const move = useWorkUnitEntryMovement();

    useEffect(() => {
        const onSelect = (ev: Event) => {
            const detail = (ev as CustomEvent<OperatorFocusSelectionDetail>).detail;
            // PARTICIPANT POSITION FIRST. The Work View holding this participant's own stage wins
            // over the case's unit, which answers at family grain: siblings in one case sit in
            // different stages, so the family answer cannot be right for both. Falls back to the
            // case unit when the stage has no configured view — a fallback, never an override.
            const hostSlug =
                (detail?.host_work_view_id ?? "").trim() || (detail?.host_work_unit_key ?? "").trim();
            const hostId = (detail?.entity_id ?? "").trim();
            // Nothing holds this record: there is no operational surface to move to, and inventing
            // one would commit the operator to a queue the record is not in.
            if (!hostSlug || !hostId) return;

            // THE ROW, NOT THE HOST. `entity_id` is the record whose Focus Panel composes; the Work
            // View selects on its own evaluated row identity, which for a child-grain lens is a
            // participation, not the case. Sending the host here is what the runtime refused as
            // `subject_unavailable`. Falls back to the host, which is exactly right for family grain
            // because there the case IS the evaluated row.
            const memberId = (detail?.operational_member_id ?? "").trim() || hostId;

            // The href is the destination's honest address; the adapter parses the attention it
            // expresses. The selected row rides along so the surface commits the record the operator
            // asked for rather than the lens's default subject, and the card + item ride along as
            // the ASPECT — the kernel's own name for "finer than the subject".
            move(
                operatorWorkUnitHrefFromKey(hostSlug),
                null,
                memberId,
                formatCardFocusAspect(detail.card_focus ?? null),
            );
        };

        window.addEventListener(ADMINV2_OPERATOR_FOCUS_SELECTION_EVENT, onSelect);
        return () => window.removeEventListener(ADMINV2_OPERATOR_FOCUS_SELECTION_EVENT, onSelect);
    }, [move]);

    return null;
}
