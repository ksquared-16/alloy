/**
 * Tracks last active Configuration Mode surface for `/settings` redirect.
 */
import { adminSettingsSubpathHref } from "@/lib/admin/canonicalAdminRoutes";
import { CONFIGURATION_MODE_DEFAULT_SURFACE } from "@/lib/adminV2/configurationModeNav";

const STORAGE_KEY = "alloy:configuration-mode-last-surface";

function isConfigurationModeSurfacePath(path: string): boolean {
    return (
        path.startsWith("/organization/")
        || path.startsWith("/settings/")
        || path === "/admin/workflows"
        || path.startsWith("/admin/workflows/")
    );
}

/** Migrate legacy `/settings/{alias}` bookmarks to canonical Organization URLs. */
function normalizeStoredConfigurationSurface(path: string): string {
    const normalized = path.replace(/\/$/, "") || CONFIGURATION_MODE_DEFAULT_SURFACE;
    if (normalized === "/admin/workflows" || normalized.startsWith("/admin/workflows/")) {
        return normalized;
    }
    if (normalized.startsWith("/organization/")) {
        return normalized;
    }
    if (normalized.startsWith("/settings/")) {
        const subpath = normalized.slice("/settings/".length).split(/[?#]/)[0] ?? "";
        if (!subpath) return CONFIGURATION_MODE_DEFAULT_SURFACE;
        return adminSettingsSubpathHref(subpath);
    }
    return CONFIGURATION_MODE_DEFAULT_SURFACE;
}

export function readConfigurationModeLastSurface(): string {
    if (typeof window === "undefined") return CONFIGURATION_MODE_DEFAULT_SURFACE;
    try {
        const value = window.localStorage.getItem(STORAGE_KEY)?.trim();
        if (!value || !isConfigurationModeSurfacePath(value)) {
            return CONFIGURATION_MODE_DEFAULT_SURFACE;
        }
        return normalizeStoredConfigurationSurface(value);
    } catch {
        return CONFIGURATION_MODE_DEFAULT_SURFACE;
    }
}

export function writeConfigurationModeLastSurface(path: string): void {
    if (typeof window === "undefined") return;
    const normalized = path.replace(/\/$/, "") || CONFIGURATION_MODE_DEFAULT_SURFACE;
    if (!isConfigurationModeSurfacePath(normalized)) return;
    // Landing itself is not a "last surface" — keep the prior domain bookmark.
    if (normalized === "/organization" || normalized === "/settings") return;
    try {
        window.localStorage.setItem(STORAGE_KEY, normalizeStoredConfigurationSurface(normalized));
    } catch {
        /* ignore */
    }
}
