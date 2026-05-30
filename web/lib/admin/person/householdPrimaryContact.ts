import type { SupabaseClient } from "@supabase/supabase-js";
import { BOOKING_CUSTOMER_PERSON_ROLE_TYPE } from "@/lib/bookingCustomerPersonLink";
import { normPersonDrawerHouseholdRole } from "@/lib/admin/person/personDrawerHouseholdRoles";

function trimOrNull(v: unknown): string | null {
    const s = String(v ?? "").trim();
    return s || null;
}

/** Household-scoped primary contact role on `customer_persons` (not global person truth). */
export const HOUSEHOLD_PRIMARY_CONTACT_ROLE_TYPE = BOOKING_CUSTOMER_PERSON_ROLE_TYPE;

export type CustomerPersonPrimaryContactRow = {
    person_id?: string | null;
    customer_id?: string | null;
    role_type?: string | null;
    is_primary?: boolean | null;
};

/**
 * True when this `customer_persons` row is the canonical primary contact for its household/customer.
 * Requires `role_type = primary_contact` and `is_primary` on that customer link.
 */
export function customerPersonRowIsHouseholdPrimaryContact(row: CustomerPersonPrimaryContactRow): boolean {
    const role = normPersonDrawerHouseholdRole(row.role_type);
    return role === HOUSEHOLD_PRIMARY_CONTACT_ROLE_TYPE && Boolean(row.is_primary);
}

/** Pick the household primary contact person id from in-memory customer_persons rows. */
export function resolveHouseholdPrimaryContactPersonIdFromRows(
    rows: CustomerPersonPrimaryContactRow[],
    customerId: string
): string | null {
    const cid = trimOrNull(customerId);
    if (!cid) return null;
    for (const row of rows) {
        if (trimOrNull(row.customer_id) !== cid) continue;
        if (!customerPersonRowIsHouseholdPrimaryContact(row)) continue;
        const personId = trimOrNull(row.person_id);
        if (personId) return personId;
    }
    return null;
}

/** Server lookup: canonical primary contact person for a customer/household. */
export async function resolveCustomerHouseholdPrimaryContactPersonId(
    supabase: SupabaseClient,
    orgId: string,
    customerId: string | null | undefined
): Promise<string | null> {
    const cid = trimOrNull(customerId);
    if (!cid || !trimOrNull(orgId)) return null;

    const { data: primaryRow } = await supabase
        .from("customer_persons")
        .select("person_id")
        .eq("org_id", orgId)
        .eq("customer_id", cid)
        .eq("role_type", HOUSEHOLD_PRIMARY_CONTACT_ROLE_TYPE)
        .eq("is_primary", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

    const fromPrimary = trimOrNull((primaryRow as { person_id?: string } | null)?.person_id);
    if (fromPrimary) return fromPrimary;

    const { data: roleRow } = await supabase
        .from("customer_persons")
        .select("person_id")
        .eq("org_id", orgId)
        .eq("customer_id", cid)
        .eq("role_type", HOUSEHOLD_PRIMARY_CONTACT_ROLE_TYPE)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

    return trimOrNull((roleRow as { person_id?: string } | null)?.person_id);
}
