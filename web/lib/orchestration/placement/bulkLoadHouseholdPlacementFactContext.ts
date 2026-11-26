/**
 * Batch-load household records for placement priority fact resolution (Card 1).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { HouseholdPlacementFactHouseholdSlice } from "@/lib/orchestration/placement/householdPlacementFacts";
import { firstNestedRecord } from "@/lib/orchestration/placement/normalizeSupabaseNestedRelation";
import { resolvePlacementCandidateChildDisplayName } from "@/lib/orchestration/placement/resolvePlacementCandidateChildDisplayName";
import { resolvePlacementCandidateCohortForQueue } from "@/lib/orchestration/placement/resolvePlacementCandidateCohortForQueue";

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

    /*
     * THREE INDEPENDENT READS OF ONE KEY SET.
     *
     * All three are keyed by the same `ids` and org-scoped, and none reads another's result: the
     * household slice is assembled from them afterwards. Awaiting them one after another simply added
     * two round trips to every placement-bearing page (measured ~188ms serial on a 17-row Waitlist).
     *
     * They are issued together and the result loops below run in their ORIGINAL order, so the
     * assembled map is byte-for-byte what the serial version produced.
     */
    const ocmPromise = params.supabase
        .from("opportunity_customer_members")
        .select(
            "id, customer_member_id, outcome_status_key, location_id, program_room_cohort_key, program_category_id, location_program_categories(key), customer_members(display_name, first_name, last_name, persons(first_name, last_name)), opportunities!inner(customer_id)"
        )
        .eq("org_id", params.orgId)
        .in("opportunities.customer_id", ids);

    const pcPromise = params.supabase
        .from("placement_candidates")
        .select("id, customer_id, opportunity_customer_member_id, customer_member_id, site_id, status")
        .eq("org_id", params.orgId)
        .in("customer_id", ids)
        .in("status", ["active", "paused"]);

    const cpPromise = params.supabase
        .from("customer_persons")
        .select("customer_id, person_id, persons!inner(id, is_employee, employee_id)")
        .eq("org_id", params.orgId)
        .in("customer_id", ids);

    const [{ data: ocmRows, error: ocmErr }, { data: pcRows, error: pcErr }, { data: cpRows, error: cpErr }] =
        await Promise.all([ocmPromise, pcPromise, cpPromise]);

    if (ocmErr) {
        throw new Error(`household OCM load failed: ${ocmErr.message}`);
    }

    for (const raw of ocmRows ?? []) {
        const row = raw as {
            id: string;
            customer_member_id: string;
            outcome_status_key: string | null;
            location_id?: string | null;
            program_room_cohort_key?: string | null;
            program_category_id?: string | null;
            location_program_categories?: { key?: string | null } | Array<{ key?: string | null }> | null;
            customer_members?: {
                display_name?: string | null;
                first_name?: string | null;
                last_name?: string | null;
                persons?: { first_name?: string | null; last_name?: string | null } | null;
            } | null;
            opportunities: { customer_id: string } | { customer_id: string }[];
        };
        const opp = Array.isArray(row.opportunities) ? row.opportunities[0] : row.opportunities;
        const customerId = (opp?.customer_id ?? "").trim();
        if (!customerId || !out.has(customerId)) continue;

        const childDisplayName =
            resolvePlacementCandidateChildDisplayName({ ocmMember: row.customer_members ?? null }) ??
            null;
        const programKey =
            (typeof firstNestedRecord(row.location_program_categories)?.key === "string"
                ? String(firstNestedRecord(row.location_program_categories)?.key).trim()
                : "") || null;
        const cohort = resolvePlacementCandidateCohortForQueue({
            storedKey: row.program_room_cohort_key ?? "",
            storedLabel: row.program_room_cohort_key ?? "",
            ocmProgramRoomCohortKey: row.program_room_cohort_key,
            programKey,
        });

        out.get(customerId)!.inquiry_children.push({
            opportunity_customer_member_id: String(row.id),
            customer_member_id: String(row.customer_member_id),
            outcome_status_key: row.outcome_status_key,
            location_id: row.location_id ?? null,
            child_display_name: childDisplayName,
            program_room_cohort_key: cohort.program_room_cohort_key,
            program_key: programKey,
            program_category_id: row.program_category_id ?? null,
        });
    }


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
