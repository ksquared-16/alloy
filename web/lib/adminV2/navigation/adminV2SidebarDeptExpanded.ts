const STORAGE_KEY = "alloy:v1:admV2:shell:deptExpanded";

/** Persist which department rows have work units revealed (session-scoped). */
export function readExpandedDeptIds(): Set<string> {
    if (typeof window === "undefined") return new Set();
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (!raw) return new Set();
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return new Set();
        return new Set(parsed.filter((id): id is string => typeof id === "string" && id.length > 0));
    } catch {
        return new Set();
    }
}

export function writeExpandedDeptIds(ids: Set<string>): void {
    if (typeof window === "undefined") return;
    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
    } catch {
        /* ignore */
    }
}
