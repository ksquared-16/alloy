// UI-5A — Supabase batch load for the family workspace (I/O only; no VM assembly).
import { createAdminClient } from "@/lib/supabaseAdmin";

type AdminSupabase = ReturnType<typeof createAdminClient>;
const CAP = 25;

export type RawPerson = {
    id: string;
    first_name?: string | null;
    last_name?: string | null;
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
    archived_at?: string | null;
    status_key?: string | null;
    metadata?: Record<string, unknown> | null;
};
export type RawMember = {
    id: string;
    person_id?: string | null;
    display_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    dob?: string | null;
    relationship?: string | null;
    is_active?: boolean | null;
    status_key?: string | null;
};
export type RawCustomerPerson = { person_id: string; role_type?: string | null; is_primary?: boolean | null; status?: string | null; end_date?: string | null };
export type RawOpportunityPerson = { person_id: string; role_type?: string | null; opportunity_id?: string | null };
export type RawOpportunity = { id: string; name?: string | null; status_key?: string | null; pipeline_stage_id?: string | null; location_id?: string | null; primary_person_id?: string | null; customer_id?: string | null };
export type RawRoleType = { key: string; label?: string | null };
export type RawBinding = { id?: string | null; channel: string; provider?: string | null; status?: string | null; secret_ref?: string | null };
export type RawCustomer = { id: string; name?: string | null; status?: string | null; status_key?: string | null; primary_contact_id?: string | null };

export type RawFamilyWorkspaceData = {
    customer: RawCustomer | null;
    members: RawMember[];
    customerPersons: RawCustomerPerson[];
    opportunityPersons: RawOpportunityPerson[];
    opportunities: RawOpportunity[];
    persons: RawPerson[];
    roleTypes: RawRoleType[];
    bindings: RawBinding[];
};

export async function loadFamilyWorkspaceData(
    supabase: AdminSupabase,
    orgId: string,
    customerId: string
): Promise<RawFamilyWorkspaceData> {
    const [customerRes, membersRes, customerPersonsRes, opportunitiesRes, roleTypesRes, bindingsRes] = await Promise.all([
        supabase.from("customers").select("id, name, status_key, primary_contact_id").eq("org_id", orgId).eq("id", customerId).maybeSingle(),
        supabase.from("customer_members").select("id, person_id, display_name, first_name, last_name, dob, relationship, is_active, status_key").eq("org_id", orgId).eq("customer_id", customerId).eq("relationship", "child").eq("is_active", true).limit(CAP),
        supabase.from("customer_persons").select("person_id, role_type, is_primary, status, end_date").eq("org_id", orgId).eq("customer_id", customerId).limit(CAP),
        supabase.from("opportunities").select("id, name, status_key, pipeline_stage_id, location_id, primary_person_id, customer_id").eq("org_id", orgId).eq("customer_id", customerId).limit(CAP),
        supabase.from("customer_person_role_types").select("key, label").eq("org_id", orgId).limit(100),
        supabase.from("communication_provider_bindings").select("channel, provider, status, secret_ref").eq("org_id", orgId).limit(50),
    ]);

    const members = (membersRes.data ?? []) as RawMember[];
    const customerPersons = (customerPersonsRes.data ?? []) as RawCustomerPerson[];
    const opportunities = (opportunitiesRes.data ?? []) as RawOpportunity[];
    const oppIds = opportunities.map((o) => o.id).filter(Boolean);

    const opportunityPersonsRes = oppIds.length
        ? await supabase.from("opportunity_persons").select("person_id, role_type, opportunity_id").in("opportunity_id", oppIds).limit(CAP)
        : { data: [] as RawOpportunityPerson[] };
    const opportunityPersons = (opportunityPersonsRes.data ?? []) as RawOpportunityPerson[];

    const personIds = Array.from(
        new Set(
            [
                ...members.map((m) => m.person_id),
                ...customerPersons.map((c) => c.person_id),
                ...opportunityPersons.map((o) => o.person_id),
            ].filter((x): x is string => typeof x === "string" && x.length > 0)
        )
    );

    const personsRes = personIds.length
        ? await supabase.from("persons").select("id, first_name, last_name, full_name, email, phone, archived_at, status_key, metadata").eq("org_id", orgId).in("id", personIds).limit(CAP * 2)
        : { data: [] as RawPerson[] };

    return {
        customer: (customerRes.data ?? null) as RawCustomer | null,
        members,
        customerPersons,
        opportunityPersons,
        opportunities,
        persons: (personsRes.data ?? []) as RawPerson[],
        roleTypes: (roleTypesRes.data ?? []) as RawRoleType[],
        bindings: (bindingsRes.data ?? []) as RawBinding[],
    };
}
