import type { OpportunityWorkspaceContext } from "@/contexts/AdminDrawerContext";
import {
    buildDrawerViewModelCacheKey,
    resolvePersonDrawerViewModelSurface,
    type DrawerViewModelCacheContext,
    type DrawerViewModelCacheSurface,
} from "@/lib/adminV2/viewModel/drawer/drawerViewModelSessionCache";
import { resolveOpportunityDrawerVmCacheContext } from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerVmCacheScope";

/** Linked person/child drawers share workspace scope with opportunity rows. */
export function resolvePersonDrawerVmCacheContext(input: {
    workspaceContext?: OpportunityWorkspaceContext | null;
    context?: DrawerViewModelCacheContext | null;
}): DrawerViewModelCacheContext | null {
    return resolveOpportunityDrawerVmCacheContext(input);
}

export function resolvePersonDrawerVmSurface(input: {
    openSource?: string | null;
    presentationEmphasis?: string | null;
}): DrawerViewModelCacheSurface {
    return resolvePersonDrawerViewModelSurface(input);
}

export function buildPersonDrawerVmCacheKey(
    personId: string,
    surface: DrawerViewModelCacheSurface,
    context: DrawerViewModelCacheContext | null
): string {
    return buildDrawerViewModelCacheKey({
        entityType: "persons",
        entityId: personId.trim(),
        surface,
        context,
    });
}

export function resolvePersonDrawerVmCacheKey(input: {
    personId: string;
    openSource?: string | null;
    presentationEmphasis?: string | null;
    workspaceContext?: OpportunityWorkspaceContext | null;
    context?: DrawerViewModelCacheContext | null;
}): { cacheKey: string; context: DrawerViewModelCacheContext | null; surface: DrawerViewModelCacheSurface } {
    const context = resolvePersonDrawerVmCacheContext(input);
    const surface = resolvePersonDrawerVmSurface(input);
    return {
        context,
        surface,
        cacheKey: buildPersonDrawerVmCacheKey(input.personId, surface, context),
    };
}

export function resolveChildDrawerVmCacheKey(input: {
    personId: string;
    workspaceContext?: OpportunityWorkspaceContext | null;
    context?: DrawerViewModelCacheContext | null;
}): { cacheKey: string; context: DrawerViewModelCacheContext | null; surface: "child" } {
    const context = resolvePersonDrawerVmCacheContext(input);
    return {
        context,
        surface: "child",
        cacheKey: buildPersonDrawerVmCacheKey(input.personId, "child", context),
    };
}
