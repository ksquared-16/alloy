/**
 * Canonical Location provider (Phase A, A1).
 *
 * One typed read surface over the raw `locations` table, mirroring the canonical
 * data-provider convention (PR #184: model + provider + legacy-compat seam). It
 * folds the divergent raw row shapes into {@link CanonicalLocation}, enforces the
 * org + site-access boundary, and — critically — excludes `location_type =
 * 'address'` field-service records from the childcare domain unless a caller
 * explicitly opts in (RFC §20).
 *
 * Phase A wraps existing reads and hides storage; it migrates no consumers.
 * `resolveOrgSiteLocationsForAdmin` remains the compatibility seam for the site
 * list; its callers converge in Phase C and the helper is removed in Phase E.
 *
 * The DB layer uses only query methods the shared test mock supports (no `.or`);
 * `is_active`, site-scope, hierarchy, and address exclusion are applied in memory
 * (one query per call — no N+1).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    isChildcareLocationType,
    type CanonicalLocation,
    type CanonicalLocationAddress,
    type CanonicalLocationResolutionMode,
    type CanonicalLocationType,
    type SiteScopeFilter,
} from "@/lib/location/canonicalLocationModel";

/** Columns selected to build a CanonicalLocation. */
export const CANONICAL_LOCATION_SELECT =
    "id, org_id, label, location_number, location_type, parent_location_id, status_key, is_active, is_primary, address1, address2, city, state, postal_code, country, lat, lng, metadata";

/** Raw `locations` row as returned by PostgREST (all fields optional/defensive). */
type RawLocationRow = Record<string, unknown>;

function str(value: unknown): string | null {
    return typeof value === "string" && value.length > 0 ? value : null;
}

