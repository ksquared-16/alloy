"use client";

/**
 * THE Work Unit entry gesture — one adapter, every entry point.
 *
 * Certification proved why this must be shared rather than per-component: the Workspace has TWO
 * links to the same Work Unit (the process CTA in ProcessSummaryCard and the Today's-Work row in
 * WorkViewList). Wiring only one left the other navigating, and because the route is now seed-only
 * (PresentationRuntime no longer mounts the Work Unit), that navigation unmounted the Workspace and
 * rendered NOTHING — a blank surface. An entry point that is not wired to K1 is not merely
 * un-migrated; it is broken.
 *
 * So this is the single adapter both use. Adding a second gesture path would recreate the defect.
 *
 * Kernel §K1: "Receive every attention movement, at every scope, from every expression." Pointer and
 * keyboard both arrive here as a click, so they share one mechanism by construction.
 */
import { useCallback, type MouseEvent as ReactMouseEvent } from "react";
import { useRuntimeKernelOptional } from "./RuntimeKernelContext";
import { ATTENTION_SCOPE } from "./attention";
import type { DestinationId } from "@/lib/runtime/graph/destinationId";
import { useWorkspaceOrg } from "@/contexts/WorkspaceOrgContext";
import { workUnitRouteSlugToKey } from "@/lib/admin/workUnitRouteSlug";

/** Parse a work-unit entry href into the attention it expresses. */
export function attentionTargetFromEntryHref(href: string): { target: string; lens: string | null } | null {
    try {
        const u = new URL(href, "http://local");
        const m = u.pathname.match(/\/workspace\/work-unit\/([^/?#]+)/);
        if (!m) return null;
        return { target: decodeURIComponent(m[1]), lens: u.searchParams.get("work_view_id") };
    } catch {
        return null;
    }
}

/**
 * THE movement itself, separated from the click that usually expresses it.
 *
 * Some entry points are not clicks on an element that carries the href — Search resolves a
 * destination server-side and states it as an intent. Those must still enter through THIS adapter:
 * the warning above is not about pointers, it is about the route being seed-only. Search originally
 * used `router.push`, and reproduced the documented symptom exactly — the URL changed, the server
 * rendered the route fine, and the surface was blank forever, because nothing moved attention.
 *
 * Returns false when it could not move (no kernel / unparseable href), so a caller can tell the
 * difference between "moved" and "silently did nothing".
 */
export function useWorkUnitEntryMovement() {
    const kernel = useRuntimeKernelOptional();
    const { orgId, principalUserId } = useWorkspaceOrg();

    return useCallback(
        (href: string | null | undefined, destination?: DestinationId | null, subject?: string | null): boolean => {
            if (!kernel || !href || !orgId) return false;
            const t = attentionTargetFromEntryHref(href);
            if (!t) return false;

            const current = kernel.attention.get();
            if (!current) {
                // A Workspace that never hydrated. One hydration establishes surface + lens (+ subject).
                kernel.attention.hydrate({
                    tenant: orgId,
                    principal: principalUserId ?? "",
                    target: t.target,
                    lens: t.lens,
                    subject: subject ?? null,
                    destination: destination ?? null,
                    source: "direct_url",
                });
                return true;
            }

            kernel.attention.move({
                scope: ATTENTION_SCOPE.SURFACE,
                target: t.target,
                lens: t.lens,
                destination: destination ?? null,
                source: "pointer",
            });
            if (subject) {
                // A finer SUBJECT movement pins the exact Record of Attention. Without it the surface
                // commits its configured DEFAULT subject — which for a Search click means answering a
                // request for one family with a different one. The intermediate surface terminal is
                // superseded by this movement, so there is no default-subject flash.
                kernel.attention.move({
                    scope: ATTENTION_SCOPE.SUBJECT,
                    subject,
                    source: "subject_selection",
                });
            }
            return true;
        },
        [kernel, orgId, principalUserId],
    );
}

/**
 * Returns an onClick for any element that carries a work-unit entry href.
 *
 * The href STAYS on the element: it is the destination's honest address, so copy-link,
 * open-in-new-tab and modifier-click keep working through the browser (a new document hydrates its
 * own attention from the URL on cold load — Art 2.4). Only NORMAL in-app activation is intercepted,
 * and it becomes an attention movement rather than a navigation.
 */
export function useWorkUnitEntryGesture(
    href: string | null | undefined,
    /**
     * The link's SERVER-RESOLVED canonical destination `(workUnitId, workViewId)`. Carried into K1 so
     * every runtime owner (surface identity, K2 preparation, prepared-store lookup, history) keys on
     * the canonical destination, never the route slug — two URL forms of the same destination collapse
     * to one identity. Null on links whose host could not be resolved (falls back to slug-derived).
     */
    destination?: DestinationId | null,
) {
    const move = useWorkUnitEntryMovement();

    return useCallback(
        (e: ReactMouseEvent<HTMLElement>) => {
            // Modifier/middle click = "give me a new document". Let the browser do exactly that.
            if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
            if (!href) return;

            // The route is seed-only: it renders NOTHING for a work unit. So a navigation here would
            // blank the surface. Never fall through — the movement establishes attention if it somehow
            // does not exist yet (a Workspace that never hydrated), then moves.
            const moved = move(href, destination);
            if (!moved) return;
            e.preventDefault();
            e.stopPropagation();
        },
        [move, href, destination],
    );
}

/** The canonical key a route slug denotes — exported so entry points agree with D1. */
export { workUnitRouteSlugToKey };
