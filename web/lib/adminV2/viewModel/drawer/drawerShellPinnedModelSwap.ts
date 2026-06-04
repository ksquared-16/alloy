import type { AdminDrawerEntityType } from "@/contexts/AdminDrawerContext";
import { DRAWER_MODEL_SWAP_OPEN_SOURCE } from "@/contexts/AdminDrawerContext";
import type { OpenDrawerParams } from "@/contexts/AdminDrawerContext";
import {
    buildDrawerViewModelCacheKey,
    peekDrawerViewModelCacheEntry,
    resolvePersonDrawerViewModelSurface,
    type DrawerViewModelCacheContext,
} from "@/lib/adminV2/viewModel/drawer/drawerViewModelSessionCache";
import {
    prepareDrawerViewModel,
    type DrawerViewModelPreload,
    type PrepareDrawerViewModelParams,
} from "@/lib/adminV2/viewModel/drawer/drawerModelSwapNavigation";
import { childDrawerHardCutoverEnabled } from "@/lib/adminV2/viewModel/drawer/child/childDrawerHardCutoverGate";
import { opportunityDrawerHardCutoverEnabled } from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerHardCutoverGate";
import { personDrawerHardCutoverEnabled } from "@/lib/adminV2/viewModel/drawer/person/personDrawerHardCutoverGate";

/** Entity kinds that support VM first-paint + shell-pinned model swap. */
export const VM_BACKED_DRAWER_ENTITY_TYPES = new Set<AdminDrawerEntityType>(["opportunities", "persons"]);

export function isVmBackedDrawerEntityType(type: AdminDrawerEntityType | null | undefined): boolean {
    return type != null && VM_BACKED_DRAWER_ENTITY_TYPES.has(type);
}

export function isShellPinnedModelSwapOpenSource(openSource: string | null | undefined): boolean {
    const s = String(openSource ?? "").trim();
    if (!s) return false;
    if (s === DRAWER_MODEL_SWAP_OPEN_SOURCE) return true;
    // Related-record navigation from an open VM drawer — same runtime path as explicit model swap.
    return (
        s === "opportunity_primary_contact" ||
        s === "opportunity_inquiry_child" ||
        s === "queue_row_person" ||
        s === "queue_row_child_icon" ||
        s === "opportunity_household_adult" ||
        s === "person_household_link"
    );
}

export function buildPrepareParamsFromOpenDrawer(
    params: OpenDrawerParams & { context?: DrawerViewModelCacheContext | null }
): PrepareDrawerViewModelParams {
    return {
        entityType: params.type,
        entityId: params.id,
        context: params.context ?? null,
        openSource: params.source ?? null,
        presentationEmphasis: params.personDrawerOpenSeed?.presentation_emphasis ?? null,
        opportunityWorkspaceContext: params.opportunityWorkspaceContext ?? null,
    };
}

/** Synchronous VM cache peek — enables swap apply in the same frame as drawer id change. */
export function peekDrawerViewModelPreloadSync(
    params: PrepareDrawerViewModelParams
): DrawerViewModelPreload | null {
    const entityId = params.entityId.trim();
    if (!entityId || entityId === "new") return null;

    if (params.entityType === "opportunities") {
        if (!opportunityDrawerHardCutoverEnabled()) return null;
        const cached = peekDrawerViewModelCacheEntry({
            entityType: "opportunities",
            entityId,
            surface: "opportunity",
            context: params.context,
        });
        if (cached?.entityType === "opportunities") {
            return { entityType: "opportunities", entityId, preload: cached.preload };
        }
        return null;
    }

    if (params.entityType === "persons") {
        const surface = resolvePersonDrawerViewModelSurface({
            openSource: params.openSource,
            presentationEmphasis: params.presentationEmphasis,
        });
        const cutover =
            surface === "child" ? childDrawerHardCutoverEnabled() : personDrawerHardCutoverEnabled();
        if (!cutover) return null;
        const cached = peekDrawerViewModelCacheEntry({
            entityType: "persons",
            entityId,
            surface,
            context: params.context,
        });
        if (cached?.entityType === "persons") {
            return { entityType: "persons", entityId, preload: cached.preload };
        }
        return null;
    }

    return null;
}

export function drawerViewModelCacheKeyForOpenParams(
    params: OpenDrawerParams & { context?: DrawerViewModelCacheContext | null }
): string | null {
    const prepare = buildPrepareParamsFromOpenDrawer(params);
    const entityId = prepare.entityId.trim();
    if (!entityId) return null;
    if (prepare.entityType === "opportunities") {
        return buildDrawerViewModelCacheKey({
            entityType: "opportunities",
            entityId,
            surface: "opportunity",
            context: prepare.context,
        });
    }
    if (prepare.entityType === "persons") {
        return buildDrawerViewModelCacheKey({
            entityType: "persons",
            entityId,
            surface: resolvePersonDrawerViewModelSurface({
                openSource: prepare.openSource,
                presentationEmphasis: prepare.presentationEmphasis,
            }),
            context: prepare.context,
        });
    }
    return null;
}

/** Preserve workspace / queue scope when swapping back to opportunity without explicit params. */
export function resolveModelSwapOpportunityContext(
    params: OpenDrawerParams,
    prev: {
        opportunityWorkspaceContext?: { work_unit_id: string; department_id: string } | null;
        opportunityQueueNavigator?: OpenDrawerParams["opportunityQueueNavigator"];
        opportunityQueuePreviewSeed?: OpenDrawerParams["opportunityQueuePreviewSeed"];
    }
): Pick<
    OpenDrawerParams,
    "opportunityWorkspaceContext" | "opportunityQueueNavigator" | "opportunityQueuePreviewSeed"
> {
    if (params.type !== "opportunities") {
        return {
            opportunityWorkspaceContext: null,
            opportunityQueueNavigator: null,
            opportunityQueuePreviewSeed: null,
        };
    }
    return {
        opportunityWorkspaceContext:
            params.opportunityWorkspaceContext ?? prev.opportunityWorkspaceContext ?? null,
        opportunityQueueNavigator:
            params.opportunityQueueNavigator ?? prev.opportunityQueueNavigator ?? null,
        opportunityQueuePreviewSeed:
            params.opportunityQueuePreviewSeed ?? prev.opportunityQueuePreviewSeed ?? null,
    };
}

export async function warmDrawerViewModelPreload(
    params: PrepareDrawerViewModelParams
): Promise<DrawerViewModelPreload | null> {
    return prepareDrawerViewModel(params);
}
