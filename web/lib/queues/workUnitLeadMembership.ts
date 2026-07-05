/**
 * Canonical Work-Unit lead membership — the ONE definition of "which leads belong to a work unit".
 *
 * Queue rows, Work-View counts, Workspace Process counts, and the Work-Unit "Lead Count" metric must
 * all agree when they refer to the same work. They diverged because each invented its own predicate
 * (the metric counted department-wide + `work_unit_id IS NULL` orphans over a time window; the queue
 * scoped to a single work unit). This module is the shared source of truth: a row is a member iff it
 * is org- and work-unit-scoped (NOT NULL, not a sibling WU) AND carries a lead status.
 *
 * @see docs/platform/experience/presentation-runtime-v2.md (projection ownership)
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { NEW_LEAD_STATUS_KEY } from "@/lib/admin/actions/createLeadActionConstants";
import { expandEnrollmentNewLeadsQueueStatusKeys } from "@/lib/lifecycle/enrollmentLeadStageStatusAliases";

/**
 * The status keys a New-Leads work-unit membership includes: the platform new-lead key plus its
 * legacy aliases (open / new) — the SAME set the New Leads queue lane admits, so a lead the queue
 * shows is a lead the metric counts.
 */
export const WORK_UNIT_LEAD_MEMBERSHIP_STATUS_KEYS: readonly string[] = Object.freeze(
    expandEnrollmentNewLeadsQueueStatusKeys([NEW_LEAD_STATUS_KEY]).map((k) => k.toLowerCase()),
);

export type WorkUnitLeadMembership = {
    orgId: string;
    /** The SPECIFIC work unit. NULL / sibling work units are never members. */
    workUnitId: string;
    /** Status keys admitted (defaults to the canonical New-Leads set). */
    statusKeys?: readonly string[];
};

function normalizedKeys(m: WorkUnitLeadMembership): readonly string[] {
    const keys = m.statusKeys ?? WORK_UNIT_LEAD_MEMBERSHIP_STATUS_KEYS;
    return keys.map((k) => k.trim().toLowerCase());
}

/**
 * THE canonical membership predicate (pure). A row belongs to the work unit's lead membership iff:
 * same org, `work_unit_id` === this work unit (so NULL orphans and sibling WUs are excluded), and a
 * lead status. Single source of truth — the queue projection and the metric both agree with this.
 */
export function workUnitLeadRowQualifies(
    row: { org_id?: unknown; work_unit_id?: unknown; status_key?: unknown },
    m: WorkUnitLeadMembership,
): boolean {
    const orgId = typeof row.org_id === "string" ? row.org_id : null;
    const wu =
        typeof row.work_unit_id === "string" && row.work_unit_id.trim() ? row.work_unit_id : null;
    const status = typeof row.status_key === "string" ? row.status_key.trim().toLowerCase() : null;
    if (orgId !== m.orgId) return false;
    if (wu === null || wu !== m.workUnitId) return false; // NULL orphans + sibling WUs excluded
    if (status === null || !normalizedKeys(m).includes(status)) return false;
    return true;
}

/** Loose shape for a Supabase filter builder (eq/in chain) — avoids coupling to Postgrest generics. */
type LeadMembershipFilterable = {
    eq: (column: string, value: unknown) => LeadMembershipFilterable;
    in: (column: string, values: readonly unknown[]) => LeadMembershipFilterable;
};

/**
 * Apply the canonical membership to a Supabase `opportunities` query. `work_unit_id IS NULL` is
 * excluded by `.eq` (NULL never equals a value). Used by BOTH the queue projection and the metric.
 */
export function applyWorkUnitLeadMembershipFilter<Q extends LeadMembershipFilterable>(
    query: Q,
    m: WorkUnitLeadMembership,
): Q {
    return query
        .eq("org_id", m.orgId)
        .eq("work_unit_id", m.workUnitId)
        .in("status_key", normalizedKeys(m)) as Q;
}

/**
 * Scope an `opportunities` query to a SINGLE work unit (`work_unit_id IS NULL` orphans + sibling work
 * units excluded by `.eq`). The work-unit dimension of the canonical membership — the queue
 * projection uses this so its scoping and the metric's cannot drift.
 */
export function applyWorkUnitScopeToOpportunityQuery<Q extends { eq: (column: string, value: unknown) => Q }>(
    query: Q,
    workUnitId: string,
): Q {
    return query.eq("work_unit_id", workUnitId);
}

/**
 * Count the canonical membership for a work unit — the number the queue rows, work-view count, and
 * Work-Unit "Lead Count" metric must all report. No department scope, no NULL, no time window.
 */
export async function countWorkUnitLeadMembership(
    supabase: SupabaseClient,
    m: WorkUnitLeadMembership,
): Promise<number> {
    const base = supabase.from("opportunities").select("id", { count: "exact", head: true });
    const { count, error } = (await applyWorkUnitLeadMembershipFilter(
        base as unknown as LeadMembershipFilterable,
        m,
    )) as unknown as { count: number | null; error: { message: string } | null };
    if (error) throw new Error(error.message);
    return count ?? 0;
}
