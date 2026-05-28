/**
 * Batch-load household records for placement priority fact resolution (Card 1).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { HouseholdPlacementFactHouseholdSlice } from "@/lib/orchestration/placement/householdPlacementFacts";

export type HouseholdPlacementFactContextByCustomerId = Map<string, HouseholdPlacementFactHouseholdSlice>;

function emptySlice(customerId: string): HouseholdPlacementFactHouseholdSlice {
    return {
        customer_id: customerId,
        inquiry_children: [],
        active_placement_candidates: [],
        household_persons: [],
    };
}

export async function bulkLoadHouseholdPlacementFactContext(params: {
    supabase: SupabaseClient;
    orgId: string;
    customerIds: string[];
}): Promise<HouseholdPlacementFactContextByCustomerId> {
    const out: HouseholdPlacementFactContextByCustomerId = new Map();
    const ids = [...new Set(params.customerIds.map((id) => id.trim()).filter(Boolean))];
    if (!ids.length) return out;

    for (const customerId of ids) {
        out.set(customerId, emptySlice(customerId));
    }

    const { data: ocmRows, error: ocmErr } = await params.supabase
        .from("opportunity_customer_members")
        .select(
            "id, customer_member_id, outcome_status_key, location_id, opportunities!inner(customer_id)"
        )
        .eq("org_id", params.orgId)
        .in("opportunities.customer_id", ids);

    if (ocmErr) {
        throw new Error(`household OCM load failed: ${ocmErr.message}`);
    }

    for (const raw of ocmRows ?? []) {
        const row = raw as {
            id: string;
            customer_member_id: string;
            outcome_status_key: string | null;
            location_id?: string | null;
            opportunities: { customer_id: string } | { customer_id: string }[];
        };
        const opp = Array.isArray(row.opportunities) ? row.opportunities[0] : row.opportunities;
        const customerId = (opp?.customer_id ?? "").trim();
        if (!customerId || !out.has(customerId)) continue;
        out.get(customerId)!.inquiry_children.push({
            opportunity_customer_member_id: String(row.id),
            customer_member_id: String(row.customer_member_id),
            outcome_status_key: row.outcome_status_key,
            location_id: row.location_id ?? null,
        });
    }

    const { data: pcRows, error: pcErr } = await params.supabase
        .from("placement_candidates")
        .select("id, customer_id, opportunity_customer_member_id, customer_member_id, site_id, status")
        .eq("org_id", params.orgId)
        .in("customer_id", ids)
        .in("status", ["active", "paused"]);

    if (pcErr) {
        throw new Error(`household placement_candidates load failed: ${pcErr.message}`);
    }

    for (const raw of pcRows ?? []) {
        const row = raw as {
            id: string;
            customer_id: string | null;
            opportunity_customer_member_id: string | null;
            customer_member_id: string | null;
            site_id: string | null;
            status: string | null;
        };
        const customerId = (row.customer_id ?? "").trim();
        if (!customerId || !out.has(customerId)) continue;
        out.get(customerId)!.active_placement_candidates.push({
            placement_candidate_id: String(row.id),
            opportunity_customer_member_id: row.opportunity_customer_member_id,
            customer_member_id: row.customer_member_id,
            site_id: row.site_id,
            status: row.status,
        });
    }

    const { data: cpRows, error: cpErr } = await params.supabase
        .from("customer_persons")
        .select("customer_id, person_id, persons!inner(id, is_employee, employee_id)")
        .eq("org_id", params.orgId)
        .in("customer_id", ids);

    if (cpErr) {
        throw new Error(`household customer_persons load failed: ${cpErr.message}`);
    }

    for (const raw of cpRows ?? []) {
        const row = raw as {
            customer_id: string;
            person_id: string;
            persons: { id: string; is_employee: boolean | null; employee_id: string | null } | Array<{
                id: string;
                is_employee: boolean | null;
                employee_id: string | null;
            }>;
        };
        const customerId = String(row.customer_id);
        const slice = out.get(customerId);
        if (!slice) continue;
        const persons = Array.isArray(row.persons) ? row.persons[0] : row.persons;
        if (!persons) continue;
        const personId = String(row.person_id);
        if (slice.household_persons.some((p) => p.person_id === personId)) continue;
        slice.household_persons.push({
            person_id: personId,
            is_employee: persons.is_employee,
            employee_id: persons.employee_id,
        });
    }

    return out;
}
