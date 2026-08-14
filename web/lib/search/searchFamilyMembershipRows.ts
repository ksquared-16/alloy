/**
 * MATERIALIZED FAMILY ROWS for membership evaluation.
 *
 * A family-grain lens evaluates predicates the queue ATTACHES, not columns the table stores. Tours is
 * the live proof: `has_active_tour = true AND tour_date = next:7:days` reads two facts that exist
 * nowhere on `opportunities`. Handing a raw row to the evaluator would quietly answer "not a member"
 * for a family that plainly is one.
 *
 * So rows are materialized through the SAME batch attachers the queue and the provisioning projection
 * use — never a Search-local re-derivation:
 *
 *   `attachEffectiveEnrollmentStagesToOpportunityRows`  Effective Process Position
 *   `attachActiveTourFactsToOpportunityRows`            `has_active_tour` + the SoT wall date
 *
 * ── COST ──
 *
 * Three bulk reads for the whole result page, never one per (subject × view). They are paid ONLY when
 * a family-grain subject is actually present: a child's membership needs nothing but its own stage, so
 * the common child-only query adds zero round trips.
 *
 * ── THE BOUNDARY, STATED ──
 *
 * This materializes the process-position and tour facts. A lens predicating on something outside that
 * set (a tenant-defined field, say) will not evaluate `fullySupported`, and `resolveOperationalMemberships`
 * therefore declines to offer it. That is deliberate and one-directional: the failure mode is a MISSING
 * destination, never a fabricated one. Widening it means adding the attacher here, not loosening the
 * guard downstream.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { attachEffectiveEnrollmentStagesToOpportunityRows } from "@/lib/process/definitions/enrollment/attachEffectiveEnrollmentStagesToOpportunityRows";
import { attachActiveTourFactsToOpportunityRows } from "@/lib/tours/queue/attachActiveTourFactsToOpportunityRows";

/** Columns the canonical predicates read directly off the context row. */
const OPPORTUNITY_MEMBERSHIP_SELECT =
    "id, stage_key, status_key, location_id, work_unit_id, updated_at, created_at";

/**
 * Load and materialize the opportunity rows for the given cases.
 *
 * Fail-open on read error, matching the attachers' own posture: an empty map means "no family
 * membership could be proven", and the caller offers nothing rather than guessing.
 */
export async function loadFamilyMembershipRows(params: {
    supabase: SupabaseClient;
    orgId: string;
    opportunityIds: readonly string[];
    allowedLocationIds?: readonly string[] | null;
}): Promise<Map<string, Record<string, unknown>>> {
    const ids = [...new Set(params.opportunityIds.map((id) => id.trim()).filter(Boolean))];
    const out = new Map<string, Record<string, unknown>>();
    if (!ids.length) return out;

    try {
        const { data, error } = await params.supabase
            .from("opportunities")
            .select(OPPORTUNITY_MEMBERSHIP_SELECT)
            .eq("org_id", params.orgId)
            .in("id", ids);
        if (error || !data?.length) return out;

        let rows = data as Array<Record<string, unknown>>;
        rows = await attachEffectiveEnrollmentStagesToOpportunityRows({
            supabase: params.supabase,
            orgId: params.orgId,
            rows,
            allowedLocationIds: params.allowedLocationIds ?? null,
            logLabel: "search-membership-epp",
        });
        rows = await attachActiveTourFactsToOpportunityRows({
            supabase: params.supabase,
            orgId: params.orgId,
            rows,
            logLabel: "search-membership-tour-facts",
        });

        for (const row of rows) {
            const id = typeof row.id === "string" ? row.id.trim() : "";
            if (id) out.set(id, row);
        }
        return out;
    } catch {
        return out;
    }
}
