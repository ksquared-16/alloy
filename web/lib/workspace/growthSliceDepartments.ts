/**
 * Departments that use the opportunity / pipeline workspace (Growth slice), not job-centric metrics.
 * Keys align with `departments.key` from bootstrap / admin.
 */
const GROWTH_SLICE_KEYS = new Set(["growth", "enrollment"]);

export function isGrowthSliceDepartmentKey(departmentKey: string | null | undefined): boolean {
    const k = (departmentKey ?? "").trim().toLowerCase();
    return k !== "" && GROWTH_SLICE_KEYS.has(k);
}
