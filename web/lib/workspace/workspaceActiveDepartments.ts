/**
 * Department list shaping for /adminV2/workspace — shared by GET /api/admin/departments
 * and lifecycle activation runtime validation (must match).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";

export type WorkspaceActiveDepartmentRow = {
    id: string;
    key: string;
    name: string;
    description?: string | null;
    sort_order?: number | null;
    is_active?: boolean | null;
    default_visual_context_key?: string | null;
};

/** Same filter as workspace root page after GET /api/admin/departments. */
export function filterActiveWorkspaceDepartments<T extends { is_active?: boolean | null }>(
    items: T[]
): T[] {
    return items.filter((d) => d.is_active !== false);
}

/** Same department allow-list as GET /api/admin/departments (admin route gate). */
export function applyDepartmentAccessScope<T extends { id: string }>(
    items: T[],
    dim: AdminAccessScopeDimensions
): T[] {
    if (dim.departmentScope === "all") return items;
    const allowed = new Set(dim.allowedDepartmentIds ?? []);
    return items.filter((d) => allowed.has(d.id));
}

export async function fetchWorkspaceActiveDepartments(
    supabase: SupabaseClient,
    orgId: string,
    dim?: AdminAccessScopeDimensions
): Promise<WorkspaceActiveDepartmentRow[]> {
    const { data, error } = await supabase
        .from("departments")
        .select("id, key, name, description, sort_order, is_active")
        .eq("org_id", orgId)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    const active = filterActiveWorkspaceDepartments((data ?? []) as WorkspaceActiveDepartmentRow[]);
    return dim ? applyDepartmentAccessScope(active, dim) : active;
}
