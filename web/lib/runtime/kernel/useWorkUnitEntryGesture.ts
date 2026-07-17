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
 * Returns an onClick for any element that carries a work-unit entry href.
 *
 * The href STAYS on the element: it is the destination's honest address, so copy-link,
 * open-in-new-tab and modifier-click keep working through the browser (a new document hydrates its
 * own attention from the URL on cold load — Art 2.4). Only NORMAL in-app activation is intercepted,
 * and it becomes an attention movement rather than a navigation.
 */
export function useWorkUnitEntryGesture(href: string | null | undefined) {
    const kernel = useRuntimeKernelOptional();
    const { orgId, principalUserId } = useWorkspaceOrg();

    return useCallback(
        (e: ReactMouseEvent<HTMLElement>) => {
            // Modifier/middle click = "give me a new document". Let the browser do exactly that.
            if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
            if (!kernel || !href || !orgId) return;
            const t = href ? attentionTargetFromEntryHref(href) : null;
            if (!t) return;

            // The route is seed-only: it renders NOTHING for a work unit. So a navigation here would
            // blank the surface. Never fall through — establish attention if it somehow does not
            // exist yet (a Workspace that never hydrated), then move.
            e.preventDefault();
            e.stopPropagation();
            const current = kernel.attention.get();
            if (!current) {
                kernel.attention.hydrate({
                    tenant: orgId,
                    principal: principalUserId ?? "",
                    target: t.target,
                    lens: t.lens,
                    source: "direct_url",
                });
                return;
            }
            kernel.attention.move({
                scope: ATTENTION_SCOPE.SURFACE,
                target: t.target,
                lens: t.lens,
                source: "pointer",
            });
        },
        [kernel, href, orgId, principalUserId],
    );
}

/** The canonical key a route slug denotes — exported so entry points agree with D1. */
export { workUnitRouteSlugToKey };
