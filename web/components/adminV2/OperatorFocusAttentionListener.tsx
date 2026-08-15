"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
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
 * ── …AND WHY THERE IS NEVERTHELESS A PUSH BELOW ──
 *
 * All of the above holds WHILE A KERNEL EXISTS. It does not on the workspace ROOT, where this
 * listener is mounted but the kernel is not — the kernel comes with the work-unit surface. There,
 * `move()` returns false and the gesture used to end in silence: dispatched, received, nothing
 * moved, operator left where they stood.
 *
 * The kernel spans the whole workspace, so a movement from the ROOT succeeds and paints nothing —
 * the root renders no Surface Host. The push below therefore runs only when the operator is NOT
 * already on a work-unit surface, which is the only situation where a URL is both permitted (Art
 * 2.4, cold load) and necessary. On a work-unit surface the movement is unchanged.
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
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        const onSelect = (ev: Event) => {
            const detail = (ev as CustomEvent<OperatorFocusSelectionDetail>).detail;
            // PARTICIPANT POSITION FIRST. The Work View holding this participant's own stage wins
            // over the case's unit, which answers at family grain: siblings in one case sit in
            // different stages, so the family answer cannot be right for both. Falls back to the
            // case unit when the stage has no configured view — a fallback, never an override.
            const viewSlug = (detail?.host_work_view_id ?? "").trim();
            const hostSlug = viewSlug || (detail?.host_work_unit_key ?? "").trim();
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

            // ── NO COHORT HOLDS THEM, AND THAT IS STATED ────────────────────────────────────────
            //
            // `host_work_view_id` is the Work View that DEMONSTRABLY contains this subject: the
            // producer resolves it from real memberships and returns null when there are none. Its
            // absence is therefore not a gap to paper over — it is the producer saying "no cohort
            // holds them; here is only their host."
            //
            // Both branches used to collapse into the slug, and the surface then resolved that host's
            // default lens. That is why `Kelly → Household` shows `New` as selected: not a cohort she
            // is in, just the first one configured on the unit her household's case happens to sit on.
            // Stating the absence lands on the record with no pill lit, which is what was asked for.
            //
            // Destinations that DID resolve a view are untouched: All / Tours / Waitlist still address
            // a Work View by slug, byte for byte as before.
            const cohort = viewSlug ? null : ("none" as const);
            // Contextual attention selects the HOST RECORD. `operational_member_id` is a Work View ROW
            // identity — a participation, for a child-grain lens — and no Work View was selected here,
            // so using it would name a row of a cohort nobody chose.
            const subjectId = cohort === "none" ? hostId : memberId;

            // The href is the destination's honest address; the adapter parses the attention it
            // expresses. The selected row rides along so the surface commits the record the operator
            // asked for rather than the lens's default subject, and the card + item ride along as
            // the ASPECT — the kernel's own name for "finer than the subject".
            const href = operatorWorkUnitHrefFromKey(hostSlug);
            const aspect = formatCardFocusAspect(detail.card_focus ?? null);

            /*
             * ── A MOVEMENT NEEDS A SURFACE TO MOVE ON ────────────────────────────────────────────
             *
             * The kernel is mounted across the whole workspace, so attention moves happily from the
             * workspace ROOT — and nothing appears, because the root renders no work-unit Surface
             * Host. The movement is real and invisible: dispatched, applied, and with nowhere to
             * paint. That is what left an operational Search result sitting on `/workspace`.
             *
             * So the branch is on WHERE THE OPERATOR IS, not on whether the kernel exists:
             *
             *   already on a work-unit surface → MOVE. The route is seed-only and a push there
             *                                    renders nothing (Gate A) — unchanged, byte for byte.
             *   anywhere else in the workspace → NAVIGATE. Cold load is the one moment a URL may
             *                                    establish attention (Art 2.4), and it is the only
             *                                    way to reach the surface that can render it.
             *
             * Every axis rides the address because the page segment already parses all of them —
             * `subject_id`, `work_view_id`, `cohort`, `aspect` — so the cold answer composes the same
             * attention the movement expresses. No new contract, no new parameter.
             */
            const onWorkUnitSurface = (pathname ?? "").includes("/work-unit/");
            if (onWorkUnitSurface) {
                move(href, null, subjectId, aspect, { cohort });
                return;
            }

            const params = new URLSearchParams({ subject_id: subjectId });
            if (aspect) params.set("aspect", aspect);
            if (cohort === "none") params.set("cohort", "none");
            router.push(`${href}${href.includes("?") ? "&" : "?"}${params.toString()}`);
        };

        window.addEventListener(ADMINV2_OPERATOR_FOCUS_SELECTION_EVENT, onSelect);
        return () => window.removeEventListener(ADMINV2_OPERATOR_FOCUS_SELECTION_EVENT, onSelect);
    }, [move, router, pathname]);

    return null;
}
