import type { OpportunityWorkspaceContext } from "@/contexts/AdminDrawerContext";
import type { OpportunityDrawerOpenPreload } from "@/lib/admin/opportunityDrawerOpenCoordinator";
import { opportunityDrawerComposedRevealReady } from "@/lib/admin/opportunityDrawerOpenCoordinator";
import { adminV2DrawerViewModelCutoverEnabled } from "@/lib/adminV2/viewModel/drawer/drawerViewModelCutoverGate";
import { buildOpportunityDrawerOpenPreloadFromViewModel } from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityDrawerOpenPreloadFromViewModel";
import {
    buildOpportunityDrawerVmCacheKey,
    resolveOpportunityDrawerVmCacheContext,
    resolveOpportunityDrawerVmCacheKey,
} from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerVmCacheScope";
import { opportunityDrawerViewModelStructureSettled } from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerViewModelContract";
import { fetchOpportunityDrawerViewModelClient } from "@/lib/adminV2/viewModel/drawer/shadow/fetchOpportunityDrawerViewModelClient";
import {
    opportunityDrawerVmCacheEntryExistsForOtherScope,
    peekDrawerViewModelCacheEntry,
    putDrawerViewModelCacheEntry,
    type DrawerViewModelCacheContext,
} from "@/lib/adminV2/viewModel/drawer/drawerViewModelSessionCache";
import { logDrawerVmRuntimeDiagnostic } from "@/lib/adminV2/viewModel/drawer/drawerVmRuntimeDiagnostics";
import { perfDrawer } from "@/lib/perf/perfNamespaceLog";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

export type OpportunityDrawerVmOpenPath = "cache_hit" | "inflight_join" | "cold_fetch";

export type LoadOpportunityDrawerViaViewModelResult =
    | {
          ok: true;
          preload: OpportunityDrawerOpenPreload;
          compose_ms: number;
          open_path: OpportunityDrawerVmOpenPath;
      }
    | {
          ok: false;
          reason: "cutover_disabled" | "fetch_failed" | "skipped" | "not_structure_settled" | "composed_not_ready";
          skip_reason?: string;
      };

export type LoadOpportunityDrawerViaViewModelOptions = {
    init?: RequestInit;
    /** Explicit VM cache scope — must match prefetch/peek paths when provided. */
    cacheContext?: DrawerViewModelCacheContext | null;
};

const opportunityDrawerVmLoadInFlight = new Map<string, Promise<LoadOpportunityDrawerViaViewModelResult>>();

export function clearOpportunityDrawerVmLoadInFlightForTests(): void {
    opportunityDrawerVmLoadInFlight.clear();
}

export {
    buildOpportunityDrawerVmCacheKey,
    resolveOpportunityDrawerVmCacheContext,
    resolveOpportunityDrawerVmCacheKey,
} from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerVmCacheScope";

function logOpportunityVmOpenResolve(
    phase: OpportunityDrawerVmOpenPath,
    opportunityId: string,
    durationMs: number,
    cacheMissReason?: "no_entry" | "scope_mismatch"
): void {
    perfDrawer(phase, {
        entity_type: "opportunities",
        entity_id: opportunityId,
        duration_ms: durationMs,
        cache_hit: phase === "cache_hit" || phase === "inflight_join",
        source: phase === "cold_fetch" ? "network" : "cache",
        skipped_reason: cacheMissReason,
    });
    if (phase === "cache_hit") {
        logDrawerVmRuntimeDiagnostic("queue_row_open_cache_hit", {
            entity_type: "opportunities",
            entity_id: opportunityId,
            opportunity_id: opportunityId,
            duration_ms: durationMs,
            source: "cache",
        });
        return;
    }
    if (phase === "cold_fetch") {
        logDrawerVmRuntimeDiagnostic("queue_row_open_cache_miss", {
            entity_type: "opportunities",
            entity_id: opportunityId,
            opportunity_id: opportunityId,
            duration_ms: durationMs,
            source: "network",
            reason: cacheMissReason ?? "no_entry",
        });
    }
}

function logOpportunityVmScopedCacheMiss(
    opportunityId: string,
    cacheKey: string,
    context: DrawerViewModelCacheContext | null
): "no_entry" | "scope_mismatch" {
    const scopeMismatch = opportunityDrawerVmCacheEntryExistsForOtherScope(opportunityId, cacheKey);
    perfDrawer("cache_miss", {
        entity_type: "opportunities",
        entity_id: opportunityId,
        cache_hit: false,
        source: "network",
        skipped_reason: scopeMismatch ? "scope_mismatch" : "no_entry",
        department_id: context?.departmentId ?? undefined,
        work_unit_id: context?.workUnitId ?? undefined,
        org_id: context?.orgId ?? undefined,
    });
    return scopeMismatch ? "scope_mismatch" : "no_entry";
}

