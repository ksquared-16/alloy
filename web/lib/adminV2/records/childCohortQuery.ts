import "server-only";

/**
 * SERVER-OWNED CHILD COHORT QUERY.
 *
 * ── THE INVARIANT THIS FILE EXISTS FOR ──
 *
 *     org/access scope → site scope → cohort predicate → search → ordering → pagination
 *
 * and never `page first, then filter`. Records V1 shipped the wrong order: it loaded the first 500
 * children and applied the cohort predicate in the browser, so an Enrolled child alphabetically
 * beyond the page silently vanished from the Enrolled cohort. That reads as "nobody is enrolled"
 * when the truth is "we only looked at 500 of them", and it gets *worse* as a tenant grows — the
 * defect hides on small tenants and appears on exactly the ones that need it.
 *
 * Pagination may change which page you SEE. It may never change who QUALIFIES.
 *
 * ── WHY PARTICIPATION COHORTS RESOLVE AN ID SET FIRST ──
 *
 * `process_instances.subject_id` is polymorphic, so there is no declared foreign key from
 * `customer_members` and no PostgREST embed to inner-join through. The qualifying members are
 * therefore resolved from participation FIRST and the population is then restricted to them —
 * which is the filter-before-pagination order expressed in two round trips instead of one join.
 *
 * The id set is bounded by the COHORT, not by the tenant: a centre with 5,000 children and 200
 * enrolled resolves 200 ids. `.in(…)` is chunked because PostgREST serialises it into the request
 * URI, where an over-long filter reads as an empty result rather than as an error.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { chunkIds } from "@/lib/admin/opportunity/opportunityLeadDeletionDb";

export const CHILD_COHORT_KEYS = ["all", "enrolled", "in_process", "inactive"] as const;
export type ChildCohortKey = (typeof CHILD_COHORT_KEYS)[number];

export function isChildCohortKey(v: string): v is ChildCohortKey {
    return (CHILD_COHORT_KEYS as readonly string[]).includes(v);
}

/**
 * State meaning lives in ONE place, shared with the row projection, so a cohort tab and the rows
 * inside it cannot disagree about the same child. @see childEnrollmentState.ts
 */
import {
    deriveChildRecordState,
    isEnrolledCohortState,
} from "@/lib/adminV2/records/childEnrollmentState";

export type ChildCohortQueryInput = {
    supabase: SupabaseClient;
    orgId: string;
    cohort: ChildCohortKey;
    /** Household allow-list from the access envelope. Null = unrestricted. */
    allowedCustomerIds: string[] | null;
    /** Selected site, or null for All sites. Composes WITH the cohort, never instead of it. */
    siteLocationId: string | null;
    /** Local search. Applied server-side so a paged result is still a whole-cohort search. */
    search: string | null;
    limit: number;
    offset: number;
};

export type ChildCohortPage = {
    /** `customer_members.id` values for this page, in the cohort's deterministic order. */
    memberIds: string[];
    /** Total matching the WHOLE cohort — never the page. */
    total: number;
    hasMore: boolean;
    nextOffset: number | null;
};

/**
 * Member ids whose ENROLLMENT STATE puts them in this cohort. Null = state is not a filter.
 *
 * Reads BOTH sources of enrollment truth. A directly enrolled child has a durable care
 * relationship and NO process instance, so a query over `process_instances` alone would have left
 * them out of Enrolled and listed them among children with nothing running at all.
 */
async function participationMemberIds(
    supabase: SupabaseClient,
    orgId: string,
    cohort: ChildCohortKey,
): Promise<string[] | null> {
    if (cohort !== "enrolled" && cohort !== "in_process") return null;

    const [processRes, agreementRes] = await Promise.all([
        supabase
            .from("process_instances")
            .select("subject_id, state")
            .eq("org_id", orgId)
            .eq("subject_type", "child"),
        supabase
            .from("child_enrollment_agreements")
            .select("customer_member_id, status")
            .eq("org_id", orgId),
    ]);
    if (processRes.error) throw new Error(processRes.error.message);
    if (agreementRes.error) throw new Error(agreementRes.error.message);

    const processStates = new Map<string, string[]>();
    for (const row of (processRes.data ?? []) as { subject_id: string | null; state: string | null }[]) {
        const id = (row.subject_id ?? "").trim();
        if (!id) continue;
        processStates.set(id, [...(processStates.get(id) ?? []), row.state ?? ""]);
    }

    const agreementStatuses = new Map<string, string[]>();
    for (const row of (agreementRes.data ?? []) as {
        customer_member_id: string | null;
        status: string | null;
    }[]) {
        const id = (row.customer_member_id ?? "").trim();
        if (!id) continue;
        agreementStatuses.set(id, [...(agreementStatuses.get(id) ?? []), row.status ?? ""]);
    }

    const ids = new Set<string>();
    for (const id of new Set([...processStates.keys(), ...agreementStatuses.keys()])) {
        const state = deriveChildRecordState({
            agreementStatuses: agreementStatuses.get(id) ?? [],
            processStates: processStates.get(id) ?? [],
        });
        const qualifies = cohort === "enrolled" ? isEnrolledCohortState(state) : state === "in_process";
        if (qualifies) ids.add(id);
    }
    return [...ids];
}

