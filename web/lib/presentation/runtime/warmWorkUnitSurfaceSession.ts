/**
 * Work Unit surface prewarm (Trust Closure). Pointer/keyboard intent → this writes the SAME session
 * cache entries the runtime seeds from (config bundle, lane summaries, active rows), keyed by the
 * SAME org/dept/wu/user/scope scope. So navigating to the prewarmed unit consumes the prefetch: it
 * renders from cache and — because the seeded entries are fresh — launches no duplicate config/rows
 * request. Best-effort and deduped; it never competes as a blocking dependency.
 */

import { resolveActiveWorkViewRuntimeContext } from "@/lib/lifecycle/resolveWorkViewRuntimeContext";
import { dedupeAdminFetch } from "@/lib/workspace/workspaceAdminFetchDedupe";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import { appendWorkspaceSiteToUrl } from "@/lib/adminV2/workspaceSiteFilterClient";
import { WORK_UNIT_QUEUE_ROWS_FETCH_MIN } from "@/lib/adminV2/workUnitQueueRowsFetchLimit";
import {
    warmWorkUnitSlugRoute,
    parseOperatorWorkUnitEntryHref,
} from "@/lib/admin/operatorWorkUnitEntryWarm";
import type { WorkUnitSlugRouteCacheEntry } from "@/lib/admin/workUnitSlugRouteCache";
import {
    peekWorkUnitSurfaceConfigCache,
    putWorkUnitSurfaceConfigCache,
    putWorkUnitSurfaceQueueCache,
    putWorkUnitSurfaceSummariesCache,
    type WorkUnitViewModelCacheContext,
} from "@/lib/adminV2/viewModel/workUnit/workUnitViewModelSessionCache";
import type { QueueSummary } from "@/lib/queues/types";
import { fetchWorkUnitSurfaceConfigBundle } from "./workUnitSurfaceConfigFetch";
import { validatedBaseQueueKeyForUnit, workUnitSurfaceQueueLane } from "./workUnitSurfaceSeed";
import { queueRowsRouteForView } from "./useWorkViewTotals";

/** In-flight warm guard keyed by the target cache scope, so repeated intents don't re-warm. */
const surfaceWarmInflight = new Set<string>();

function warmKey(ctx: WorkUnitViewModelCacheContext): string {
    return `${ctx.orgId ?? "_"}:${ctx.departmentId ?? "_"}:${ctx.workUnitId ?? "_"}:${ctx.scopeFingerprint ?? "_"}`;
}

/**
 * Warm the minimum coherent first-screen (config + summaries + active rows) into the session cache
 * for a specific work unit. `cacheContext` MUST carry the same org/user/scope the runtime will use,
 * with the target unit's department/work-unit — otherwise navigation would read a different key.
 */
export async function warmWorkUnitSurfaceSession(args: {
    entry: WorkUnitSlugRouteCacheEntry;
    selectedSiteId: string | null;
    cacheContext: WorkUnitViewModelCacheContext;
}): Promise<void> {
    const { entry, selectedSiteId, cacheContext } = args;
    if (!cacheContext.departmentId || !cacheContext.workUnitId) return;
    // Already warm (fresh) → nothing to do; avoids re-warming on repeated hover.
    if (peekWorkUnitSurfaceConfigCache(cacheContext)?.fresh) return;
    const key = warmKey(cacheContext);
    if (surfaceWarmInflight.has(key)) return;
    surfaceWarmInflight.add(key);

    const fetchInit = workspaceDataFetchInit() ?? undefined;
    try {
        const bundle = await fetchWorkUnitSurfaceConfigBundle({
            departmentId: entry.departmentId,
            workUnitId: entry.workUnitId,
            fetchInit,
        });
        // A failed prewarm must leave the cold path untouched — never cache a failure shell.
        if (!bundle.ok) return;
        putWorkUnitSurfaceConfigCache(bundle, cacheContext);

        const summariesRoute = appendWorkspaceSiteToUrl(
            `/api/admin/work-units/${encodeURIComponent(entry.workUnitId)}/queues?include_previews=false&count_mode=exact&limit=3&summary_mode=initial`,
            selectedSiteId,
        );
        const summariesJson = await dedupeAdminFetch(summariesRoute, fetchInit)
            .then((res) => (res.ok ? (res.json() as Promise<{ queues?: QueueSummary[] }>) : null))
            .catch(() => null);
        if (summariesJson?.queues) {
            putWorkUnitSurfaceSummariesCache(summariesJson.queues, cacheContext, selectedSiteId);
        }

        const runtimeCtx = resolveActiveWorkViewRuntimeContext({
            departmentMetadata: bundle.deptMetadata,
            workViewId: entry.initialWorkViewId ?? null,
            queueKey: entry.initialWorkViewId ? null : entry.initialQueueKey,
            queueDefinition: bundle.queueDefinition,
        });
        const fetchQueueKey = validatedBaseQueueKeyForUnit(runtimeCtx.queueKey, bundle.queueDefinition);
        if (fetchQueueKey) {
            const rowsRoute = queueRowsRouteForView({
                workUnitId: entry.workUnitId,
                baseQueueKey: fetchQueueKey,
                workViewId: runtimeCtx.workViewId,
                limit: WORK_UNIT_QUEUE_ROWS_FETCH_MIN,
                selectedSiteId,
                // Match the runtime fetch so the prewarm populates the SAME compact projection.
                rowMode: "reveal",
                callerSurface: "work_unit_prewarm",
            });
            const rowsJson = await dedupeAdminFetch(rowsRoute, fetchInit)
                .then((res) => (res.ok ? res.json() : null))
                .catch(() => null);
            if (rowsJson) {
                putWorkUnitSurfaceQueueCache(
                    { queueResult: rowsJson },
                    cacheContext,
                    workUnitSurfaceQueueLane(fetchQueueKey, runtimeCtx.workViewId, selectedSiteId),
                );
            }
        }
    } catch {
        /* best-effort warm — a failed prefetch leaves the cold path untouched */
    } finally {
        surfaceWarmInflight.delete(key);
    }
}

/**
 * Resolve a work-unit href's identity, then warm its surface session under the given org/user/scope
 * (the target unit's dept/wu are taken from the resolved identity). Fire-and-forget.
 */
export function warmOperatorWorkUnitSurfaceFromHref(
    href: string,
    selectedSiteId: string | null,
    scope: { orgId: string | null; userId: string | null; scopeFingerprint: string | null },
): void {
    const { workUnitSlug } = parseOperatorWorkUnitEntryHref(href);
    if (!workUnitSlug) return;
    void warmWorkUnitSlugRoute(workUnitSlug, "surface_prewarm").then(({ entry }) => {
        if (!entry) return;
        void warmWorkUnitSurfaceSession({
            entry,
            selectedSiteId,
            cacheContext: {
                orgId: scope.orgId,
                departmentId: entry.departmentId,
                workUnitId: entry.workUnitId,
                userId: scope.userId,
                scopeFingerprint: scope.scopeFingerprint,
            },
        });
    });
}

/** @internal test hook */
export function clearWorkUnitSurfaceWarmInflightForTests(): void {
    surfaceWarmInflight.clear();
}
