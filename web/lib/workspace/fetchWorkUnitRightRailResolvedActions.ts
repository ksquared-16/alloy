import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import { dedupeAdminFetchWithTtl } from "@/lib/workspace/workspaceAdminFetchDedupe";

/**
 * Client fetch for the Work Unit right-rail configured actions (`surface=work_unit,right_rail`).
 *
 * Loads the resolved action lane directly from the bundle route so the rail is never empty on a
 * cold process cache — the WU operational-bootstrap defers `right_rail_actions` when the cache is
 * cold and there is no re-fetch on that path (see the PR-V2 right-rail handoff, §5 defer caveat).
 * Deduped + TTL-cached so it never double-fetches what a sibling render already requested.
 */
export async function fetchWorkUnitRightRailResolvedActions(params: {
    departmentId: string;
    workUnitId: string;
    fetchInit?: RequestInit;
}): Promise<ResolvedActionForClient[]> {
    const query = new URLSearchParams({
        department_id: params.departmentId,
        work_unit_id: params.workUnitId,
        surfaces: "work_unit,right_rail",
    });
    const route = `/api/admin/actions/right-rail-bundle?${query.toString()}`;
    const res = await dedupeAdminFetchWithTtl(route, params.fetchInit ?? {}, 30000);
    if (!res.ok) return [];
    const json = (await res.json().catch(() => ({}))) as { actions?: ResolvedActionForClient[] };
    return Array.isArray(json.actions) ? json.actions : [];
}
