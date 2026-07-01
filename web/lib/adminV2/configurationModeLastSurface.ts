/**
 * Tracks last active Configuration Mode surface for `/settings` redirect.
 */
import { CONFIGURATION_MODE_DEFAULT_SURFACE } from "@/lib/adminV2/configurationModeNav";

const STORAGE_KEY = "alloy:configuration-mode-last-surface";

export function readConfigurationModeLastSurface(): string {
    if (typeof window === "undefined") return CONFIGURATION_MODE_DEFAULT_SURFACE;
    try {
        const value = window.localStorage.getItem(STORAGE_KEY)?.trim();
        return value && value.startsWith("/settings") ? value : CONFIGURATION_MODE_DEFAULT_SURFACE;
    } catch {
        return CONFIGURATION_MODE_DEFAULT_SURFACE;
    }
}

export function writeConfigurationModeLastSurface(path: string): void {
    if (typeof window === "undefined") return;
    const normalized = path.replace(/\/$/, "") || CONFIGURATION_MODE_DEFAULT_SURFACE;
    if (!normalized.startsWith("/settings") && normalized !== "/admin/workflows") return;
    try {
        window.localStorage.setItem(STORAGE_KEY, normalized);
    } catch {
        /* ignore */
    }
}
