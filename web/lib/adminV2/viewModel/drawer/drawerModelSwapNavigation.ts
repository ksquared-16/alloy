import type { AdminDrawerEntityType } from "@/contexts/AdminDrawerContext";
import { loadOpportunityDrawerComposedOpen } from "@/lib/admin/opportunityDrawerOpenCoordinator";
import type { OpportunityDrawerOpenPreload } from "@/lib/admin/opportunityDrawerOpenCoordinator";
import { loadChildDrawerViaViewModel } from "@/lib/adminV2/viewModel/drawer/child/loadChildDrawerViaViewModel";
import type { ChildDrawerOpenPreload } from "@/lib/adminV2/viewModel/drawer/child/buildChildDrawerOpenPreloadFromViewModel";
import { childDrawerHardCutoverEnabled } from "@/lib/adminV2/viewModel/drawer/child/childDrawerHardCutoverGate";
import { opportunityDrawerHardCutoverEnabled } from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerHardCutoverGate";
import { loadPersonDrawerViaViewModel } from "@/lib/adminV2/viewModel/drawer/person/loadPersonDrawerViaViewModel";
import type { PersonDrawerOpenPreload } from "@/lib/adminV2/viewModel/drawer/person/buildPersonDrawerOpenPreloadFromViewModel";
import { personDrawerHardCutoverEnabled } from "@/lib/adminV2/viewModel/drawer/person/personDrawerHardCutoverGate";
import {
    buildDrawerViewModelCacheKey,
    peekDrawerViewModelCacheEntry,
    putDrawerViewModelCacheEntry,
    resolvePersonDrawerViewModelSurface,
    type DrawerViewModelCacheContext,
    type DrawerViewModelCacheSurface,
} from "@/lib/adminV2/viewModel/drawer/drawerViewModelSessionCache";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

export type DrawerViewModelPreload =
    | { entityType: "opportunities"; entityId: string; preload: OpportunityDrawerOpenPreload }
    | { entityType: "persons"; entityId: string; preload: PersonDrawerOpenPreload | ChildDrawerOpenPreload };

export type PrepareDrawerViewModelParams = {
    entityType: AdminDrawerEntityType;
    entityId: string;
    context?: DrawerViewModelCacheContext | null;
    openSource?: string | null;
    presentationEmphasis?: string | null;
    opportunityWorkspaceContext?: { work_unit_id: string; department_id: string } | null;
    init?: RequestInit;
};

function personSurface(params: PrepareDrawerViewModelParams): DrawerViewModelCacheSurface {
    return resolvePersonDrawerViewModelSurface({
        openSource: params.openSource,
        presentationEmphasis: params.presentationEmphasis,
    });
}

function vmCutoverEnabled(params: PrepareDrawerViewModelParams): boolean {
    if (params.entityType === "opportunities") return opportunityDrawerHardCutoverEnabled();
    if (params.entityType !== "persons") return false;
    const surface = personSurface(params);
    return surface === "child" ? childDrawerHardCutoverEnabled() : personDrawerHardCutoverEnabled();
}

export async function prepareDrawerViewModel(
    params: PrepareDrawerViewModelParams
): Promise<DrawerViewModelPreload | null> {
    const entityId = params.entityId.trim();
    if (!entityId || entityId === "new") return null;
    if (!vmCutoverEnabled(params)) return null;

    if (params.entityType === "opportunities") {
        const cached = peekDrawerViewModelCacheEntry({
            entityType: "opportunities",
            entityId,
            surface: "opportunity",
            context: params.context,
        });
        if (cached && cached.entityType === "opportunities") {
            return { entityType: "opportunities", entityId, preload: cached.preload };
        }

        const ws = params.opportunityWorkspaceContext;
        if (!ws) return null;
        const { preload } = await loadOpportunityDrawerComposedOpen(
            entityId,
            ws,
            params.init ?? workspaceDataFetchInit()
        );
        putDrawerViewModelCacheEntry(
            {
                entityType: "opportunities",
                entityId,
                surface: "opportunity",
                preload,
                generation: preload.viewModel?.generation ?? null,
                cachedAt: Date.now(),
            },
            params.context
        );
        return { entityType: "opportunities", entityId, preload };
    }

    if (params.entityType === "persons") {
        const surface = personSurface(params);
        const cached = peekDrawerViewModelCacheEntry({
            entityType: "persons",
            entityId,
            surface,
            context: params.context,
        });
        if (cached && cached.entityType === "persons") {
            return { entityType: "persons", entityId, preload: cached.preload };
        }

        const result =
            surface === "child" ?
                await loadChildDrawerViaViewModel(entityId, params.init ?? workspaceDataFetchInit())
            :   await loadPersonDrawerViaViewModel(entityId, {
                    openSource: params.openSource,
                    presentationEmphasis: params.presentationEmphasis,
                    init: params.init ?? workspaceDataFetchInit(),
                });
        if (!result.ok) return null;

        putDrawerViewModelCacheEntry(
            {
                entityType: "persons",
                entityId,
                surface: surface as "person:parent" | "person:generic" | "child",
                preload: result.preload,
                generation: result.preload.viewModel?.generation ?? null,
                cachedAt: Date.now(),
            },
            params.context
        );
        return { entityType: "persons", entityId, preload: result.preload };
    }

    return null;
}

export async function swapDrawerViewModel(
    params: PrepareDrawerViewModelParams
): Promise<DrawerViewModelPreload | null> {
    return prepareDrawerViewModel(params);
}

export function drawerViewModelSwapCacheKey(params: PrepareDrawerViewModelParams): string | null {
    const entityId = params.entityId.trim();
    if (!entityId) return null;
    if (params.entityType === "opportunities") {
        return buildDrawerViewModelCacheKey({
            entityType: "opportunities",
            entityId,
            surface: "opportunity",
            context: params.context,
        });
    }
    if (params.entityType === "persons") {
        return buildDrawerViewModelCacheKey({
            entityType: "persons",
            entityId,
            surface: personSurface(params),
            context: params.context,
        });
    }
    return null;
}

export function isDrawerModelSwapEligible(
    fromType: AdminDrawerEntityType | null,
    fromId: string | null,
    toType: AdminDrawerEntityType,
    toId: string
): boolean {
    if (!fromType || !fromId) return false;
    if (fromType === toType && String(fromId) === String(toId)) return false;
    const vmEntities = new Set<AdminDrawerEntityType>(["opportunities", "persons"]);
    return vmEntities.has(fromType) && vmEntities.has(toType);
}
