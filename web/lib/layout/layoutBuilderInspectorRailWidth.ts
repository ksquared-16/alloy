const STORAGE_KEY = "alloy.layoutBuilder.inspectorRailWidth";

export const LAYOUT_BUILDER_INSPECTOR_RAIL_MIN_PX = 360;
export const LAYOUT_BUILDER_INSPECTOR_RAIL_MAX_PX = 640;
export const LAYOUT_BUILDER_INSPECTOR_RAIL_DEFAULT_PX = 420;

function clampInspectorRailWidth(px: number): number {
    return Math.min(
        LAYOUT_BUILDER_INSPECTOR_RAIL_MAX_PX,
        Math.max(LAYOUT_BUILDER_INSPECTOR_RAIL_MIN_PX, Math.round(px)),
    );
}

/** Read persisted inspector rail width (session/local storage). */
export function readLayoutBuilderInspectorRailWidth(): number {
    if (typeof window === "undefined") return LAYOUT_BUILDER_INSPECTOR_RAIL_DEFAULT_PX;
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY) ?? window.sessionStorage.getItem(STORAGE_KEY);
        if (!raw) return LAYOUT_BUILDER_INSPECTOR_RAIL_DEFAULT_PX;
        const parsed = Number.parseInt(raw, 10);
        if (!Number.isFinite(parsed)) return LAYOUT_BUILDER_INSPECTOR_RAIL_DEFAULT_PX;
        return clampInspectorRailWidth(parsed);
    } catch {
        return LAYOUT_BUILDER_INSPECTOR_RAIL_DEFAULT_PX;
    }
}

/** Persist inspector rail width for the current browser session. */
export function writeLayoutBuilderInspectorRailWidth(px: number): void {
    if (typeof window === "undefined") return;
    const clamped = clampInspectorRailWidth(px);
    try {
        window.localStorage.setItem(STORAGE_KEY, String(clamped));
        window.sessionStorage.setItem(STORAGE_KEY, String(clamped));
    } catch {
        // ignore quota / private mode
    }
}

export function clampLayoutBuilderInspectorRailWidth(px: number): number {
    return clampInspectorRailWidth(px);
}
