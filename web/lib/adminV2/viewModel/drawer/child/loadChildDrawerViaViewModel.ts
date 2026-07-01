import { adminV2ChildDrawerVmCutoverEnabled } from "@/lib/adminV2/viewModel/drawer/drawerViewModelFeatureGates";
import { buildChildDrawerOpenPreloadFromViewModel } from "@/lib/adminV2/viewModel/drawer/child/buildChildDrawerOpenPreloadFromViewModel";
import type { ChildDrawerOpenPreload } from "@/lib/adminV2/viewModel/drawer/child/buildChildDrawerOpenPreloadFromViewModel";
import { fetchChildDrawerViewModelClient } from "@/lib/adminV2/viewModel/drawer/child/fetchChildDrawerViewModelClient";
import { drawerViewModelFirstPaintSettled } from "@/lib/adminV2/viewModel/drawer/drawerFirstPaint";
import {
    logLinkedDrawerVmCacheMiss,
    logLinkedDrawerVmResolve,
    type LinkedDrawerVmCacheMissReason,
    type LinkedDrawerVmOpenPath,
    type LinkedDrawerVmPerfPhase,
} from "@/lib/adminV2/viewModel/drawer/linkedDrawerVmPerf";
import { resolveChildDrawerVmCacheKey } from "@/lib/adminV2/viewModel/drawer/person/personDrawerVmCacheScope";
import type { PersonDrawerVmComposeDepth } from "@/lib/adminV2/viewModel/drawer/person/personDrawerVmComposeDepth";
import type { OpportunityWorkspaceContext } from "@/contexts/AdminDrawerContext";
import {
    drawerViewModelCacheEntryExistsForOtherScope,
    peekDrawerViewModelCacheEntry,
    putDrawerViewModelCacheEntry,
    type DrawerViewModelCacheContext,
} from "@/lib/adminV2/viewModel/drawer/drawerViewModelSessionCache";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

export type LoadChildDrawerViaViewModelResult =
    | {
          ok: true;
          preload: ChildDrawerOpenPreload;
          compose_ms: number;
          open_path: LinkedDrawerVmOpenPath;
      }
    | {
          ok: false;
          reason: "cutover_disabled" | "fetch_failed" | "skipped" | "not_structure_settled" | "composed_not_ready";
          skip_reason?: string;
      };

export type LoadChildDrawerViaViewModelOptions = {
    composeDepth?: PersonDrawerVmComposeDepth;
    init?: RequestInit;
    cacheContext?: DrawerViewModelCacheContext | null;
    workspaceContext?: OpportunityWorkspaceContext | null;
    linkedPerfPhase?: LinkedDrawerVmPerfPhase;
};

const childDrawerVmLoadInFlight = new Map<string, Promise<LoadChildDrawerViaViewModelResult>>();

export function clearChildDrawerVmLoadInFlightForTests(): void {
    childDrawerVmLoadInFlight.clear();
}

function logChildScopedCacheMiss(
    personId: string,
    cacheKey: string,
    context: DrawerViewModelCacheContext | null
): LinkedDrawerVmCacheMissReason {
    const scopeMismatch = drawerViewModelCacheEntryExistsForOtherScope(
        "persons",
        personId,
        "child",
        cacheKey
    );
    const reason: LinkedDrawerVmCacheMissReason = scopeMismatch ? "scope_mismatch" : "no_entry";
    logLinkedDrawerVmCacheMiss({
        kind: "swap",
        entityType: "persons",
        entityId: personId,
        reason,
        departmentId: context?.departmentId,
        workUnitId: context?.workUnitId,
        orgId: context?.orgId,
        surface: "child",
    });
    return reason;
}

