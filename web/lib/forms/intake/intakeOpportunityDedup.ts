/**
 * Opportunity deduplication for public form intake (Runtime Test 1A).
 * Pure decision helpers + Supabase candidate lookup.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

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
 * Find an existing open opportunity for intake dedup.
 * Matches guardian person + optional location + optional child name on linked customer members.
 */
export async function findExistingIntakeOpportunity(
    supabase: SupabaseClient,
    params: FindIntakeOpportunityParams
): Promise<IntakeOpportunityMatchDecision> {
    let query = supabase
        .from("opportunities")
        .select("id")
        .eq("org_id", params.orgId)
        .eq("primary_person_id", params.personId)
        .eq("status_key", "open");

    if (params.locationId) {
        query = query.eq("location_id", params.locationId);
    }

    const { data, error } = await query;
    if (error) throw new Error(`opportunities dedup lookup failed: ${error.message}`);

    let ids = (data ?? []).map((r) => (r as { id: string }).id);
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
