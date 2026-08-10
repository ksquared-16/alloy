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
 * Constrain a Supabase query by an allow-list resolved above.
 *
 * `null` leaves the query untouched (unrestricted). An EMPTY allow-list must
 * still constrain — returning the query unchanged there would silently widen
 * a restricted operator to the whole org, which is exactly the leak this
 * module exists to prevent. `filterImpossible` reports that case so callers
 * skip the round trip entirely.
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
