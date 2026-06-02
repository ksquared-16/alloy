/**
 * Safe identification of builder/test lifecycles for admin cleanup — never matches platform departments.
 */

import { isSimulationDepartmentRow, PROTECTED_DEPARTMENT_KEYS } from "@/lib/lifecycle/lifecycleSimulationMarkers";
import { isLifecycleBuilderOwnedDepartmentMetadata } from "@/lib/lifecycle/lifecycleBuilderOwned";

export type DepartmentCleanupProbe = {
    id?: string;
    key?: string | null;
    name?: string | null;
    description?: string | null;
    metadata?: unknown;
};

const TEST_NAME_EXACT = new Set(
    ["admissions test", "admission test", "lifecycle test", "builder test", "test admissions"].map((s) =>
        s.toLowerCase()
    )
);

/** True when department name/key clearly indicates sprint validation data (builder-owned or simulation). */
export function isTestLifecycleDepartmentName(name: string, key?: string | null): boolean {
    const n = name.trim().toLowerCase();
    const k = (key ?? "").trim().toLowerCase();
    if (!n && !k) return false;
    if (TEST_NAME_EXACT.has(n)) return true;
    if (n.includes("admissions test")) return true;
    if (n.startsWith("verify lifecycle ")) return true;
    if (n.startsWith("[sim]")) return true;
    if (/\btest\b/.test(n) && (n.includes("admission") || n.includes("lifecycle"))) return true;
    if (k.startsWith("verify_lifecycle_")) return true;
    if (k.includes("_test_") || k.endsWith("_test")) return true;
    return false;
}

/**
 * Eligible for "Remove test lifecycles" cleanup — builder-owned or simulation, never platform depts.
 */
export function isRemovableTestLifecycleDepartment(row: DepartmentCleanupProbe): boolean {
    const key = (row.key ?? "").trim().toLowerCase();
    if (PROTECTED_DEPARTMENT_KEYS.has(key)) return false;

    if (isSimulationDepartmentRow(row)) return true;

    if (!isLifecycleBuilderOwnedDepartmentMetadata(row.metadata)) return false;

    const name = (row.name ?? "").trim();
    if (isTestLifecycleDepartmentName(name, key)) return true;

    const meta = row.metadata;
    if (meta != null && typeof meta === "object" && !Array.isArray(meta)) {
        const m = meta as Record<string, unknown>;
        if (m.lifecycle_test_v1 === true) return true;
        if (m.lifecycle_dev_created === true) return true;
    }

    return false;
}
