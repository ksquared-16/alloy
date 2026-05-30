import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureCustomerPersonsPrimaryLink } from "@/lib/bookingCustomerPersonLink";
import { resolveCustomerHouseholdPrimaryContactPersonId } from "@/lib/admin/person/householdPrimaryContact";

function trimOrNull(v: unknown): string | null {
    const s = String(v ?? "").trim();
    return s || null;
}

export type SetHouseholdPrimaryContactResult = {
    customer_id: string;
    primary_person_id: string;
    opportunities_updated: number;
    opportunity_ids: string[];
};

/**
 * Household-scoped primary contact: `customer_persons` (`role_type = primary_contact`, `is_primary = true`).
 * Syncs open opportunities on the account to `primary_person_id` for queue/lead display.
 */
export async function setHouseholdPrimaryContactForCustomer(
    supabase: SupabaseClient,
    params: { orgId: string; customerId: string; personId: string }
): Promise<SetHouseholdPrimaryContactResult> {
    const orgId = trimOrNull(params.orgId);
    const customerId = trimOrNull(params.customerId);
    const personId = trimOrNull(params.personId);
    if (!orgId || !customerId || !personId) {
        throw new Error("orgId, customerId, and personId are required");
    }

    const { data: customer } = await supabase
        .from("customers")
        .select("id")
        .eq("id", customerId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (!customer) {
        throw new Error("Customer not found");
    }

    const { data: person } = await supabase
        .from("persons")
        .select("id")
        .eq("id", personId)
        .eq("org_id", orgId)
        .maybeSingle();
    if (!person) {
        throw new Error("Person not found");
    }

    await ensureCustomerPersonsPrimaryLink(supabase, { orgId, customerId, personId });

    const { data: oppRows, error: oppErr } = await supabase
        .from("opportunities")
        .update({ primary_person_id: personId })
        .eq("org_id", orgId)
        .eq("customer_id", customerId)
        .select("id");
    if (oppErr) {
        throw new Error(`Failed to sync opportunity primary contact: ${oppErr.message}`);
    }

    const verified = await resolveCustomerHouseholdPrimaryContactPersonId(supabase, orgId, customerId);
    if (verified !== personId) {
        throw new Error("Primary contact was not persisted on customer_persons");
    }

    const opportunity_ids = (oppRows ?? [])
        .map((row) => trimOrNull((row as { id?: string }).id))
        .filter((id): id is string => Boolean(id));

    return {
        customer_id: customerId,
        primary_person_id: personId,
        opportunities_updated: opportunity_ids.length,
        opportunity_ids,
    };
}
