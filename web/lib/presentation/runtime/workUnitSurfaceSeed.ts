/**
 * Work Unit surface continuity — the pure read side of the session cache + the atomic-reveal
 * decision (Trust Closure). Extracted from `useWorkUnitSurfaceRuntime` so the load-bearing
 * behaviour — synchronous return-navigation seeding and the reveal contract — is verifiable
 * without React or the DOM, and so tests do not pull the whole client hook graph.
 */

import {
    resolveActiveWorkViewRuntimeContext,
} from "@/lib/lifecycle/resolveWorkViewRuntimeContext";
import { tryLoadWorkUnitQueueDefinitionBundle } from "@/lib/config/queueDefinitionV2Runtime";
import { getQueueUiConfig } from "@/lib/ui-v2/queueUiConfig";
import { findAllRecordsQueueKey } from "@/lib/workspace/workUnitQueueDerived";
import {
    peekWorkUnitSurfaceConfigCache,
    peekWorkUnitSurfaceQueueCache,
    peekWorkUnitSurfaceSummariesCache,
    type WorkUnitSurfaceConfigCacheEntry,
    type WorkUnitViewModelCacheContext,
    type WorkUnitViewModelCacheLaneState,
} from "@/lib/adminV2/viewModel/workUnit/workUnitViewModelSessionCache";
import type { QueueItemsResult, QueueSummary } from "@/lib/queues/types";
import type { WorkUnitSlugRouteValue } from "@/contexts/WorkUnitSlugRouteContext";
import type { WorkUnitReadiness } from "./types";

/**
 * Validate a Work View's base lane against THIS work unit's queue definition. A department's Work
 * Views can bind lanes that exist on sibling work units; when the lane is absent here, fall back to
 * this unit's all-records lane — the server still applies the view's predicates via `work_view_id`.
 */
export function validatedBaseQueueKeyForUnit(base: string | null, queueDefinition: unknown): string | null {
    const bundle = queueDefinition != null ? tryLoadWorkUnitQueueDefinitionBundle(queueDefinition) : null;
    if (!bundle) return base;
    if (base && bundle.def.queues.some((q) => q.key === base)) return base;
    return findAllRecordsQueueKey(bundle.def, getQueueUiConfig(bundle.def)) ?? base;
}

/**
 * The queue-rows cache lane must key identically at read (mount seed) and write (rows effect): base
 * lane key + active Work View + selected site. `limit` is intentionally excluded — a fetch-sizing
 * detail, not a content dimension (a wider limit is a superset the SWR pass corrects).
 */
export function workUnitSurfaceQueueLane(
    fetchQueueKey: string | null,
    workViewId: string | null | undefined,
    selectedSiteId: string | null,
): WorkUnitViewModelCacheLaneState {
    return {
        selectedQueueKey: fetchQueueKey,
        recordFilterFingerprint: `view:${workViewId ?? "_"}|site:${selectedSiteId ?? "_"}`,
    };
}

export type WorkUnitSurfaceInitialSeed = {
    config: WorkUnitSurfaceConfigCacheEntry | null;
    configFresh: boolean;
    summaries: QueueSummary[] | null;
    queueResult: QueueItemsResult | null;
};

export const EMPTY_WORK_UNIT_SURFACE_SEED: WorkUnitSurfaceInitialSeed = {
    config: null,
    configFresh: false,
    summaries: null,
    queueResult: null,
};

/**
 * Synchronous mount seed for the PRV2 surface — the read side of the session cache. Runs once per
 * surface mount so a return navigation renders the prior config + rows instantly instead of
 * re-running the config→layout→summaries→rows waterfall. Cold entry (no cached config) returns the
 * empty seed and the normal fetch path runs unchanged.
 */
export function computeWorkUnitSurfaceInitialSeed(args: {
    cacheContext: WorkUnitViewModelCacheContext;
    slugRoute: WorkUnitSlugRouteValue | null;
    selectedSiteId: string | null;
}): WorkUnitSurfaceInitialSeed {
    const { cacheContext, slugRoute, selectedSiteId } = args;
    if (!cacheContext.workUnitId || !cacheContext.departmentId) return EMPTY_WORK_UNIT_SURFACE_SEED;

    const configRead = peekWorkUnitSurfaceConfigCache(cacheContext);
    const summaries = peekWorkUnitSurfaceSummariesCache(cacheContext, selectedSiteId)?.entry.summaries ?? null;
    if (!configRead) return { ...EMPTY_WORK_UNIT_SURFACE_SEED, summaries };

    const cfg = configRead.entry;
    const routeWorkViewId = slugRoute?.initialWorkViewId ?? null;
    const runtimeCtx = resolveActiveWorkViewRuntimeContext({
        departmentMetadata: cfg.deptMetadata,
        workViewId: routeWorkViewId,
        queueKey: routeWorkViewId ? null : slugRoute?.initialQueueKey ?? null,
        queueDefinition: cfg.queueDefinition,
    });
    const fetchQueueKey = validatedBaseQueueKeyForUnit(runtimeCtx.queueKey, cfg.queueDefinition);
    const queueResult = fetchQueueKey
        ? peekWorkUnitSurfaceQueueCache({
              context: cacheContext,
              lane: workUnitSurfaceQueueLane(fetchQueueKey, runtimeCtx.workViewId, selectedSiteId),
          })?.entry.queueResult ?? null
        : null;

    return { config: cfg, configFresh: configRead.fresh, summaries, queueResult };
}

/**
 * Pure atomic-reveal readiness decision (Trust Closure). The primary composition INCLUDES the
 * queue: `coldCompositionReady` requires `queueSettledOnce`, so cold entry holds one boundary until
 * the rows are present, while a seeded return (queue seeded → `queueSettledOnce` true) is ready at
 * once. `queueSettledOnce` is monotonic per surface, so a background revalidate (`queueLoading`
 * true) never lowers `coldCompositionReady` — SWR cannot re-blank the surface.
 */
export function resolveWorkUnitReadiness(input: {
    hasIdentity: boolean;
    configSettled: boolean;
    headerConfigLoaded: boolean;
    hasHeaderPresentation: boolean;
    queueSettledOnce: boolean;
    rightRailSettled: boolean;
    queueLoading: boolean;
    /** This mount opened from a cached config + rows composition (return navigation). */
    openedFromCache: boolean;
}): WorkUnitReadiness {
    const shellReady = input.hasIdentity;
    const coldCompositionReady =
        shellReady &&
        input.configSettled &&
        input.headerConfigLoaded &&
        input.hasHeaderPresentation &&
        input.queueSettledOnce;
    return {
        shellReady,
        retainedCompositionReady: input.openedFromCache,
        coldCompositionReady,
        interactionReady: coldCompositionReady && input.rightRailSettled && !input.queueLoading,
    };
}
