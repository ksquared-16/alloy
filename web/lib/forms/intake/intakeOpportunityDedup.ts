/**
 * Opportunity deduplication for public form intake (Runtime Test 1A).
 * Pure decision helpers + Supabase candidate lookup.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";
import { isClosedStatusKeyForEntity } from "@/lib/lifecycle/resolveOutcomeStatusOptions";

export type IntakeOpportunityMatchDecision =
    | { kind: "no_match" }
    | { kind: "matched"; opportunityId: string }
    | { kind: "ambiguous"; candidateIds: string[] };

export function normalizeIntakeNamePart(value: string | null | undefined): string {
    if (typeof value !== "string") return "";
    return value.trim().toLowerCase();
}

/** True when member name satisfies provided child first/last filters (partial ok). */
export function childNameMatchesMember(
    member: { first_name?: string | null; last_name?: string | null },
    childFirst: string | null | undefined,
    childLast: string | null | undefined
): boolean {
    const cf = normalizeIntakeNamePart(childFirst);
    const cl = normalizeIntakeNamePart(childLast);
    if (!cf && !cl) return true;

    const mf = normalizeIntakeNamePart(member.first_name);
    const ml = normalizeIntakeNamePart(member.last_name);
    if (cf && mf !== cf) return false;
    if (cl && ml !== cl) return false;
    return true;
}

export function decideIntakeOpportunityMatch(candidateIds: string[]): IntakeOpportunityMatchDecision {
    const unique = [...new Set(candidateIds.filter(Boolean))];
    if (unique.length === 0) return { kind: "no_match" };
    if (unique.length === 1) return { kind: "matched", opportunityId: unique[0]! };
    return { kind: "ambiguous", candidateIds: unique };
}

export type FindIntakeOpportunityParams = {
    orgId: string;
    personId: string;
    /**
     * The household identity review already resolved. When known, the family case is looked up on
     * the HOUSEHOLD — the family-grain case container — rather than re-deriving it from the parent.
     */
    customerId?: string | null;
    locationId?: string | null;
    childFirst?: string | null;
    childLast?: string | null;
};

async function filterOpportunityIdsByChild(
    supabase: SupabaseClient,
    orgId: string,
    opportunityIds: string[],
    childFirst: string | null | undefined,
    childLast: string | null | undefined
): Promise<string[]> {
    const cf = normalizeIntakeNamePart(childFirst);
    const cl = normalizeIntakeNamePart(childLast);
    if (!cf && !cl) return opportunityIds;
    if (opportunityIds.length === 0) return [];

    const { data: ocmRows, error: ocmErr } = await supabase
        .from("opportunity_customer_members")
        .select("opportunity_id, customer_member_id")
        .eq("org_id", orgId)
        .in("opportunity_id", opportunityIds);

    if (ocmErr) throw new Error(`opportunity_customer_members lookup failed: ${ocmErr.message}`);
    if (!ocmRows?.length) return [];

    const memberIds = [...new Set(ocmRows.map((r) => (r as { customer_member_id: string }).customer_member_id))];
    const { data: members, error: memErr } = await supabase
        .from("customer_members")
        .select("id, first_name, last_name")
        .eq("org_id", orgId)
        .in("id", memberIds);

    if (memErr) throw new Error(`customer_members lookup failed: ${memErr.message}`);

    const matchingMemberIds = new Set(
        (members ?? [])
            .filter((m) =>
                childNameMatchesMember(m as { first_name?: string | null; last_name?: string | null }, childFirst, childLast)
            )
            .map((m) => (m as { id: string }).id)
    );

    const matchedOppIds = new Set(
        ocmRows
            .filter((r) => matchingMemberIds.has((r as { customer_member_id: string }).customer_member_id))
            .map((r) => (r as { opportunity_id: string }).opportunity_id)
    );

    return opportunityIds.filter((id) => matchedOppIds.has(id));
}

/**
 * THE FAMILY'S OPEN ENROLLMENT CASE, if it already has one — the one lookup every intake door
 * (BOS → Create Lead, an approved public form in Processing) resolves the lead subject through.
 *
 * A family-grain case holds every child of the household; adding a sibling attaches the child to
 * it, it does not open a second case. Scope: the resolved household (else the matched parent) at
 * the intake's location when one is known.
 *
 * OPEN means "not a closed status" by the configured status catalogue (`isClosedStatusKeyForEntity`,
 * the canonical closed check; durable family truth is open | closed). This used to be the literal
 * `status_key = 'open'`, while both doors commit leads with the entry status (`new`) — so an open
 * lead was never found, and a matched family with a second child got a second lead.
 *
 * A CLOSED prior case is never reused or reopened: a new intake after the family's case closed
 * starts a new case.
 */
