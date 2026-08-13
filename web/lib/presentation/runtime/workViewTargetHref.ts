/**
 * Pure resolver: the target route href a Work View resolves to.
 *
 * Shared by `selectWorkView` (the click commit) and `prefetchWorkView` (the hover/focus warm)
 * so a pill warms EXACTLY the route a click will push — never a stale or divergent target.
 * Canonical location wins (a view is evaluated at its host work unit + base lane); else the
 * route key is derived from the configured label. Returns null for label-less views (config
 * edge — the pill selects in-page only, nothing to warm/push). No side effects.
 */
import { operatorWorkUnitHrefFromWorkViewSlug } from "@/lib/admin/canonicalOperatorRoutes";
import { workViewRouteKeyFromLabel } from "@/lib/admin/workUnitRouteSlug";
import { appendWorkspaceSiteToPath } from "@/lib/adminV2/workspaceSiteFilterClient";

export type WorkViewTargetInputs = {
    /** The configured views (needs id + label to derive a route key from the label). */
    views: ReadonlyArray<{ id: string; label?: string | null }>;
    /** view id → canonical location (host work unit + base lane), carrying the route key. */
    canonicalLocationByViewId: ReadonlyMap<string, { routeKey?: string | null }>;
    /** Sticky workspace site scope appended to the href (same as the click path). */
    selectedSiteId: string | null;
};

export function resolveWorkViewTargetHref(
    workViewId: string,
    inputs: WorkViewTargetInputs,
): string | null {
    const id = workViewId.trim();
    if (!id) return null;
    const view = inputs.views.find((v) => v.id === id) ?? null;
    const targetRouteKey =
        inputs.canonicalLocationByViewId.get(id)?.routeKey ??
        workViewRouteKeyFromLabel(view?.label ?? undefined);
    if (!targetRouteKey) return null;
    return appendWorkspaceSiteToPath(
        operatorWorkUnitHrefFromWorkViewSlug(targetRouteKey),
        inputs.selectedSiteId,
    );
}
