import { appendWorkspaceSiteToUrl } from "@/lib/adminV2/workspaceSiteFilterClient";
import { logPrefetchAdminV2 } from "@/lib/adminV2/adminV2PrefetchInstrumentation";
import { ADMINV2_ABOVE_FOLD_CACHE_TTL_MS } from "@/lib/adminV2/adminV2AboveFoldCacheContracts";
import { dedupeAdminFetchWithTtlMeta } from "@/lib/workspace/workspaceAdminFetchDedupe";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

/** Query params aligned with `dept/[departmentId]/page.tsx` operational-bootstrap request. */
export function buildDepartmentOperationalBootstrapUrl(
    departmentId: string,
    opts?: { selectedSiteId?: string | null; rightRailWorkUnitId?: string | null }
): string {
    const qs = new URLSearchParams({
        include_previews: "false",
        count_mode: "exact",
        summary_mode: "priority",
        priority_budget: "5",
        bundle_mode: "prefetch",
    });
    const railWu = (opts?.rightRailWorkUnitId ?? "").trim();
    if (railWu) qs.set("right_rail_work_unit_id", railWu);
    const base = `/api/admin/departments/${encodeURIComponent(departmentId)}/operational-bootstrap?${qs.toString()}`;
    return appendWorkspaceSiteToUrl(base, opts?.selectedSiteId ?? null);
}

/**
 * Best-effort warm-up for workspace → dept navigation (GET only, no mutations).
 * Rejects when the response is not ok so the transition helper can still commit via fallback.
 */
export async function prefetchDepartmentOperationalBootstrap(
    departmentId: string,
    opts?: { selectedSiteId?: string | null; rightRailWorkUnitId?: string | null }
): Promise<void> {
    const url = buildDepartmentOperationalBootstrapUrl(departmentId, opts);
    logPrefetchAdminV2("department", "start", { department_id: departmentId, url });
    const { response: res, cache_hit, inflight_join } = await dedupeAdminFetchWithTtlMeta(
        url,
        workspaceDataFetchInit() ?? {},
        ADMINV2_ABOVE_FOLD_CACHE_TTL_MS.dept_above_fold
    );
    if (!res.ok) {
        logPrefetchAdminV2("department", "error", { department_id: departmentId, status: res.status });
        throw new Error(`department operational-bootstrap prefetch failed (${res.status})`);
    }
    const bodyText = await res.text();
    const payload_kb = bodyText.length > 0 ? Math.round((bodyText.length / 1024) * 10) / 10 : undefined;
    logPrefetchAdminV2("department", "complete", {
        department_id: departmentId,
        cache_hit,
        inflight_join,
        payload_kb,
    });
}
