import { CANONICAL_ORGANIZATION_BASE, CANONICAL_SETTINGS_BASE } from "@/lib/admin/canonicalAdminRoutes";

/** Compatibility Settings path — still rewritten to the Locations page. */
export const LOCATION_SETTINGS_PATH = `${CANONICAL_SETTINGS_BASE}/locations` as const;

/** Canonical Organization Locations path (Checkpoint B convergence). */
export const ORGANIZATION_LOCATIONS_PATH = `${CANONICAL_ORGANIZATION_BASE}/locations` as const;

/** Query param for deep-linking a selected campus/site in Organization → Locations. */
export const LOCATION_SETTINGS_LOCATION_ID_PARAM = "locationId" as const;

/** Product href base — prefer Organization namespace; Settings path remains compatible. */
export const CANONICAL_LOCATIONS_HREF = ORGANIZATION_LOCATIONS_PATH;

export function canonicalLocationSettingsHref(locationId: string): string {
    const id = String(locationId ?? "").trim();
    if (!id) return CANONICAL_LOCATIONS_HREF;
    const params = new URLSearchParams({ [LOCATION_SETTINGS_LOCATION_ID_PARAM]: id });
    return `${CANONICAL_LOCATIONS_HREF}?${params.toString()}`;
}

export function parseLocationSettingsLocationId(
    raw: string | string[] | null | undefined,
): string | null {
    const value = Array.isArray(raw) ? raw[0] : raw;
    const id = String(value ?? "").trim();
    return id || null;
}

export function isLocationsConfigurationPath(pathname: string): boolean {
    const p = pathname.trim().replace(/\/$/, "");
    return (
        p === ORGANIZATION_LOCATIONS_PATH
        || p === LOCATION_SETTINGS_PATH
        || p.startsWith(`${ORGANIZATION_LOCATIONS_PATH}?`)
        || p.startsWith(`${LOCATION_SETTINGS_PATH}?`)
    );
}
