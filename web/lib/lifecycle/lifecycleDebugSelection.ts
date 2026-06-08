/** Persist selected lifecycle id for /workspace dev debug panel (sessionStorage). */

const KEY = "alloy:lifecycle-debug-selection";

export type LifecycleDebugSelection = {
    department_id: string;
    lifecycle_name: string;
    process_id: string;
    expected_tile_name: string;
    saved_at_ms: number;
};

export function setLifecycleDebugSelection(payload: Omit<LifecycleDebugSelection, "saved_at_ms">): void {
    if (typeof window === "undefined") return;
    try {
        const body: LifecycleDebugSelection = { ...payload, saved_at_ms: Date.now() };
        sessionStorage.setItem(KEY, JSON.stringify(body));
    } catch {
        /* ignore */
    }
}

export function readLifecycleDebugSelection(): LifecycleDebugSelection | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = sessionStorage.getItem(KEY);
        if (!raw) return null;
        const row = JSON.parse(raw) as Partial<LifecycleDebugSelection>;
        if (typeof row.department_id !== "string" || !row.department_id.trim()) return null;
        return row as LifecycleDebugSelection;
    } catch {
        return null;
    }
}