function num(value: unknown): number | null {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    if (typeof value === "string" && value.trim() !== "") {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

function asMetadata(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
}

/** DB CHECK guarantees one of three; default to the DB default `address` if absent. */
function normalizeLocationType(value: unknown): CanonicalLocationType {
    if (value === "site" || value === "unit" || value === "address") return value;
    return "address";
}

function normalizeAddress(raw: RawLocationRow): CanonicalLocationAddress | null {
    const address: CanonicalLocationAddress = {
        address1: str(raw.address1),
        address2: str(raw.address2),
        city: str(raw.city),
        state: str(raw.state),
        postalCode: str(raw.postal_code),
        country: str(raw.country),
        lat: num(raw.lat),
        lng: num(raw.lng),
    };
    const hasAny = Object.values(address).some((v) => v != null);
    return hasAny ? address : null;
}

/**
 * Total raw → CanonicalLocation normalizer. Never throws on a missing optional;
 * `is_active` null/undefined is treated as active (matches the legacy readers).
 */
export function normalizeLocationRow(raw: RawLocationRow): CanonicalLocation {
    const metadata = asMetadata(raw.metadata);
    return {
        id: str(raw.id) ?? "",
        orgId: str(raw.org_id) ?? "",
        name: str(raw.label),
        locationNumber: num(raw.location_number),
        type: normalizeLocationType(raw.location_type),
        parentLocationId: str(raw.parent_location_id),
        statusKey: str(raw.status_key),
        isActive: raw.is_active !== false,
        isPrimary: raw.is_primary === true,
        address: normalizeAddress(raw),
        timezoneRef: str(metadata.timezone),
        metadata,
    };
}

/** Canonical display label: `name`, then address parts (matches legacy patterns). */
export function canonicalLocationDisplay(location: CanonicalLocation): string | null {
    if (location.name) return location.name;
    const address = location.address;
    if (!address) return null;
    const joined = [address.address1, address.city, address.postalCode]
        .map((part) => (typeof part === "string" ? part.trim() : ""))
        .filter(Boolean)
        .join(", ");
    return joined || null;
}

/**
 * Whether a location is visible under a site-scope allow-list. Sites must be in
 * the list; units must hang off an allowed site. Undefined list = org-wide.
 */
export function isInSiteScope(location: CanonicalLocation, scope: SiteScopeFilter | undefined): boolean {
    const allow = scope?.siteLocationIds;
    if (!allow) return true;
    const set = new Set(allow);
    if (location.type === "site") return set.has(location.id);
    if (location.type === "unit") return location.parentLocationId != null && set.has(location.parentLocationId);
    return false;
}

/** Deterministic ordering: by display label (locale), then id. */
function sortLocations(locations: CanonicalLocation[]): CanonicalLocation[] {
    return locations.slice().sort((a, b) => {
        const la = canonicalLocationDisplay(a) ?? "";
        const lb = canonicalLocationDisplay(b) ?? "";
        const cmp = la.localeCompare(lb);
        if (cmp !== 0) return cmp;
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}

async function fetchOrgLocationRows(
    supabase: SupabaseClient,
    orgId: string,
    types?: readonly CanonicalLocationType[],
    restrictToSiteIds?: readonly string[]
): Promise<CanonicalLocation[]> {
    // Org boundary is always enforced at the query. `locations` RLS is org/role
    // scoped (site-scope is app-layer by design — RFC open decision §21-4), so
    // when a caller can express its scope as concrete site ids we ALSO push that
    // filter to the DB (id ∈ sites) rather than fetching all org sites and
    // narrowing in memory. Room-inclusive callers still narrow rooms by parent in
    // memory (a within-org refinement), never crossing the org boundary.
    let query = supabase.from("locations").select(CANONICAL_LOCATION_SELECT).eq("org_id", orgId);
    if (types && types.length > 0) {
        query = query.in("location_type", types as string[]);
    }
    if (restrictToSiteIds) {
        query = query.in("id", restrictToSiteIds as string[]);
    }
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return ((data ?? []) as RawLocationRow[]).map(normalizeLocationRow).filter((l) => l.id !== "");
}

export type ResolveLocationsOptions = {
    mode?: CanonicalLocationResolutionMode;
    siteScope?: SiteScopeFilter;
    /** Include inactive locations (default false — active only). */
    includeInactive?: boolean;
};

/**
 * All childcare Locations (sites + rooms) for an org. Excludes `address` records
 * unless `mode: "include_address"`. Honors an optional site-scope allow-list.
 */
export async function resolveLocationsForOrganization(
    supabase: SupabaseClient,
    orgId: string,
    options: ResolveLocationsOptions = {}
): Promise<CanonicalLocation[]> {
    const includeAddress = options.mode === "include_address";
    const types = includeAddress ? undefined : (["site", "unit"] as const);
    const rows = await fetchOrgLocationRows(supabase, orgId, types);
    const filtered = rows.filter((loc) => {
        if (!includeAddress && !isChildcareLocationType(loc.type)) return false;
        if (!options.includeInactive && !loc.isActive) return false;
        if (!isInSiteScope(loc, options.siteScope)) return false;
        return true;
    });
    return sortLocations(filtered);
}

/**
 * Childcare Locations visible to a user, given their resolved site-scope
 * allow-list (from `user_site_access`, resolved by the caller — kept out of this
 * provider per the Phase A plan). Empty allow-list ⇒ no locations.
 */
export async function resolveLocationsForUser(
    supabase: SupabaseClient,
    orgId: string,
    siteScope: SiteScopeFilter,
    options: Omit<ResolveLocationsOptions, "siteScope"> = {}
): Promise<CanonicalLocation[]> {
    return resolveLocationsForOrganization(supabase, orgId, { ...options, siteScope });
}

/**
 * Active site Locations for an org (the `resolveOrgSiteLocationsForAdmin`
 * contract, canonicalized). Honors a site-scope allow-list.
 */
export async function resolveSiteLocations(
    supabase: SupabaseClient,
    orgId: string,
    options: { siteScope?: SiteScopeFilter; includeInactive?: boolean } = {}
): Promise<CanonicalLocation[]> {
    // Push the site allow-list into the query (id ∈ sites) so a scoped operator
    // never fetches other sites into memory; `isInSiteScope` remains as a
    // defense-in-depth check.
    const rows = await fetchOrgLocationRows(supabase, orgId, ["site"], options.siteScope?.siteLocationIds);
    const filtered = rows.filter((loc) => {
        if (loc.type !== "site") return false;
        if (!options.includeInactive && !loc.isActive) return false;
        if (!isInSiteScope(loc, options.siteScope)) return false;
        return true;
    });
    return sortLocations(filtered);
}

export type ResolveLocationByIdOptions = {
    mode?: CanonicalLocationResolutionMode;
};

/**
 * A single Location by id, scoped to the org. Returns null when not found, or
 * when it is an `address` record and the mode is `childcare` (default).
 */
export async function resolveLocationById(
    supabase: SupabaseClient,
    orgId: string,
    id: string,
    options: ResolveLocationByIdOptions = {}
): Promise<CanonicalLocation | null> {
    if (!id) return null;
    const { data, error } = await supabase
        .from("locations")
        .select(CANONICAL_LOCATION_SELECT)
        .eq("org_id", orgId)
        .eq("id", id)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const location = normalizeLocationRow(data as RawLocationRow);
    if (options.mode !== "include_address" && location.type === "address") return null;
    return location;
}

export type LocationHierarchy = {
    site: CanonicalLocation;
    /** `unit` locations whose parent is the site, active first then by label. */
    rooms: CanonicalLocation[];
};

/**
 * A site and its room (`unit`) children in one round trip. Returns null when the
 * site id is not a `site` Location in the org.
 */
export async function resolveLocationHierarchy(
    supabase: SupabaseClient,
    orgId: string,
    siteId: string,
    options: { includeInactive?: boolean } = {}
): Promise<LocationHierarchy | null> {
    if (!siteId) return null;
    const rows = await fetchOrgLocationRows(supabase, orgId, ["site", "unit"]);
    const site = rows.find((l) => l.id === siteId && l.type === "site");
    if (!site) return null;
    const rooms = rows.filter((l) => {
        if (l.type !== "unit" || l.parentLocationId !== siteId) return false;
        if (!options.includeInactive && !l.isActive) return false;
        return true;
    });
    return { site, rooms: sortLocations(rooms) };
}
