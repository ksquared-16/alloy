/**
 * Alloy Search Platform V2 — the access boundary.
 *
 * Search V1 retrieved candidates wide and filtered some subject kinds only AFTER
 * assembling the display row. V2 resolves the operator's effective access ONCE,
 * up front, and every retrieval adapter constrains its query with it BEFORE any
 * candidate row is read.
 *
 * Required order (mission doctrine):
 *
 *     query → org scope → effective access → candidate retrieval → enrichment → ranking
 *
 * This module owns no permission semantics of its own. It composes the canonical
 * Access/Roles helpers in `@/lib/admin/accessScope`. There is deliberately no
 * search-specific permission model — a second model would be a second place to
 * get authorization wrong.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
    accessScopeRestrictsData,
    fetchScopedCustomerIdsForRestrictedAdmin,
    fetchScopedPersonIdsForRestrictedAdmin,
    type AdminAccessScopeDimensions,
} from "@/lib/admin/accessScope";

/**
 * The operator's effective reach, resolved once per search.
 *
 * `null` on an allow-list means UNRESTRICTED for that dimension — it does not
 * mean "empty". An empty array means "restricted, and nothing is reachable",
 * which is why `impossible` exists as an explicit early-exit rather than being
 * inferred at each call site.
 */
export type SearchAccessEnvelope = {
    orgId: string;
    restricted: boolean;
    /** Allowed `persons.id` values, or null when unrestricted. */
    allowedPersonIds: string[] | null;
    /** Allowed `customers.id` values, or null when unrestricted. */
    allowedCustomerIds: string[] | null;
    /** Allowed site `locations.id` values, or null when unrestricted. */
    allowedSiteLocationIds: string[] | null;
    /** True when the operator can reach no subject at all — retrieval must not run. */
    impossible: boolean;
    dimensions: AdminAccessScopeDimensions;
};

export async function resolveSearchAccessEnvelope(
    supabase: SupabaseClient,
    orgId: string,
    dimensions: AdminAccessScopeDimensions
): Promise<SearchAccessEnvelope> {
    const restricted = accessScopeRestrictsData(dimensions);

    if (!restricted) {
        return {
            orgId,
            restricted: false,
            allowedPersonIds: null,
            allowedCustomerIds: null,
            allowedSiteLocationIds: null,
            impossible: false,
            dimensions,
        };
    }

    const [allowedPersonIds, allowedCustomerIds] = await Promise.all([
        fetchScopedPersonIdsForRestrictedAdmin(supabase, orgId, dimensions),
        fetchScopedCustomerIdsForRestrictedAdmin(supabase, orgId, dimensions),
    ]);

    const allowedSiteLocationIds =
        dimensions.siteScope === "restricted"
            ? [...new Set((dimensions.allowedSiteLocationIds ?? []).map(String).filter(Boolean))]
            : null;

    // A restricted operator with no reachable persons AND no reachable customers
    // can recognise no human subject. Locations may still be reachable, so this
    // is only "impossible" when every dimension is empty.
    const noPersons = Array.isArray(allowedPersonIds) && allowedPersonIds.length === 0;
    const noCustomers = Array.isArray(allowedCustomerIds) && allowedCustomerIds.length === 0;
    const noSites = Array.isArray(allowedSiteLocationIds) && allowedSiteLocationIds.length === 0;

    return {
        orgId,
        restricted: true,
        allowedPersonIds,
        allowedCustomerIds,
        allowedSiteLocationIds,
        impossible: noPersons && noCustomers && noSites,
        dimensions,
    };
}

/**
 * Maximum allow-list ids per query.
 *
 * PostgREST puts `.in(...)` in the QUERY STRING, so a restricted operator with a
 * large reach produces a URI the server rejects with 414. Browser certification
 * hit exactly that: on a tenant with ~1200 customers and ~1800 persons the
 * restricted operator's search returned "URI too long" and rendered nothing —
 * which also made the permission-absence assertion pass VACUOUSLY, because the
 * inaccessible subject was missing only because everything was missing.
 *
 * Unit tests could not have caught this: they use a handful of ids. The bound is
 * a URI-length property, not a logic property.
 */
export const SEARCH_ALLOW_LIST_CHUNK_SIZE = 120;

/**
 * Split an allow-list into query-sized chunks.
 *
 * `null` (unrestricted) yields a single `null` chunk, so callers run exactly one
 * unconstrained query. An EMPTY allow-list yields one empty chunk, which
 * `applySearchAllowList` turns into a sentinel that cannot match — returning an
 * unconstrained query there would silently widen a restricted operator to the
 * whole org.
 */
export function chunkSearchAllowList(allowed: string[] | null): Array<string[] | null> {
    if (allowed === null) return [null];
    if (allowed.length === 0) return [[]];
    const chunks: string[][] = [];
    for (let i = 0; i < allowed.length; i += SEARCH_ALLOW_LIST_CHUNK_SIZE) {
        chunks.push(allowed.slice(i, i + SEARCH_ALLOW_LIST_CHUNK_SIZE));
    }
    return chunks;
}

/**
 * Constrain a Supabase query by ONE allow-list chunk.
 *
 * `null` leaves the query untouched (unrestricted). An EMPTY chunk still
 * constrains, to a sentinel that matches nothing.
 */
export function applySearchAllowList<T>(query: T, column: string, allowed: string[] | null): T {
    if (allowed === null) return query;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (query as any).in(column, allowed.length ? allowed : ["00000000-0000-0000-0000-000000000000"]) as T;
}

/** True when an allow-list is present and empty — retrieval for that kind cannot match. */
export function allowListIsImpossible(allowed: string[] | null): boolean {
    return Array.isArray(allowed) && allowed.length === 0;
}

/**
 * Post-retrieval site check for rows whose location is only known after context
 * resolution. Fails CLOSED: an unknown location under a restricted site scope is
 * not visible.
 *
 * This is a backstop, not the primary boundary — primary enforcement is the
 * allow-list applied at query time.
 */
export function searchLocationAllowed(
    envelope: SearchAccessEnvelope,
    locationId: string | null | undefined
): boolean {
    if (envelope.allowedSiteLocationIds === null) return true;
    const loc = locationId != null ? String(locationId).trim() : "";
    if (!loc) return false;
    return envelope.allowedSiteLocationIds.includes(loc);
}
