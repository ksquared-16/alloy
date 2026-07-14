import type { SupabaseClient } from "@supabase/supabase-js";
import { phoneLookupVariants } from "@/lib/forms/intake/intakePersonMatch";
import { findExistingIntakeOpportunity } from "@/lib/forms/intake/intakeOpportunityDedup";
import {
    normalizeDob,
    normalizePersonNamePart,
    type PersonRecordSnapshot,
} from "@/lib/intake/resolve/matchIdentity";

function trim(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

export async function listPersonsByEmail(
    supabase: SupabaseClient,
    orgId: string,
    emailNorm: string,
): Promise<PersonRecordSnapshot[]> {
    const { data, error } = await supabase
        .from("persons")
        .select("id, first_name, last_name, email, phone, date_of_birth")
        .eq("org_id", orgId)
        .ilike("email", emailNorm);
    if (error) throw new Error(error.message);
    return (data ?? []) as PersonRecordSnapshot[];
}

export async function listPersonsByPhone(
    supabase: SupabaseClient,
    orgId: string,
    phoneNorm: string,
): Promise<PersonRecordSnapshot[]> {
    const variants = phoneLookupVariants(phoneNorm);
    const { data, error } = await supabase
        .from("persons")
        .select("id, first_name, last_name, email, phone, date_of_birth")
        .eq("org_id", orgId)
        .in("phone", variants);
    if (error) throw new Error(error.message);
    return (data ?? []) as PersonRecordSnapshot[];
}

export async function listPersonsByExactName(
    supabase: SupabaseClient,
    orgId: string,
    firstName: string,
    lastName: string,
): Promise<PersonRecordSnapshot[]> {
    const first = trim(firstName);
    const last = trim(lastName);
    if (!first || !last) return [];
    const { data, error } = await supabase
        .from("persons")
        .select("id, first_name, last_name, email, phone, date_of_birth")
        .eq("org_id", orgId)
        .ilike("first_name", first)
        .ilike("last_name", last)
        .limit(10);
    if (error) throw new Error(error.message);
    return (data ?? []) as PersonRecordSnapshot[];
}

/**
 * Org-scoped child person pool by name. DOB is intentionally NOT applied at query
 * time so same-name / null-DOB / conflicting-DOB children surface for review.
 * Evaluation classifies DOB agreement.
 */
export async function listOrgChildPersonMatches(
    supabase: SupabaseClient,
    orgId: string,
    firstName: string,
    lastName: string,
    _dob: string | null,
): Promise<PersonRecordSnapshot[]> {
    const first = trim(firstName);
    const last = trim(lastName);
    if (!first) return [];

    let query = supabase
        .from("persons")
        .select("id, first_name, last_name, email, phone, date_of_birth")
        .eq("org_id", orgId)
        .ilike("first_name", first);

    if (last) {
        query = query.ilike("last_name", last);
    }
    query = query.limit(15);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as PersonRecordSnapshot[];
}

export type HouseholdChildMemberRow = {
    person_id?: string | null;
    customer_member_id?: string | null;
    customer_id?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    dob?: string | null;
    display_name?: string | null;
};

/** Prefer structured name parts; fall back to splitting display_name. */
export function memberNameParts(row: {
    first_name?: string | null;
    last_name?: string | null;
    display_name?: string | null;
}): { first_name: string | null; last_name: string | null } {
    const first = trim(row.first_name);
    const last = trim(row.last_name);
    if (first || last) return { first_name: first || null, last_name: last || null };
    const display = trim(row.display_name);
    if (!display) return { first_name: null, last_name: null };
    const parts = display.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return { first_name: parts[0]!, last_name: null };
    return { first_name: parts[0]!, last_name: parts.slice(1).join(" ") };
}

export async function listHouseholdChildMembers(
    supabase: SupabaseClient,
    orgId: string,
    customerId: string,
): Promise<HouseholdChildMemberRow[]> {
    const { data, error } = await supabase
        .from("customer_members")
        .select("id, person_id, customer_id, first_name, last_name, dob, display_name")
        .eq("org_id", orgId)
        .eq("customer_id", customerId)
        .eq("relationship", "child")
        .eq("is_active", true);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => {
        const r = row as {
            id?: string;
            person_id?: string | null;
            customer_id?: string | null;
            first_name?: string | null;
            last_name?: string | null;
            dob?: string | null;
            display_name?: string | null;
        };
        const names = memberNameParts(r);
        return {
            person_id: r.person_id,
            customer_member_id: r.id,
            customer_id: r.customer_id,
            first_name: names.first_name,
            last_name: names.last_name,
            dob: r.dob,
            display_name: r.display_name ?? null,
        };
    });
}

