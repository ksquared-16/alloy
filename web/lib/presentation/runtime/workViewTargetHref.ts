/**
 * Pure resolver: the target route href a Work View resolves to.
 *
 * Shared by `selectWorkView` (the click commit) and `prefetchWorkView` (the hover/focus warm)
 * so a pill warms EXACTLY the route a click will push — never a stale or divergent target.
 * ── ROUTE KEY PRECEDENCE, AND WHY THE LABEL IS LAST ──
 *
 * Canonical location wins: a view is evaluated at its host work unit + base lane, and that carries
 * the route key the runtime itself resolved.
 *
 * Failing that, the CONFIGURED VIEW ID is the route key. View ids are the operator-facing routing
 * namespace — `resolveWorkUnitByRouteSlug` matches them directly (work_unit_key → work_view →
 * queue_lane), and `resolveCreatedRecordProcessContextHref` already routes by id.
 *
 * The LABEL is gone, and was the defect. It is operator-editable display text, and slugifying it only
 * coincidentally matches the configured id: `new_leads` labelled "New" slugs to `new`, `all_work`
 * labelled "All" slugs to `all` — neither resolves to any configured view. The route then answered
 * not-found, or, in a tenant that reused the word, resolved a DIFFERENT view. A view with no label at
 * all produced a NULL href, and `WorkViewList` renders a href-less row as a plain `div` with no
 * handler — so the reported "clicks appear to do nothing" was literally true: there was nothing to
 * click. Renaming a view must never change where it routes.
 *
 * No side effects. Null only for an empty view id.
 */
import { operatorWorkUnitHrefFromWorkViewSlug } from "@/lib/admin/canonicalOperatorRoutes";
import { appendWorkspaceSiteToPath } from "@/lib/adminV2/workspaceSiteFilterClient";

export type WorkViewTargetInputs = {
    /** The configured views. Retained for callers; routing no longer reads the label. */
    views?: ReadonlyArray<{ id: string; label?: string | null }>;
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
    // Canonical location, else the configured id. The id is always present here (empty ids returned
    // above), so there is deliberately no label fallback left to reach.
    const targetRouteKey = inputs.canonicalLocationByViewId.get(id)?.routeKey?.trim() || id;
    return appendWorkspaceSiteToPath(
        operatorWorkUnitHrefFromWorkViewSlug(targetRouteKey),
        inputs.selectedSiteId,
    );
}
