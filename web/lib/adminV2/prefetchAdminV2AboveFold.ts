import { deptAboveFoldCacheKey } from "@/lib/adminV2/adminV2AboveFoldCacheContracts";
import { logPrefetchAdminV2 } from "@/lib/adminV2/adminV2PrefetchInstrumentation";
import {
    buildDepartmentOperationalBootstrapUrl,
    prefetchDepartmentOperationalBootstrap,
} from "@/lib/adminV2/navigation/prefetchDepartmentOperationalBootstrap";
import { prefetchWorkUnitOperationalBootstrapFromDeptHref } from "@/lib/adminV2/workUnitBootstrapPrefetchFromDept";
import { ADMINV2_ABOVE_FOLD_CACHE_LIMITS } from "@/lib/adminV2/adminV2AboveFoldCacheContracts";

export type PrefetchDeptAboveFoldParams = {
    departmentId: string;
    orgId?: string | null;
    principalUserId?: string | null;
    accessScopeFingerprint?: string;
    selectedSiteId?: string | null;
    rightRailWorkUnitId?: string | null;
    reason?: "pointer" | "hover" | "click_prepare" | "workspace_idle_visible";
};

/**
 * Warm department operational-bootstrap (above-fold bundle) before navigation.
 */
export async function prefetchDeptAboveFoldBundle(params: PrefetchDeptAboveFoldParams): Promise<void> {
    const { departmentId } = params;
    if (!departmentId.trim()) return;

    const cacheKey =
        params.orgId && params.accessScopeFingerprint
            ? deptAboveFoldCacheKey({
                  orgId: params.orgId,
                  departmentId,
                  principalUserId: params.principalUserId ?? null,
                  accessScopeFingerprint: params.accessScopeFingerprint,
                  selectedSiteId: params.selectedSiteId,
              })
            : departmentId;

    logPrefetchAdminV2("department", "start", {
        cache_key: cacheKey,
        department_id: departmentId,
        reason: params.reason ?? "pointer",
        url: buildDepartmentOperationalBootstrapUrl(departmentId, {
            selectedSiteId: params.selectedSiteId,
            rightRailWorkUnitId: params.rightRailWorkUnitId,
        }),
    });

    try {
        await prefetchDepartmentOperationalBootstrap(departmentId, {
            selectedSiteId: params.selectedSiteId,
            rightRailWorkUnitId: params.rightRailWorkUnitId,
        });
        logPrefetchAdminV2("department", "complete", {
            cache_key: cacheKey,
            department_id: departmentId,
            reason: params.reason,
        });
    } catch (e) {
        logPrefetchAdminV2("department", "error", {
            cache_key: cacheKey,
            department_id: departmentId,
            message: e instanceof Error ? e.message : "prefetch failed",
        });
        throw e;
    }
}

/** Fire-and-forget dept prefetch from workspace tile intent. */
export function prefetchDeptAboveFoldOnIntent(params: PrefetchDeptAboveFoldParams): void {
    void prefetchDeptAboveFoldBundle(params).catch(() => {
        /* best-effort */
    });
}

/**
 * Cap visible department prefetches from workspace after reveal (do not preload entire org).
 */
export function prefetchVisibleDepartmentAboveFoldBundles(
    departmentIds: string[],
    opts: Omit<PrefetchDeptAboveFoldParams, "departmentId" | "reason">
): void {
    const cap = ADMINV2_ABOVE_FOLD_CACHE_LIMITS.workspace_visible_dept_prefetch;
    const unique = [...new Set(departmentIds.map((id) => id.trim()).filter(Boolean))].slice(0, cap);
    if (!unique.length) {
        logPrefetchAdminV2("workspace", "skipped", { reason: "no_visible_departments" });
        return;
    }
    logPrefetchAdminV2("workspace", "start", {
        reason: "workspace_idle_visible",
        department_ids: unique,
        cap,
    });
    for (const departmentId of unique) {
        prefetchDeptAboveFoldOnIntent({
            ...opts,
            departmentId,
            reason: "workspace_idle_visible",
        });
    }
}

export { prefetchWorkUnitOperationalBootstrapFromDeptHref };