/** Member ids with an active committed placement at a site. Null = site is not a filter. */
async function siteMemberIds(
    supabase: SupabaseClient,
    orgId: string,
    siteLocationId: string | null,
): Promise<string[] | null> {
    if (!siteLocationId) return null;
    const { data, error } = await supabase
        .from("child_placements")
        .select("customer_member_id")
        .eq("org_id", orgId)
        .eq("status", "active")
        .eq("site_location_id", siteLocationId);
    if (error) throw new Error(error.message);
    return [
        ...new Set(
            ((data ?? []) as { customer_member_id: string | null }[])
                .map((r) => (r.customer_member_id ?? "").trim())
                .filter(Boolean),
        ),
    ];
}

/** Intersect id restrictions. `null` means "unrestricted by this dimension". */
function intersect(a: string[] | null, b: string[] | null): string[] | null {
    if (a === null) return b;
    if (b === null) return a;
    const bSet = new Set(b);
    return a.filter((id) => bSet.has(id));
}

/**
 * Resolve one page of a cohort.
 *
 * Every dimension is applied BEFORE `.range()`, and the count is `exact` over the filtered query, so
 * the total describes the cohort rather than the page.
 */
export async function queryChildCohortPage(input: ChildCohortQueryInput): Promise<ChildCohortPage> {
    const { supabase, orgId, cohort, allowedCustomerIds, siteLocationId, search, limit, offset } = input;

    const [participationIds, placementIds] = await Promise.all([
        participationMemberIds(supabase, orgId, cohort),
        siteMemberIds(supabase, orgId, siteLocationId),
    ]);

    const restrictedIds = intersect(participationIds, placementIds);
    // A cohort/site combination with no qualifying member is EMPTY — an honest answer. Running the
    // population query with an empty `.in()` would return everything on some drivers, which is the
    // failure this early return exists to prevent.
    if (restrictedIds !== null && restrictedIds.length === 0) {
        return { memberIds: [], total: 0, hasMore: false, nextOffset: null };
    }

    // Every dimension below is applied BEFORE `.range()`. The `select` differs between the two
    // paths, so the filters are stated twice rather than hidden behind a generic that needed casts
    // to compile — two readable statements beat one clever one when the ORDER is the whole point.

    // No id restriction: the cohort is one query — filter, order, then range.
    if (restrictedIds === null) {
        let q = supabase
            .from("customer_members")
            .select("id", { count: "exact" })
            .eq("org_id", orgId)
            .eq("relationship", "child");
        if (cohort === "inactive") q = q.eq("is_active", false);
        if (allowedCustomerIds !== null) q = q.in("customer_id", allowedCustomerIds);
        if (search) q = q.ilike("display_name", `%${search}%`);

        const { data, error, count } = await q
            // Deterministic order: name, then id as the tiebreaker. Without the tiebreaker two
            // children sharing a name can swap between pages — one is served twice and the other
            // never at all, which is a silent loss dressed as a full list.
            .order("display_name")
            .order("id")
            .range(offset, offset + limit - 1);
        if (error) throw new Error(error.message);

        const total = count ?? 0;
        const memberIds = ((data ?? []) as { id: string }[]).map((r) => r.id);
        const consumed = offset + memberIds.length;
        return {
            memberIds,
            total,
            hasMore: consumed < total,
            nextOffset: consumed < total ? consumed : null,
        };
    }

    // Restricted: read the qualifying rows in URI-safe chunks, order them, THEN slice the page.
    // Bounded by the cohort (the enrolled children), never by the tenant.
    const qualifying: { id: string; display_name: string | null }[] = [];
    for (const chunk of chunkIds(restrictedIds)) {
        let q = supabase
            .from("customer_members")
            .select("id, display_name")
            .eq("org_id", orgId)
            .eq("relationship", "child")
            .in("id", chunk);
        if (cohort === "inactive") q = q.eq("is_active", false);
        if (allowedCustomerIds !== null) q = q.in("customer_id", allowedCustomerIds);
        if (search) q = q.ilike("display_name", `%${search}%`);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        qualifying.push(...((data ?? []) as { id: string; display_name: string | null }[]));
    }

    qualifying.sort(
        (a, b) =>
            (a.display_name ?? "").localeCompare(b.display_name ?? "") || a.id.localeCompare(b.id),
    );

    const page = qualifying.slice(offset, offset + limit);
    const total = qualifying.length;
    const consumed = offset + page.length;
    return {
        memberIds: page.map((r) => r.id),
        total,
        hasMore: consumed < total,
        nextOffset: consumed < total ? consumed : null,
    };
}
