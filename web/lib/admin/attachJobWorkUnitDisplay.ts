import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Adds _work_unit_name, _work_unit_department_name, _work_unit_label for admin job payloads.
 * Validates work unit belongs to org when work_unit_id is set (stale id → cleared display).
 */
export async function attachJobWorkUnitDisplay(
    supabase: SupabaseClient,
    orgId: string,
    job: Record<string, unknown>
): Promise<Record<string, unknown>> {
    const wuId = job.work_unit_id;
    if (!wuId || typeof wuId !== "string" || !wuId.trim()) {
        return {
            ...job,
            _work_unit_name: null,
            _work_unit_department_name: null,
            _work_unit_label: null,
        };
    }
    const { data: wu } = await supabase
        .from("work_units")
        .select("id, name, department_id")
        .eq("id", wuId.trim())
        .eq("org_id", orgId)
        .maybeSingle();
    if (!wu) {
        return {
            ...job,
            _work_unit_name: null,
            _work_unit_department_name: null,
            _work_unit_label: null,
        };
    }
    const w = wu as { name: string | null; department_id: string };
    const { data: dept } = await supabase
        .from("departments")
        .select("name")
        .eq("id", w.department_id)
        .eq("org_id", orgId)
        .maybeSingle();
    const deptName = (dept as { name?: string | null } | null)?.name ?? null;
    const wuName = w.name ?? null;
    const label =
        deptName && wuName ? `${deptName} · ${wuName}` : (wuName ?? deptName ?? wuId.trim());
    return {
        ...job,
        _work_unit_name: wuName,
        _work_unit_department_name: deptName,
        _work_unit_label: label,
    };
}
