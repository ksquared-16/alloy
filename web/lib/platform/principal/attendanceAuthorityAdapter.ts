/**
 * The Developer Platform principal, expressed as Attendance authority.
 *
 * ── ONE AUTHORITY DERIVES FROM THE OTHER ──
 *
 * Before this, two things could authorize an external attendance write: an
 * `attendance_integration_producers` row, and an `app_installations` row. Two
 * independent authorities for one question is the divergence B.4 filed as G-14.
 *
 * The direction is settled here and it is one-way:
 *
 *     ApplicationPrincipal  →  this adapter  →  NonHumanProducerAuthority
 *                                                  ↓
 *                                     assertNonHumanCaptureAllowed
 *                                                  ↓
 *                                        canonical Attendance authority
 *
 * The Developer Platform owns WHO a producer is — application, installation,
 * credential, organization, boundary. Attendance owns WHAT it may author and
 * whether a given fact is allowed. Neither reaches into the other: this adapter
 * translates, and it grants nothing the installation does not already hold.
 *
 * ── THE PRODUCER IDENTITY WAS ALREADY THERE ──
 *
 * `app_installations.producer_key` has existed since B.1, put there so that
 * rotating a credential would never orphan the provenance of facts already
 * authored. It is the same law the kiosk and producer registries both state, and
 * it is why this adapter needs no new column to carry provenance.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { NonHumanProducerAuthority } from "@/lib/childcareOperational/attendance/attendancePermissions";
import type { AttendanceIngestAuthor } from "@/lib/childcareOperational/attendance/integration/attendanceIngestAuthor";
import type { ApplicationPrincipal } from "@/lib/platform/principal/platformPrincipalTypes";
import { internalPermissionsForScopes } from "@/lib/platform/external/scopeCatalog";

/** The collection function's own maximum. Paging is internal; no caller supplies a cursor. */
const BOUNDARY_PAGE_SIZE = 200;
/**
 * 250 pages is 50,000 locations — far beyond any real organization, and finite. If a boundary ever
 * exceeds it, the resolver fails instead of truncating, because a silently partial boundary is the
 * defect this ceiling is guarding against rather than a fallback it may take.
 */
const MAX_BOUNDARY_PAGES = 250;

export type AttendanceAuthorityResolution =
    | { ok: true; authority: NonHumanProducerAuthority }
    | { ok: false; code: "no_sites_in_boundary" | "lookup_failed" };

/**
 * Resolve the SITES an installation may reach.
 *
 * Exported because the external attendance READ needs exactly this set, and a second resolver
 * would be a second answer to "which sites may this installation see". Reading and authoring share
 * one boundary; what differs between them is the permission checked afterwards, not the territory.
 *
 * `NonHumanProducerAuthority` is expressed in site ids, while an installation's
 * boundary may name sites, units, or the whole organization. Rather than walking
 * the tree here — a second hierarchy resolver is exactly what B.3 refused to
 * build — this reuses `list_external_locations`, which already applies the
 * boundary in SQL and returns each row's canonical `site_id`.
 *
 * The consequence worth stating: authority granted through this adapter can
 * never exceed what `GET /api/v1/locations` would return for the same
 * installation, because it is literally the same query.
 */