function putOpportunityDrawerVmCacheEntry(
    opportunityId: string,
    preload: OpportunityDrawerOpenPreload,
    context: DrawerViewModelCacheContext | null
): void {
    putDrawerViewModelCacheEntry(
        {
            entityType: "opportunities",
            entityId: opportunityId,
            surface: "opportunity",
            preload,
            generation: preload.viewModel?.generation ?? null,
            cachedAt: Date.now(),
        },
        context
    );
}

async function loadOpportunityDrawerViaViewModelCold(
    opportunityId: string,
    workspaceContext: OpportunityWorkspaceContext | null | undefined,
    cacheContext: DrawerViewModelCacheContext | null,
    cacheKey: string,
    init?: RequestInit,
    cacheMissReason: "no_entry" | "scope_mismatch" = "no_entry"
): Promise<LoadOpportunityDrawerViaViewModelResult> {
    const id = opportunityId.trim();
    const coldStart = typeof performance !== "undefined" ? performance.now() : 0;

    const fetchResult = await fetchOpportunityDrawerViewModelClient(
        id,
        workspaceContext,
        init ?? workspaceDataFetchInit()
    );

    if (!fetchResult.ok) {
        if ("skipped" in fetchResult && fetchResult.skipped) {
            return { ok: false, reason: "skipped", skip_reason: fetchResult.skipped.reason };
        }
        return { ok: false, reason: "fetch_failed" };
    }

    const { viewModel } = fetchResult;
    if (!viewModel.structureSettled || !opportunityDrawerViewModelStructureSettled(viewModel)) {
        return { ok: false, reason: "not_structure_settled" };
    }

    const preload = buildOpportunityDrawerOpenPreloadFromViewModel(viewModel);
    if (!opportunityDrawerComposedRevealReady(preload)) {
        return { ok: false, reason: "composed_not_ready" };
    }

    putOpportunityDrawerVmCacheEntry(id, preload, cacheContext);

    const durationMs =
        typeof performance !== "undefined" ? Math.round(performance.now() - coldStart) : viewModel.timing.compose_ms;
    logOpportunityVmOpenResolve("cold_fetch", id, durationMs, cacheMissReason);

    return {
        ok: true,
        preload,
        compose_ms: viewModel.timing.compose_ms,
        open_path: "cold_fetch",
    };
}

export async function loadOpportunityDrawerViaViewModel(
    opportunityId: string,
    workspaceContext: OpportunityWorkspaceContext | null | undefined,
    initOrOptions?: RequestInit | LoadOpportunityDrawerViaViewModelOptions,
    legacyCacheContext?: DrawerViewModelCacheContext | null
): Promise<LoadOpportunityDrawerViaViewModelResult> {
    if (!adminV2DrawerViewModelCutoverEnabled()) {
        return { ok: false, reason: "cutover_disabled" };
    }

    const id = opportunityId.trim();
    if (!id) {
        return { ok: false, reason: "fetch_failed" };
    }

    const options: LoadOpportunityDrawerViaViewModelOptions =
        initOrOptions != null && typeof initOrOptions === "object" && "cacheContext" in initOrOptions ?
            initOrOptions
        :   { init: initOrOptions as RequestInit | undefined, cacheContext: legacyCacheContext ?? null };

    const { context, cacheKey } = resolveOpportunityDrawerVmCacheKey({
        opportunityId: id,
        workspaceContext,
        context: options.cacheContext ?? null,
    });
    const resolveStart = typeof performance !== "undefined" ? performance.now() : 0;

    const cached = peekDrawerViewModelCacheEntry({
        entityType: "opportunities",
        entityId: id,
        surface: "opportunity",
        context,
    });
    if (cached?.entityType === "opportunities") {
        const durationMs =
            typeof performance !== "undefined" ? Math.round(performance.now() - resolveStart) : 0;
        logOpportunityVmOpenResolve("cache_hit", id, durationMs);
        return {
            ok: true,
            preload: cached.preload,
            compose_ms: 0,
            open_path: "cache_hit",
        };
    }

    const cacheMissReason = logOpportunityVmScopedCacheMiss(id, cacheKey, context);

    const inflight = opportunityDrawerVmLoadInFlight.get(cacheKey);
    if (inflight) {
        const result = await inflight;
        if (result.ok) {
            const durationMs =
                typeof performance !== "undefined" ? Math.round(performance.now() - resolveStart) : 0;
            perfDrawer("inflight_join", {
                entity_type: "opportunities",
                entity_id: id,
                duration_ms: durationMs,
                cache_hit: true,
                source: "cache",
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

    const promise = loadOpportunityDrawerViaViewModelCold(
        id,
        workspaceContext,
        context,
        cacheKey,
        options.init,
        cacheMissReason
    ).finally(() => {
        opportunityDrawerVmLoadInFlight.delete(cacheKey);
    });
    opportunityDrawerVmLoadInFlight.set(cacheKey, promise);
    return promise;
}