export async function findCustomerIdForPerson(
    supabase: SupabaseClient,
    orgId: string,
    personId: string,
): Promise<string | null> {
    const { data, error } = await supabase
        .from("customer_persons")
        .select("customer_id")
        .eq("org_id", orgId)
        .eq("person_id", personId)
        .limit(1)
        .maybeSingle();
    if (error) throw new Error(error.message);
    const id = trim((data as { customer_id?: string } | null)?.customer_id);
    return id || null;
}

export async function findCustomerDisplayName(
    supabase: SupabaseClient,
    customerId: string,
): Promise<string | null> {
    const { data, error } = await supabase.from("customers").select("name").eq("id", customerId).maybeSingle();
    if (error) throw new Error(error.message);
    const name = trim((data as { name?: string } | null)?.name);
    return name || null;
}

export async function findPersonRecordById(
    supabase: SupabaseClient,
    personId: string,
): Promise<PersonRecordSnapshot | null> {
    const { data, error } = await supabase
        .from("persons")
        .select("id, first_name, last_name, email, phone, date_of_birth")
        .eq("id", personId)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return data as PersonRecordSnapshot;
}

export async function findExistingLeadForIntake(
    supabase: SupabaseClient,
    input: {
        orgId: string;
        personId: string;
        locationId?: string | null;
        childFirst?: string | null;
        childLast?: string | null;
    },
): Promise<{ opportunityId: string | null; ambiguous: boolean }> {
    const decision = await findExistingIntakeOpportunity(supabase, {
        orgId: input.orgId,
        personId: input.personId,
        locationId: input.locationId ?? null,
        childFirst: input.childFirst ?? null,
        childLast: input.childLast ?? null,
    });
    if (decision.kind === "matched") return { opportunityId: decision.opportunityId, ambiguous: false };
    if (decision.kind === "ambiguous") return { opportunityId: null, ambiguous: true };
    return { opportunityId: null, ambiguous: false };
}

export async function loadPersonSnapshotsByIds(
    supabase: SupabaseClient,
    ids: string[],
): Promise<PersonRecordSnapshot[]> {
    if (ids.length === 0) return [];
    const { data, error } = await supabase
        .from("persons")
        .select("id, first_name, last_name, email, phone, date_of_birth")
        .in("id", ids);
    if (error) throw new Error(error.message);
    return (data ?? []) as PersonRecordSnapshot[];
}

export function filterPersonsByNameParts(
    persons: PersonRecordSnapshot[],
    firstName: string,
    lastName: string,
): PersonRecordSnapshot[] {
    const first = normalizePersonNamePart(firstName);
    const last = normalizePersonNamePart(lastName);
    return persons.filter(
        (p) => normalizePersonNamePart(p.first_name) === first && normalizePersonNamePart(p.last_name) === last,
    );
}

export function filterChildMembersByIdentity(
    members: HouseholdChildMemberRow[],
    firstName: string,
    lastName: string,
    dob: string | null,
): HouseholdChildMemberRow[] {
    const dobNorm = normalizeDob(dob);
    return members.filter((m) => {
        if (normalizePersonNamePart(m.first_name) !== normalizePersonNamePart(firstName)) return false;
        if (lastName && normalizePersonNamePart(m.last_name) !== normalizePersonNamePart(lastName)) return false;
        if (dobNorm && normalizeDob(m.dob) !== dobNorm) return false;
        return true;
    });
}