async function loadChildDrawerViaViewModelCold(
    personId: string,
    opts: LoadChildDrawerViaViewModelOptions,
    cacheContext: DrawerViewModelCacheContext | null,
    cacheMissReason: LinkedDrawerVmCacheMissReason,
    linkedPerfPhase: LinkedDrawerVmPerfPhase
): Promise<LoadChildDrawerViaViewModelResult> {
    const coldStart = typeof performance !== "undefined" ? performance.now() : 0;

    const fetchResult = await fetchChildDrawerViewModelClient(personId, {
        composeDepth: opts.composeDepth ?? "first_paint",
        init: opts.init ?? workspaceDataFetchInit(),
    });

    if (!fetchResult.ok) {
        if ("skipped" in fetchResult && fetchResult.skipped) {
            return { ok: false, reason: "skipped", skip_reason: fetchResult.skipped.reason };
        }
        return { ok: false, reason: "fetch_failed" };
    }

    const { viewModel } = fetchResult;
    if (!viewModel.structureSettled || !drawerViewModelFirstPaintSettled({ first_paint: viewModel.first_paint })) {
        return { ok: false, reason: "not_structure_settled" };
    }

    const preload = buildChildDrawerOpenPreloadFromViewModel(viewModel);
    if (!preload.first_paint_settled) {
        return { ok: false, reason: "composed_not_ready" };
    }

    putDrawerViewModelCacheEntry(
        {
            entityType: "persons",
            entityId: personId,
            surface: "child",
            preload,
            generation: preload.viewModel?.generation ?? null,
            cachedAt: Date.now(),
        },
        cacheContext
    );

    const durationMs =
        typeof performance !== "undefined" ? Math.round(performance.now() - coldStart) : viewModel.timing.compose_ms;
    logLinkedDrawerVmResolve({
        kind: linkedPerfPhase,
        entityType: "persons",
        entityId: personId,
        openPath: "cold_fetch",
        durationMs,
        cacheMissReason,
        surface: "child",
    });

    return {
        ok: true,
        preload,
        compose_ms: viewModel.timing.compose_ms,
        open_path: "cold_fetch",
    };
}

export async function loadChildDrawerViaViewModel(
    personId: string,
    opts?: LoadChildDrawerViaViewModelOptions
): Promise<LoadChildDrawerViaViewModelResult> {
    if (!adminV2ChildDrawerVmCutoverEnabled()) {
        return { ok: false, reason: "cutover_disabled" };
    }

    const id = personId.trim();
    if (!id) {
        return { ok: false, reason: "fetch_failed" };
    }

    const linkedPerfPhase = opts?.linkedPerfPhase ?? "swap";
    const { context, cacheKey } = resolveChildDrawerVmCacheKey({
        personId: id,
        workspaceContext: opts?.workspaceContext ?? null,
        context: opts?.cacheContext ?? null,
    });
    const resolveStart = typeof performance !== "undefined" ? performance.now() : 0;

    const cached = peekDrawerViewModelCacheEntry({
        entityType: "persons",
        entityId: id,
        surface: "child",
        context,
    });
    if (cached?.entityType === "persons") {
        const durationMs =
            typeof performance !== "undefined" ? Math.round(performance.now() - resolveStart) : 0;
        logLinkedDrawerVmResolve({
            kind: linkedPerfPhase,
            entityType: "persons",
            entityId: id,
            openPath: "cache_hit",
            durationMs,
            surface: "child",
        });
        return {
            ok: true,
            preload: cached.preload as ChildDrawerOpenPreload,
            compose_ms: 0,
            open_path: "cache_hit",
        };
    }

    const cacheMissReason = logChildScopedCacheMiss(id, cacheKey, context);

    const inflight = childDrawerVmLoadInFlight.get(cacheKey);
    if (inflight) {
        const result = await inflight;
        if (result.ok) {
            const durationMs =
                typeof performance !== "undefined" ? Math.round(performance.now() - resolveStart) : 0;
            logLinkedDrawerVmResolve({
                kind: linkedPerfPhase,
                entityType: "persons",
                entityId: id,
                openPath: "inflight_join",
                durationMs,
                surface: "child",
            });
            return {
                ok: true,
                preload: result.preload,
                compose_ms: result.compose_ms,
                open_path: "inflight_join",
            };
        }
        return result;
    }

    const promise = loadChildDrawerViaViewModelCold(
        id,
        opts ?? {},
        context,
        cacheMissReason,
        linkedPerfPhase
    ).finally(() => {
        childDrawerVmLoadInFlight.delete(cacheKey);
    });
    childDrawerVmLoadInFlight.set(cacheKey, promise);
    return promise;
}
