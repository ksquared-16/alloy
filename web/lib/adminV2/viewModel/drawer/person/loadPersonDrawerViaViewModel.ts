import { adminV2PersonDrawerVmCutoverEnabled } from "@/lib/adminV2/viewModel/drawer/drawerViewModelFeatureGates";
import {
    logLinkedDrawerVmCacheMiss,
    logLinkedDrawerVmResolve,
    type LinkedDrawerVmCacheMissReason,
    type LinkedDrawerVmOpenPath,
    type LinkedDrawerVmPerfPhase,
} from "@/lib/adminV2/viewModel/drawer/linkedDrawerVmPerf";
import { buildPersonDrawerOpenPreloadFromViewModel } from "@/lib/adminV2/viewModel/drawer/person/buildPersonDrawerOpenPreloadFromViewModel";
import type { PersonDrawerOpenPreload } from "@/lib/adminV2/viewModel/drawer/person/buildPersonDrawerOpenPreloadFromViewModel";
import { fetchPersonDrawerViewModelClient } from "@/lib/adminV2/viewModel/drawer/person/fetchPersonDrawerViewModelClient";
import {
    resolvePersonDrawerVmCacheKey,
    resolvePersonDrawerVmSurface,
} from "@/lib/adminV2/viewModel/drawer/person/personDrawerVmCacheScope";
import type { PersonDrawerVmComposeDepth } from "@/lib/adminV2/viewModel/drawer/person/personDrawerVmComposeDepth";
import { drawerViewModelFirstPaintSettled } from "@/lib/adminV2/viewModel/drawer/drawerFirstPaint";
import type { OpportunityWorkspaceContext } from "@/contexts/AdminDrawerContext";
import {
    drawerViewModelCacheEntryExistsForOtherScope,
    peekDrawerViewModelCacheEntry,
    putDrawerViewModelCacheEntry,
    type DrawerViewModelCacheContext,
} from "@/lib/adminV2/viewModel/drawer/drawerViewModelSessionCache";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

export type LoadPersonDrawerViaViewModelResult =
    | {
          ok: true;
          preload: PersonDrawerOpenPreload;
          compose_ms: number;
          open_path: LinkedDrawerVmOpenPath;
      }
    | {
          ok: false;
          reason: "cutover_disabled" | "fetch_failed" | "skipped" | "not_structure_settled" | "composed_not_ready";
          skip_reason?: string;
      };

export type LoadPersonDrawerViaViewModelOptions = {
    openSource?: string | null;
    presentationEmphasis?: string | null;
    composeDepth?: PersonDrawerVmComposeDepth;
    init?: RequestInit;
    cacheContext?: DrawerViewModelCacheContext | null;
    workspaceContext?: OpportunityWorkspaceContext | null;
    linkedPerfPhase?: LinkedDrawerVmPerfPhase;
};

const personDrawerVmLoadInFlight = new Map<string, Promise<LoadPersonDrawerViaViewModelResult>>();

export function clearPersonDrawerVmLoadInFlightForTests(): void {
    personDrawerVmLoadInFlight.clear();
}

function logPersonScopedCacheMiss(
    personId: string,
    cacheKey: string,
    context: DrawerViewModelCacheContext | null,
    surface: ReturnType<typeof resolvePersonDrawerVmSurface>
): LinkedDrawerVmCacheMissReason {
    const scopeMismatch = drawerViewModelCacheEntryExistsForOtherScope(
        "persons",
        personId,
        surface,
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
        surface,
    });
    return reason;
}

async function loadPersonDrawerViaViewModelCold(
    personId: string,
    opts: LoadPersonDrawerViaViewModelOptions,
    cacheContext: DrawerViewModelCacheContext | null,
    surface: ReturnType<typeof resolvePersonDrawerVmSurface>,
    cacheMissReason: LinkedDrawerVmCacheMissReason,
    linkedPerfPhase: LinkedDrawerVmPerfPhase
): Promise<LoadPersonDrawerViaViewModelResult> {
    const coldStart = typeof performance !== "undefined" ? performance.now() : 0;

    const fetchResult = await fetchPersonDrawerViewModelClient(personId, {
        openSource: opts.openSource,
        presentationEmphasis: opts.presentationEmphasis,
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

    const preload = buildPersonDrawerOpenPreloadFromViewModel(viewModel);
    if (!preload.first_paint_settled) {
        return { ok: false, reason: "composed_not_ready" };
    }

    putDrawerViewModelCacheEntry(
        {
            entityType: "persons",
            entityId: personId,
            surface: surface as "person:parent" | "person:generic" | "child",
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
        surface,
    });

    return {
        ok: true,
        preload,
        compose_ms: viewModel.timing.compose_ms,
        open_path: "cold_fetch",
    };
}

export async function loadPersonDrawerViaViewModel(
    personId: string,
    opts?: LoadPersonDrawerViaViewModelOptions
): Promise<LoadPersonDrawerViaViewModelResult> {
    if (!adminV2PersonDrawerVmCutoverEnabled()) {
        return { ok: false, reason: "cutover_disabled" };
    }

    const id = personId.trim();
    if (!id) {
        return { ok: false, reason: "fetch_failed" };
    }

    const linkedPerfPhase = opts?.linkedPerfPhase ?? "swap";
    const { context, cacheKey, surface } = resolvePersonDrawerVmCacheKey({
        personId: id,
        openSource: opts?.openSource,
        presentationEmphasis: opts?.presentationEmphasis,
        workspaceContext: opts?.workspaceContext ?? null,
        context: opts?.cacheContext ?? null,
    });
    const resolveStart = typeof performance !== "undefined" ? performance.now() : 0;

    const cached = peekDrawerViewModelCacheEntry({
        entityType: "persons",
        entityId: id,
        surface,
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
            surface,
        });
        return {
            ok: true,
            preload: cached.preload as PersonDrawerOpenPreload,
            compose_ms: 0,
            open_path: "cache_hit",
        };
    }

    const cacheMissReason = logPersonScopedCacheMiss(id, cacheKey, context, surface);

    const inflight = personDrawerVmLoadInFlight.get(cacheKey);
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
                surface,
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

    const promise = loadPersonDrawerViaViewModelCold(
        id,
        opts ?? {},
        context,
        surface,
        cacheMissReason,
        linkedPerfPhase
    ).finally(() => {
        personDrawerVmLoadInFlight.delete(cacheKey);
    });
    personDrawerVmLoadInFlight.set(cacheKey, promise);
    return promise;
}
