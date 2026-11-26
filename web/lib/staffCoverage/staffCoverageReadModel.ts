/**
 * Place-first Coverage read — WHO IS PLANNED HERE?
 *
 * Coverage's operational question is asked from the place, not from the person: a
 * lead standing in a room on a Tuesday wants the people, not one person's week.
 * This module answers that in one batch, shaped for a day/place surface.
 *
 * ── THIS IS A READ MODEL, NOT A SECOND AUTHORITY ──
 *
 * It resolves effectiveness through `effectiveCoverageForSite`, the same database
 * function the employment-first resolver's sibling uses, and both share one
 * `lifecycle_state = 'active'` predicate down in SQL. Nothing here re-reads
 * `supersedes_coverage_id`, re-derives lineage, or decides what "current" means.
 * That restraint is the point — two query directions re-interpreting lineage
 * independently is precisely how a schedule starts disagreeing with itself, and
 * the parity test exists to catch the day someone adds a filter here.
 *
 * Grouping, ordering and identity are presentation. They are safe to own.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import { formatPersonDisplayName } from "@/lib/forms/intake/intakePersonMatch";
import { coverageReadableSites } from "@/lib/staffCoverage/staffCoverageAuthorization";
import {
    effectiveCoverageForSite,
    type CoverageAllocation,
} from "@/lib/staffCoverage/staffCoverageService";

export type CoveragePersonRef = {
    employmentId: string;
    personId: string | null;
    displayName: string | null;
};

export type CoverageSlot = {
    allocation: CoverageAllocation;
    person: CoveragePersonRef;
};

/** One place on one day: the unit a coverage surface actually renders. */
export type CoveragePlaceDay = {
    serviceDate: string;
    siteLocationId: string;
    /** Null groups the people planned at the site without a room. */
    roomLocationId: string | null;
    slots: CoverageSlot[];
};

export type CoveragePlaceDayRead = {
    dateFrom: string;
    dateTo: string;
    siteLocationIds: string[];
    groups: CoveragePlaceDay[];
    /** Flat effective set, same rows, for parity checks and arithmetic. */
    allocations: CoverageAllocation[];
    /**
     * True when site scope excluded every requested site. An empty read is then a
     * scope answer, not a claim that nobody is planned there.
     */
    scopeExcluded: boolean;
};

function groupKey(a: CoverageAllocation): string {
    return `${a.serviceDate}|${a.siteLocationId}|${a.roomLocationId ?? ""}`;
}

/**
 * Employment → person identity for the rows we actually returned.
 *
 * Two small `in()` batches rather than a join, because the RPC returns the table
 * rowtype and PostgREST cannot embed through it. Identity is best-effort: a row
 * whose person is unreadable still appears, with a null name, because dropping it
 * would silently understate who is planned.
 */
async function resolvePeople(
    supabase: SupabaseClient,
    orgId: string,
    employmentIds: string[]
): Promise<Map<string, CoveragePersonRef>> {
    const out = new Map<string, CoveragePersonRef>();
    if (employmentIds.length === 0) return out;

    const { data: employments } = await supabase
        .from("employments")
        .select("id, person_id")
        .eq("org_id", orgId)
        .in("id", employmentIds);

    const rows = (employments ?? []) as { id: string; person_id: string | null }[];
    const personIds = [...new Set(rows.map((r) => r.person_id).filter((p): p is string => !!p))];

    const names = new Map<string, string | null>();
    if (personIds.length > 0) {
        const { data: persons } = await supabase
            .from("persons")
            .select("id, first_name, last_name")
            .eq("org_id", orgId)
            .in("id", personIds);
        for (const p of (persons ?? []) as { id: string; first_name: string | null; last_name: string | null }[]) {
            names.set(p.id, formatPersonDisplayName(p.first_name, p.last_name));
        }
    }

    for (const id of employmentIds) {
        const e = rows.find((r) => r.id === id);
        out.set(id, {
            employmentId: id,
            personId: e?.person_id ?? null,
            displayName: e?.person_id ? (names.get(e.person_id) ?? null) : null,
        });
    }
    return out;
}

export type ReadCoverageByPlaceInput = {
    orgId: string;
    /** Omit to read every site the actor holds. */
    siteLocationId?: string | null;
    roomLocationId?: string | null;
    dateFrom: string;
    dateTo: string;
    accessScope?: AdminAccessScopeDimensions | null;
};

export async function readCoverageByPlace(
    supabase: SupabaseClient,
    input: ReadCoverageByPlaceInput
): Promise<CoveragePlaceDayRead> {
    const sites = coverageReadableSites(input.accessScope, input.siteLocationId);

    // `null` means org-wide, which the place-first RPC cannot express — it is
    // deliberately site-qualified. Resolve the actor's sites explicitly instead of
    // inventing an org-wide variant that would bypass the scoped path.
    let siteIds: string[];
    if (sites === null) {
        const { data } = await supabase
            .from("locations")
            .select("id")
            .eq("org_id", input.orgId)
            .eq("location_type", "site");
        siteIds = ((data ?? []) as { id: string }[]).map((r) => r.id);
    } else {
        siteIds = sites;
    }

    const scopeExcluded = sites !== null && sites.length === 0;

    const allocations: CoverageAllocation[] = [];
    for (const siteId of siteIds) {
        const rows = await effectiveCoverageForSite(supabase, {
            orgId: input.orgId,
            siteLocationId: siteId,
            dateFrom: input.dateFrom,
            dateTo: input.dateTo,
            roomLocationId: input.roomLocationId ?? null,
        });
        allocations.push(...rows);
    }

    allocations.sort(
        (a, b) =>
            a.serviceDate.localeCompare(b.serviceDate) ||
            a.siteLocationId.localeCompare(b.siteLocationId) ||
            (a.roomLocationId ?? "").localeCompare(b.roomLocationId ?? "") ||
            a.startTime.localeCompare(b.startTime) ||
            a.id.localeCompare(b.id)
    );

    const people = await resolvePeople(
        supabase,
        input.orgId,
        [...new Set(allocations.map((a) => a.employmentId))]
    );

    const groups: CoveragePlaceDay[] = [];
    const byKey = new Map<string, CoveragePlaceDay>();
    for (const a of allocations) {
        const key = groupKey(a);
        let g = byKey.get(key);
        if (!g) {
            g = {
                serviceDate: a.serviceDate,
                siteLocationId: a.siteLocationId,
                roomLocationId: a.roomLocationId,
                slots: [],
            };
            byKey.set(key, g);
            groups.push(g);
        }
        g.slots.push({
            allocation: a,
            person: people.get(a.employmentId) ?? {
                employmentId: a.employmentId,
                personId: null,
                displayName: null,
            },
        });
    }

    return {
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        siteLocationIds: siteIds,
        groups,
        allocations,
        scopeExcluded,
    };
}
