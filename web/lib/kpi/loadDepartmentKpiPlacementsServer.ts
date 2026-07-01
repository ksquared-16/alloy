import { createAdminClient } from "@/lib/supabaseAdmin";
import type { WorkspaceKpiPlacementRow } from "@/lib/kpi/types";

const SELECT_COLS =
    "id, org_id, surface, department_id, work_unit_id, metric_key, display_order, is_visible, label_override, format_override, lane_override, metadata, created_at, updated_at";

type PlacementCacheEntry = {
    at: number;
    items: WorkspaceKpiPlacementRow[];
    scope_has_placements: boolean;
};

const DEPT_KPI_PLACEMENTS_CACHE = new Map<string, PlacementCacheEntry>();
const DEPT_KPI_PLACEMENTS_TTL_MS = 60_000;

function cacheKey(orgId: string, departmentId: string): string {
    return `${orgId}:${departmentId}`;
}

export async function loadDepartmentKpiPlacementsServer(params: {
    orgId: string;
    departmentId: string;
}): Promise<{ items: WorkspaceKpiPlacementRow[]; scope_has_placements: boolean; cache_hit: boolean }> {
    const { orgId, departmentId } = params;
    const key = cacheKey(orgId, departmentId);
    const now = Date.now();
    const hit = DEPT_KPI_PLACEMENTS_CACHE.get(key);
    if (hit && now - hit.at < DEPT_KPI_PLACEMENTS_TTL_MS) {
        return { items: hit.items, scope_has_placements: hit.scope_has_placements, cache_hit: true };
    }

    const supabase = createAdminClient();
    const [{ data, error }, countRes] = await Promise.all([
        supabase
            .from("workspace_kpi_placement")
            .select(SELECT_COLS)
            .eq("org_id", orgId)
            .eq("surface", "department")
            .eq("department_id", departmentId)
            .is("work_unit_id", null)
            .eq("is_visible", true)
            .order("display_order", { ascending: true })
            .order("metric_key", { ascending: true }),
        supabase
            .from("workspace_kpi_placement")
            .select("id", { count: "exact", head: true })
            .eq("org_id", orgId)
            .eq("surface", "department")
            .eq("department_id", departmentId)
            .is("work_unit_id", null),
    ]);

    if (error) {
        throw new Error(error.message);
    }
    if (countRes.error) {
        throw new Error(countRes.error.message);
    }

    const items = (data ?? []) as WorkspaceKpiPlacementRow[];
    const scope_has_placements = (countRes.count ?? 0) > 0;
    DEPT_KPI_PLACEMENTS_CACHE.set(key, { at: now, items, scope_has_placements });
    return { items, scope_has_placements, cache_hit: false };
}
