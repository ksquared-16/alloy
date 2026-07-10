import { CANONICAL_SETTINGS_BASE } from "@/lib/admin/canonicalAdminRoutes";

export const LOCATION_SETTINGS_PATH = `${CANONICAL_SETTINGS_BASE}/locations` as const;

/** Query param for deep-linking a selected campus/site in Settings → Locations. */
export const LOCATION_SETTINGS_LOCATION_ID_PARAM = "locationId" as const;

export function canonicalLocationSettingsHref(locationId: string): string {
    const id = String(locationId ?? "").trim();
    if (!id) return LOCATION_SETTINGS_PATH;
    const params = new URLSearchParams({ [LOCATION_SETTINGS_LOCATION_ID_PARAM]: id });
    return `${LOCATION_SETTINGS_PATH}?${params.toString()}`;
}

export function parseLocationSettingsLocationId(
    raw: string | string[] | null | undefined,
): string | null {
    const value = Array.isArray(raw) ? raw[0] : raw;
    const id = String(value ?? "").trim();
    return id || null;
}
