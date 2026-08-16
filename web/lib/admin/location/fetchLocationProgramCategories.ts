import type { LocationProgramCategoryRow } from "@/lib/locations/locationProgramCategories";
import { dedupeAdminFetchWithTtl } from "@/lib/workspace/workspaceAdminFetchDedupe";

export const WORKSPACE_LOCATION_PROGRAM_CATEGORIES_URL = "/api/admin/location-program-categories";

function asOptionalString(value: unknown): string | null {
    const raw = String(value ?? "").trim();
    return raw || null;
}

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
        // Publication / availability columns — required for Location ↔ Program identity matching.
        program_id: asOptionalString(r.program_id),
        program_revision_id: asOptionalString(r.program_revision_id),
        configuration_consumption_id: asOptionalString(r.configuration_consumption_id),
        local_display_name: asOptionalString(r.local_display_name),
        available_from: asOptionalString(r.available_from),
        available_through: asOptionalString(r.available_through),
        local_description_override: asOptionalString(r.local_description_override),
        local_authorization_evidence: asOptionalString(r.local_authorization_evidence),
    };
}

/**
 * Program categories are org configuration and unchanged within an interaction, so concurrent
 * callers share one request through the workspace's ESTABLISHED dedupe primitive — the same one
 * the sibling locations call in `useInquiryChildPlacementCascade` already uses. No new cache.
 *
 * Without it every mounted placement-cascade instance fetched independently: one Household
 * drill-in on Firefly issued `GET /api/admin/location-program-categories?include_inactive=true`
 * **22 times**, byte-identical, because that surface renders many identity fields and several
 * resolve placement options.
 */
const PROGRAM_CATEGORIES_TTL_MS = 30_000;

/** Fetch all org location program categories (admin API). Deduped per URL. */
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

    const res = await dedupeAdminFetchWithTtl(url, { credentials: "include", ...init }, PROGRAM_CATEGORIES_TTL_MS);

    const json = (await res.json().catch(() => ({}))) as {
        categories?: Array<Record<string, unknown>>;
        error?: string;
    };
    if (!res.ok) {
        throw new Error(json.error ?? `Failed to load location programs (${res.status})`);
    }
    return (json.categories ?? [])
        .map((r) => mapCategoryRow(r))
        .filter((r): r is LocationProgramCategoryRow => r != null);
}
