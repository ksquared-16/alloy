/**
 * Detect simulation/test lifecycle departments — shared by cleanup scripts and tests.
 */

export const SIMULATION_DEPARTMENT_NAME_PREFIX = "[SIM] " as const;

/** Platform departments that must never be deleted by simulation cleanup. */
export const PROTECTED_DEPARTMENT_KEYS = new Set([
    "enrollment",
    "operations",
    "finance",
    "compliance",
    "system",
]);

export type DepartmentSimulationProbe = {
    id?: string;
    key?: string | null;
    name?: string | null;
    description?: string | null;
    metadata?: unknown;
};

function metaString(meta: unknown, key: string): string {
    if (meta == null || typeof meta !== "object" || Array.isArray(meta)) return "";
    return String((meta as Record<string, unknown>)[key] ?? "").toLowerCase();
}

/** True when this department row was created by simulation/debug scripts (not user UI). */
export function isSimulationDepartmentRow(row: DepartmentSimulationProbe): boolean {
    const key = (row.key ?? "").trim().toLowerCase();
    if (PROTECTED_DEPARTMENT_KEYS.has(key)) return false;

    const name = (row.name ?? "").trim().toLowerCase();
    const desc = (row.description ?? "").trim().toLowerCase();

    if (name.startsWith(SIMULATION_DEPARTMENT_NAME_PREFIX.toLowerCase())) return true;
    if (name.includes("e2e admissions")) return true;
    if (name.includes("pre-fix sim")) return true;
    if (name.startsWith("verify lifecycle ")) return true;
    if (desc.includes("pre-fix e2e simulation")) return true;
    if (desc.includes("pre-fix simulation")) return true;
    if (key.startsWith("e2e_admissions")) return true;
    if (key.startsWith("verify_lifecycle_")) return true;

    if (metaString(row.metadata, "simulation") === "true") return true;
    if (metaString(row.metadata, "lifecycle_simulation_v1") !== "") return true;

    return false;
}

export function simulationLifecycleDisplayName(baseName: string): string {
    const trimmed = baseName.trim();
    if (trimmed.toLowerCase().startsWith(SIMULATION_DEPARTMENT_NAME_PREFIX.toLowerCase())) return trimmed;
    return `${SIMULATION_DEPARTMENT_NAME_PREFIX}${trimmed}`;
}
