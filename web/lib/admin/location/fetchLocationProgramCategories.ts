import type { LocationProgramCategoryRow } from "@/lib/locations/locationProgramCategories";

export const WORKSPACE_LOCATION_PROGRAM_CATEGORIES_URL = "/api/admin/location-program-categories";

function mapCategoryRow(r: Record<string, unknown>): LocationProgramCategoryRow | null {
    const id = String(r.id ?? "").trim();
    const location_id = String(r.location_id ?? "").trim();
    const key = String(r.key ?? "").trim();
    const label = String(r.label ?? "").trim();
    if (!id || !location_id || !key || !label) return null;
    return {
        id,
        org_id: String(r.org_id ?? "").trim(),
        location_id,
        key,
        label,
        sort_order: r.sort_order != null ? Number(r.sort_order) : null,
        is_active: r.is_active !== false,
        metadata:
            r.metadata != null && typeof r.metadata === "object" && !Array.isArray(r.metadata)
                ? (r.metadata as Record<string, unknown>)
                : null,
    };
}

/** Fetch all org location program categories (admin API). */
export async function fetchLocationProgramCategories(
    init?: RequestInit,
    params?: { locationId?: string | null; includeInactive?: boolean }
): Promise<LocationProgramCategoryRow[]> {
    const search = new URLSearchParams();
    const locationId = (params?.locationId ?? "").trim();
    if (locationId) search.set("location_id", locationId);
    if (params?.includeInactive) search.set("include_inactive", "true");
    const qs = search.toString();
    const url = qs ? `${WORKSPACE_LOCATION_PROGRAM_CATEGORIES_URL}?${qs}` : WORKSPACE_LOCATION_PROGRAM_CATEGORIES_URL;

    const res = await fetch(url, { credentials: "include", ...init });
    const json = (await res.json().catch(() => ({}))) as {
        categories?: Array<Record<string, unknown>>;
        error?: string;
    };
    if (!res.ok) return [];
    return (json.categories ?? [])
        .map((r) => mapCategoryRow(r))
        .filter((r): r is LocationProgramCategoryRow => r != null);
}
