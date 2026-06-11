export type DrawerSwapBodyParams = {
    type: "opportunities" | "persons";
    id: string;
    source?: string | null;
    personDrawerOpenSeed?: {
        presentation_emphasis?: string | null;
        opportunity_id?: string | null;
    } | null;
    opportunityWorkspaceContext?: {
        department_id?: string | null;
        work_unit_id?: string | null;
    } | null;
};
import {
    isLayoutRuntimeHardCutoverActiveClient,
    isLayoutRuntimeOpportunityDrawerBodyEnabledClient,
} from "@/lib/layout/featureFlag";
import {
    buildDrawerLayoutRuntimeBodyCacheKey,
    fetchDrawerLayoutRuntimeBodyDeduped,
    peekDrawerLayoutRuntimeBodyCacheEntry,
    serializeDrawerLayoutRuntimeBodyQueryParams,
} from "@/lib/layout/runtime/drawerLayoutRuntimeBodySessionCache";
import { ADMINV2_UI_SESSION_CACHE_TTL_MS } from "@/lib/adminV2/runtime/adminV2UiSessionCacheTtl";

export type DrawerSwapLayoutBodySpec = {
    cutoverEnabled: boolean;
    apiPath: string;
    entityId: string;
    queryParams?: Record<string, string | null | undefined>;
};

function isChildDrawerSwap(params: DrawerSwapBodyParams): boolean {
    return (
        params.type === "persons" &&
        (params.personDrawerOpenSeed?.presentation_emphasis === "child_lifecycle" ||
            params.source === "opportunity_inquiry_child")
    );
}

/** Resolve layout-runtime body fetch spec for a drawer model-swap target. */
export function resolveDrawerSwapLayoutBodySpec(
    params: DrawerSwapBodyParams
): DrawerSwapLayoutBodySpec | null {
    const entityId = params.id.trim();
    if (!entityId) return null;

    if (params.type === "opportunities") {
        const cutoverEnabled = isLayoutRuntimeOpportunityDrawerBodyEnabledClient();
        if (!cutoverEnabled) return null;
        const ws = params.opportunityWorkspaceContext;
        return {
            cutoverEnabled: true,
            apiPath: "/api/admin/layout-runtime/opportunity-drawer-body",
            entityId,
            queryParams: {
                departmentId: ws?.department_id ?? null,
                workUnitId: ws?.work_unit_id ?? null,
            },
        };
    }

    if (params.type === "persons") {
        const cutoverEnabled = isLayoutRuntimeHardCutoverActiveClient();
        if (!cutoverEnabled) return null;
        const childOpen = isChildDrawerSwap(params);
        return {
            cutoverEnabled: true,
            apiPath: childOpen
                ? "/api/admin/layout-runtime/child-drawer-body"
                : "/api/admin/layout-runtime/person-drawer-body",
            entityId,
            queryParams: childOpen
                ? undefined
                : { opportunityId: params.personDrawerOpenSeed?.opportunity_id ?? null },
        };
    }

    return null;
}

export function isDrawerSwapLayoutBodyWarm(params: DrawerSwapBodyParams): boolean {
    const spec = resolveDrawerSwapLayoutBodySpec(params);
    if (!spec?.cutoverEnabled) return true;
    const queryParamsKey = serializeDrawerLayoutRuntimeBodyQueryParams(spec.queryParams);
    const cacheKey = buildDrawerLayoutRuntimeBodyCacheKey(
        spec.apiPath,
        spec.entityId,
        queryParamsKey
    );
    return Boolean(
        peekDrawerLayoutRuntimeBodyCacheEntry(cacheKey, ADMINV2_UI_SESSION_CACHE_TTL_MS)
    );
}

/** Await layout body warm for atomic drawer swap — prior drawer stays visible until resolved. */
export function waitForDrawerSwapLayoutBodyWarm(params: DrawerSwapBodyParams): Promise<boolean> {
    const spec = resolveDrawerSwapLayoutBodySpec(params);
    if (!spec?.cutoverEnabled) return Promise.resolve(true);
    if (isDrawerSwapLayoutBodyWarm(params)) return Promise.resolve(true);
    return fetchDrawerLayoutRuntimeBodyDeduped({
        apiPath: spec.apiPath,
        entityId: spec.entityId,
        queryParams: spec.queryParams,
    }).then((payload) => Boolean(payload));
}