export async function resolveBoundarySites(
    supabase: SupabaseClient,
    principal: ApplicationPrincipal,
): Promise<{ ok: true; siteIds: string[] } | { ok: false; code: "lookup_failed" }> {
    const boundary = principal.boundary;
    const boundaryIds = boundary.mode === "locations" ? [...boundary.locationIds] : [];

    const siteIds = new Set<string>();
    let cursor: { sortKey: string; id: string } | null = null;

    /*
     * PAGE UNTIL THE BOUNDARY IS EXHAUSTED.
     *
     * This asked for one page of 200 and treated it as the whole answer. No organization has yet
     * exceeded that, so nothing failed — but an organization with 201 locations would have had the
     * 201st silently dropped from its own boundary, and every resource in the platform resolves its
     * territory through here. The failure would have looked like missing data rather than a cap,
     * which is the worst way for a limit to announce itself.
     *
     * The page size stays 200 because that is the function's own maximum; what changed is that the
     * loop continues rather than stopping at the first page. The pagination is INTERNAL: no caller
     * supplies a cursor, so none of this widens authority, and each page applies the same boundary
     * predicate inside the same SQL the first page did.
     */
    for (let page = 0; page < MAX_BOUNDARY_PAGES; page += 1) {
        const { data, error } = await supabase.rpc("list_external_locations", {
            p_org_id: principal.orgId,
            p_boundary_mode: boundary.mode,
            p_boundary: boundaryIds,
            p_limit: BOUNDARY_PAGE_SIZE,
            p_cursor_sort: cursor?.sortKey ?? null,
            p_cursor_id: cursor?.id ?? null,
            p_types: null,
            p_parent_id: null,
            p_location_ids: null,
            p_updated_since: null,
        });

        if (error) return { ok: false, code: "lookup_failed" };

        const rows = (data ?? []) as Array<{ id: string; site_id: string | null; sort_key: string }>;
        for (const row of rows) {
            if (row.site_id) siteIds.add(row.site_id);
        }

        if (rows.length < BOUNDARY_PAGE_SIZE) {
            return { ok: true, siteIds: [...siteIds] };
        }

        const last = rows[rows.length - 1];
        cursor = { sortKey: last.sort_key, id: last.id };
    }

    /*
     * The ceiling exists so a pathological boundary cannot loop forever, and it FAILS rather than
     * returning what it managed to collect. A partial boundary is the precise bug this change
     * exists to remove: it would answer a different question than the one asked, and do it
     * silently. A caller that sees this gets an error it can act on.
     */
    return { ok: false, code: "lookup_failed" };
}

/**
 * Build the attendance authority an installation carries.
 *
 * Fails closed on every path. An empty site set denies everything, which is the
 * documented meaning of an empty `allowedSiteLocationIds` and the correct
 * outcome for an installation whose boundary grants no site.
 */
export async function attendanceAuthorityForPrincipal(
    supabase: SupabaseClient,
    principal: ApplicationPrincipal,
): Promise<AttendanceAuthorityResolution> {
    const sites = await resolveBoundarySites(supabase, principal);
    if (!sites.ok) return { ok: false, code: "lookup_failed" };
    if (sites.siteIds.length === 0) return { ok: false, code: "no_sites_in_boundary" };

    return {
        ok: true,
        authority: {
            // Durable provenance, stable across credential rotation.
            producerKey: principal.producerKey,
            allowedSiteLocationIds: Object.freeze(sites.siteIds),
            // Mapped from PUBLIC scopes through the catalog — never copied from a
            // request, and never an internal key the installation was granted
            // directly. External scopes and internal permissions stay separate
            // vocabularies with one declared mapping between them.
            grantedPermissionKeys: Object.freeze(internalPermissionsForScopes(principal.grantedScopes)),
        },
    };
}

/**
 * The installation, expressed as an ingestion author.
 *
 * This is the last link in the chain the convergence exists to make real:
 *
 *     ApplicationPrincipal
 *       → attendanceAuthorityForPrincipal   (this module: boundary → sites)
 *       → AttendanceIngestAuthor            (here)
 *       → ingestExternalAttendanceEvent     (Attendance owns everything after)
 *
 * No `attendance_integration_producers` row is consulted, created, or implied.
 * The installation IS the authority, and `producer_key` carries provenance to
 * the canonical fact exactly as a legacy producer's would -- which is why a
 * converted producer keeps the history it already wrote.
 */
export async function attendanceAuthorForPrincipal(
    supabase: SupabaseClient,
    principal: ApplicationPrincipal,
): Promise<
    | { ok: true; author: AttendanceIngestAuthor }
    | { ok: false; code: "no_sites_in_boundary" | "lookup_failed" }
> {
    const resolved = await attendanceAuthorityForPrincipal(supabase, principal);
    if (!resolved.ok) return { ok: false, code: resolved.code };

    return {
        ok: true,
        author: {
            kind: "installation",
            installationId: principal.installationId,
            orgId: principal.orgId,
            producerKey: principal.producerKey,
            // The application is what an operator recognises in an audit row.
            label: principal.applicationSlug,
            authority: resolved.authority,
        },
    };
}
