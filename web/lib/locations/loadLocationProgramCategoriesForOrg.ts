import type { SupabaseClient } from "@supabase/supabase-js";
import type { LocationProgramCategoryRow } from "@/lib/locations/locationProgramCategories";
import { LOCATION_PROGRAM_CATEGORY_SELECT_PUBLICATION } from "@/lib/locations/locationProgramCategorySelect";
import { processMap } from "@/lib/perf/processCache";

function asOptionalString(value: unknown): string | null {
    const raw = String(value ?? "").trim();
    return raw || null;
}

function mapCategoryRow(row: Record<string, unknown>): LocationProgramCategoryRow | null {
    const id = String(row.id ?? "").trim();
    const location_id = String(row.location_id ?? "").trim();
    const key = String(row.key ?? "").trim();
    const label = String(row.label ?? "").trim();
    if (!id || !location_id || !key || !label) return null;
    return {
        id,
        org_id: String(row.org_id ?? "").trim(),
        location_id,
        key,
        label,
        sort_order: row.sort_order != null ? Number(row.sort_order) : null,
        is_active: row.is_active !== false,
        metadata:
            row.metadata != null && typeof row.metadata === "object" && !Array.isArray(row.metadata)
                ? (row.metadata as Record<string, unknown>)
                : null,
        program_id: asOptionalString(row.program_id),
        program_revision_id: asOptionalString(row.program_revision_id),
        configuration_consumption_id: asOptionalString(row.configuration_consumption_id),
        local_display_name: asOptionalString(row.local_display_name),
        available_from: asOptionalString(row.available_from),
        available_through: asOptionalString(row.available_through),
        local_description_override: asOptionalString(row.local_description_override),
        local_authorization_evidence: asOptionalString(row.local_authorization_evidence),
    };
}

/**
 * Org-scoped configuration cache. These categories are read on EVERY provisioning answer — the
 * Waitlist placement attach alone spent ~350ms of a 4.5s step on it, serially — and they change
 * about as often as any other org configuration. 90s matches the TTL its sibling org-config
 * caches already use (`STATUS_EFFECTIVE_CACHE`, `ORG_OP_TZ_PROCESS_CACHE`).
 *
 * Held via `processMap` so it is genuinely process-wide: a module-level Map is per-route-bundle in
 * a Next production build and would never hit across the request fan-out a page makes.
 */
const CATEGORY_CACHE = processMap<string, { at: number; rows: LocationProgramCategoryRow[] }>("location_program_categories");
const CATEGORY_TTL_MS = 90_000;

/** Server-side batch load for org location program categories (includes inactive for display). */
export async function loadLocationProgramCategoriesForOrg(
    supabase: SupabaseClient,
    orgId: string
): Promise<LocationProgramCategoryRow[]> {
    const hit = CATEGORY_CACHE.get(orgId);
    // Return a COPY: the cached array outlives the request, and a caller that sorts or splices it
    // would corrupt every later reader.
    if (hit && Date.now() - hit.at < CATEGORY_TTL_MS) return [...hit.rows];

    const { data, error } = await supabase
        .from("location_program_categories")
        .select(LOCATION_PROGRAM_CATEGORY_SELECT_PUBLICATION)
        .eq("org_id", orgId)
        .order("sort_order", { ascending: true })
        .order("label", { ascending: true });

    if (error || !data?.length) return [];

    const rows = data
        .map((raw) => mapCategoryRow(raw as Record<string, unknown>))
        .filter((r): r is LocationProgramCategoryRow => r != null);
    CATEGORY_CACHE.set(orgId, { at: Date.now(), rows });
    return [...rows];
}