export async function findExistingIntakeOpportunity(
    supabase: SupabaseClient,
    params: FindIntakeOpportunityParams
): Promise<IntakeOpportunityMatchDecision> {
    let query = supabase
        .from("opportunities")
        .select("id, status_key")
        .eq("org_id", params.orgId);
    const customerId = params.customerId?.trim();
    query = customerId ? query.eq("customer_id", customerId) : query.eq("primary_person_id", params.personId);

    if (params.locationId) {
        query = query.eq("location_id", params.locationId);
    }

    const { data, error } = await query;
    if (error) throw new Error(`opportunities dedup lookup failed: ${error.message}`);

    const rows = (data ?? []) as Array<{ id: string; status_key?: string | null }>;
    let configuredStatuses: Awaited<ReturnType<typeof fetchEffectiveStatusDefinitions>> = [];
    if (rows.length > 0) {
        try {
            configuredStatuses = await fetchEffectiveStatusDefinitions(supabase, params.orgId, "opportunities", { activeOnly: true });
        } catch {
            // Without the catalogue the canonical check still knows the doctrine key (`closed`).
            configuredStatuses = [];
        }
    }
    const catalogue = configuredStatuses.map((row) => ({
        status_key: row.status_key,
        status_label: row.status_label ?? row.status_key,
        entity_type: "opportunities",
        is_active: row.is_active,
        metadata: row.metadata,
    }));
    let ids = rows
        .filter((row) => !isClosedStatusKeyForEntity({ statusKey: row.status_key ?? "", entityType: "opportunities", configuredStatuses: catalogue }))
        .map((row) => row.id);
    ids = await filterOpportunityIdsByChild(
        supabase,
        params.orgId,
        ids,
        params.childFirst ?? null,
        params.childLast ?? null
    );

    return decideIntakeOpportunityMatch(ids);
}

/** Reuse an existing child member already linked to an opportunity when names match. */
export async function findCustomerMemberIdOnOpportunity(
    supabase: SupabaseClient,
    orgId: string,
    opportunityId: string,
    childFirst: string | null | undefined,
    childLast: string | null | undefined
): Promise<string | null> {
    const cf = normalizeIntakeNamePart(childFirst);
    const cl = normalizeIntakeNamePart(childLast);
    if (!cf && !cl) return null;

    const { data: ocmRows, error: ocmErr } = await supabase
        .from("opportunity_customer_members")
        .select("customer_member_id")
        .eq("org_id", orgId)
        .eq("opportunity_id", opportunityId);

    if (ocmErr) throw new Error(`opportunity_customer_members lookup failed: ${ocmErr.message}`);
    const memberIds = [...new Set((ocmRows ?? []).map((r) => (r as { customer_member_id: string }).customer_member_id))];
    if (memberIds.length === 0) return null;

    const { data: members, error: memErr } = await supabase
        .from("customer_members")
        .select("id, first_name, last_name")
        .eq("org_id", orgId)
        .in("id", memberIds);

    if (memErr) throw new Error(`customer_members lookup failed: ${memErr.message}`);

    const matches = (members ?? []).filter((m) =>
        childNameMatchesMember(m as { first_name?: string | null; last_name?: string | null }, childFirst, childLast)
    );
    if (matches.length !== 1) return null;
    return (matches[0] as { id: string }).id;
}

/** Validate work unit belongs to configured department when both are set. */
export async function resolveIntakeWorkUnitId(
    supabase: SupabaseClient,
    orgId: string,
    workUnitId: string | null,
    departmentId: string | null
): Promise<{ work_unit_id: string | null; department_mismatch: boolean }> {
    if (!workUnitId) return { work_unit_id: null, department_mismatch: false };
    if (!departmentId) return { work_unit_id: workUnitId, department_mismatch: false };

    const { data, error } = await supabase
        .from("work_units")
        .select("id, department_id")
        .eq("org_id", orgId)
        .eq("id", workUnitId)
        .maybeSingle();

    if (error) throw new Error(`work_units lookup failed: ${error.message}`);
    if (!data) return { work_unit_id: null, department_mismatch: true };

    const dept = (data as { department_id?: string | null }).department_id ?? null;
    if (dept !== departmentId) {
        return { work_unit_id: null, department_mismatch: true };
    }
    return { work_unit_id: workUnitId, department_mismatch: false };
}
