import type { AdminDrawerEntityType } from "@/contexts/AdminDrawerContext";
import type { OpportunityDrawerOpenPreload } from "@/lib/admin/opportunityDrawerOpenCoordinator";
import { loadOpportunityDrawerViaViewModel } from "@/lib/adminV2/viewModel/drawer/opportunity/loadOpportunityDrawerViaViewModel";
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
import { logDrawerVmRuntimeDiagnostic } from "@/lib/adminV2/viewModel/drawer/drawerVmRuntimeDiagnostics";
import { resolveOpportunityDrawerVmCacheContext } from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerVmCacheScope";
import { resolveWarmDrawerTargetsFromOpportunityRecord } from "@/lib/adminV2/viewModel/drawer/opportunity/resolveWarmDrawerTargetsFromOpportunityRecord";
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

    logDrawerVmRuntimeDiagnostic("drawer_vm_model_swap_prepare", {
        entity_type: params.entityType,
        entity_id: entityId,
        open_source: params.openSource ?? null,
    });

    if (params.entityType === "opportunities") {
        const ws = params.opportunityWorkspaceContext;
        const resolvedContext = resolveOpportunityDrawerVmCacheContext({
            workspaceContext: ws ?? null,
            context: params.context ?? null,
        });
        const cached = peekDrawerViewModelCacheEntry({
            entityType: "opportunities",
            entityId,
            surface: "opportunity",
            context: resolvedContext,
        });
        if (cached && cached.entityType === "opportunities") {
            logDrawerVmRuntimeDiagnostic("drawer_vm_model_swap_cache_hit", {
                entity_type: "opportunities",
                entity_id: entityId,
                surface: "opportunity",
            });
            return { entityType: "opportunities", entityId, preload: cached.preload };
        }

        if (!ws) return null;
        const vmResult = await loadOpportunityDrawerViaViewModel(entityId, ws, {
            init: params.init ?? workspaceDataFetchInit(),
            cacheContext: resolvedContext,
        });
        if (!vmResult.ok) return null;

        putDrawerViewModelCacheEntry(
            {
                entityType: "opportunities",
                entityId,
                surface: "opportunity",
                preload: vmResult.preload,
                generation: vmResult.preload.viewModel?.generation ?? null,
                cachedAt: Date.now(),
            },
            resolvedContext
        );
        return { entityType: "opportunities", entityId, preload: vmResult.preload };
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
            logDrawerVmRuntimeDiagnostic("drawer_vm_model_swap_cache_hit", {
                entity_type: "persons",
                entity_id: entityId,
                surface,
            });
            return { entityType: "persons", entityId, preload: cached.preload };
        }

        const result =
            surface === "child" ?
                await loadChildDrawerViaViewModel(entityId, {
                    composeDepth: "first_paint",
                    init: params.init ?? workspaceDataFetchInit(),
                })
            :   await loadPersonDrawerViaViewModel(entityId, {
                    openSource: params.openSource,
                    presentationEmphasis: params.presentationEmphasis,
                    composeDepth: "first_paint",
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

function trimId(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

const prepareDrawerViewModelInFlight = new Map<string, Promise<DrawerViewModelPreload | null>>();

/** Dedupes concurrent prepares for the same VM cache key (background warm + swap). */
export function prepareDrawerViewModelDeduped(
    params: PrepareDrawerViewModelParams
): Promise<DrawerViewModelPreload | null> {
    const cacheKey = drawerViewModelSwapCacheKey(params);
    if (!cacheKey) return prepareDrawerViewModel(params);

    const inFlight = prepareDrawerViewModelInFlight.get(cacheKey);
    if (inFlight) return inFlight;

    const promise = prepareDrawerViewModel(params).finally(() => {
        prepareDrawerViewModelInFlight.delete(cacheKey);
    });
    prepareDrawerViewModelInFlight.set(cacheKey, promise);
    return promise;
}

function warmPersonDrawerTarget(
    personId: string,
    ctx: DrawerViewModelCacheContext | null,
    openSource: string,
    presentationEmphasis?: string | null
): void {
    void prepareDrawerViewModelDeduped({
        entityType: "persons",
        entityId: personId,
        context: ctx,
        openSource,
        presentationEmphasis: presentationEmphasis ?? null,
    })
        .then((preload) => {
            if (!preload) {
                logDrawerVmRuntimeDiagnostic("related_prefetch_error", {
                    entity_type: "persons",
                    entity_id: personId,
                    open_source: openSource,
                    reason: "prepare_returned_null",
                });
            }
        })
        .catch((err) => {
            logDrawerVmRuntimeDiagnostic("related_prefetch_error", {
                entity_type: "persons",
                entity_id: personId,
                open_source: openSource,
                error: err instanceof Error ? err.message : String(err),
            });
        });
}

function warmChildDrawerTarget(personId: string, ctx: DrawerViewModelCacheContext | null, openSource: string): void {
    warmPersonDrawerTarget(personId, ctx, openSource, "child_lifecycle");
}

function warmOpportunityDrawerTarget(
    oppId: string,
    ctx: DrawerViewModelCacheContext | null,
    ws: { work_unit_id: string; department_id: string }
): void {
    void prepareDrawerViewModelDeduped({
        entityType: "opportunities",
        entityId: oppId,
        context: ctx,
        opportunityWorkspaceContext: ws,
    });
}

function warmHouseholdLinksFromPersonRecord(
    record: Record<string, unknown>,
    ctx: DrawerViewModelCacheContext | null
): void {
    const childLinks = record._household_child_links;
    if (Array.isArray(childLinks)) {
        for (const raw of childLinks) {
            if (!raw || typeof raw !== "object") continue;
            const childPersonId = trimId((raw as { person_id?: unknown }).person_id);
            if (!childPersonId) continue;
            warmChildDrawerTarget(childPersonId, ctx, "person_household_link");
        }
    }

    const adultLinks = record._household_adult_links;
    if (Array.isArray(adultLinks)) {
        for (const raw of adultLinks) {
            if (!raw || typeof raw !== "object") continue;
            const adultPersonId = trimId((raw as { person_id?: unknown }).person_id);
            if (!adultPersonId) continue;
            warmPersonDrawerTarget(adultPersonId, ctx, "person_household_link");
        }
    }

    const siblingLinks = record._sibling_links;
    if (Array.isArray(siblingLinks)) {
        for (const raw of siblingLinks) {
            if (!raw || typeof raw !== "object") continue;
            const siblingPersonId = trimId((raw as { person_id?: unknown }).person_id);
            if (!siblingPersonId) continue;
            warmChildDrawerTarget(siblingPersonId, ctx, "person_household_link");
        }
    }

}

/** Background warm for related VM drawer targets while a drawer is open (non-blocking). */
export function warmRelatedDrawerViewModels(params: {
    entityType: AdminDrawerEntityType;
    record: Record<string, unknown>;
    context?: DrawerViewModelCacheContext | null;
    opportunityWorkspaceContext?: { work_unit_id: string; department_id: string } | null;
}): void {
    const ctx = params.context ?? null;
    const ws = params.opportunityWorkspaceContext ?? null;

    if (params.entityType === "opportunities") {
        for (const target of resolveWarmDrawerTargetsFromOpportunityRecord(params.record)) {
            warmPersonDrawerTarget(
                target.personId,
                ctx,
                target.openSource,
                target.presentationEmphasis
            );
        }
        return;
    }

    if (params.entityType === "persons") {
        const oppId =
            trimId(params.record.opportunity_id) ||
            trimId((params.record._opportunity as { id?: unknown } | undefined)?.id);
        if (oppId && ws) {
            warmOpportunityDrawerTarget(oppId, ctx, ws);
        }
        const enrollmentOppId = trimId(
            (params.record._enrollment_mirror as { opportunity_id?: unknown } | undefined)?.opportunity_id
        );
        if (enrollmentOppId && ws && enrollmentOppId !== oppId) {
            warmOpportunityDrawerTarget(enrollmentOppId, ctx, ws);
        }
        warmHouseholdLinksFromPersonRecord(params.record, ctx);
    }
}

export function drawerViewModelSwapCacheKey(params: PrepareDrawerViewModelParams): string | null {
    const entityId = params.entityId.trim();
    if (!entityId) return null;
    if (params.entityType === "opportunities") {
        return buildDrawerViewModelCacheKey({
            entityType: "opportunities",
            entityId,
            surface: "opportunity",
            context: resolveOpportunityDrawerVmCacheContext({
                workspaceContext: params.opportunityWorkspaceContext ?? null,
                context: params.context ?? null,
            }),
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
