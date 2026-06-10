import type { SupabaseClient } from "@supabase/supabase-js";
import { enrollmentIntakePersonStatusFields } from "@/lib/admin/person/enrollmentPersonDefaultStatus";

type MinimalSupabase = Pick<SupabaseClient, "from">;

export type FindOrCreateChildPersonInOrgInput = {
    orgId: string;
    customerId: string;
    firstName: string;
    lastName: string;
    /** Customer member `dob` column (YYYY-MM-DD). */
    dob: string | null;
};

export type FindOrCreateChildPersonInOrgResult = {
    person_id: string;
    created: boolean;
    source: "household_member" | "org_identity" | "insert";
};

function trim(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

function normalizeNameKey(v: unknown): string {
    return trim(v).toLowerCase();
}

function normalizeDob(v: unknown): string | null {
    const t = trim(v).slice(0, 10);
    return t && /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

function childIdentityMatches(args: {
    firstName: string;
    lastName: string;
    dob: string | null;
    candidateFirst: unknown;
    candidateLast: unknown;
    candidateDob: unknown;
}): boolean {
    if (normalizeNameKey(args.candidateFirst) !== normalizeNameKey(args.firstName)) return false;
    if (normalizeNameKey(args.candidateLast) !== normalizeNameKey(args.lastName)) return false;
    if (args.dob) {
        return normalizeDob(args.candidateDob) === args.dob;
    }
    return true;
}

async function findPersonIdFromHouseholdChildMember(
    supabase: MinimalSupabase,
    input: FindOrCreateChildPersonInOrgInput,
): Promise<string | null> {
    const { data: rows } = await supabase
        .from("customer_members")
        .select("person_id, first_name, last_name, dob")
        .eq("org_id", input.orgId)
        .eq("customer_id", input.customerId)
        .eq("relationship", "child")
        .eq("is_active", true);

    for (const raw of rows ?? []) {
        const row = raw as {
            person_id?: string | null;
            first_name?: string | null;
            last_name?: string | null;
            dob?: string | null;
        };
        const personId = trim(row.person_id);
        if (!personId) continue;
        if (
            childIdentityMatches({
                firstName: input.firstName,
                lastName: input.lastName,
                dob: input.dob,
                candidateFirst: row.first_name,
                candidateLast: row.last_name,
                candidateDob: row.dob,
            })
        ) {
            return personId;
        }
    }
    return null;
}

async function findPersonIdByOrgChildIdentity(
    supabase: MinimalSupabase,
    input: FindOrCreateChildPersonInOrgInput,
): Promise<string | null> {
    let query = supabase
        .from("persons")
        .select("id, first_name, last_name, date_of_birth")
        .eq("org_id", input.orgId)
        .ilike("first_name", input.firstName)
        .ilike("last_name", input.lastName)
        .limit(10);

    if (input.dob) {
        query = query.eq("date_of_birth", input.dob);
    }

    const { data: rows } = await query;
    for (const raw of rows ?? []) {
        const row = raw as {
            id?: string;
            first_name?: string | null;
            last_name?: string | null;
            date_of_birth?: string | null;
        };
        const id = trim(row.id);
        if (!id) continue;
        if (
            childIdentityMatches({
                firstName: input.firstName,
                lastName: input.lastName,
                dob: input.dob,
                candidateFirst: row.first_name,
                candidateLast: row.last_name,
                candidateDob: row.date_of_birth,
            })
        ) {
            return id;
        }
    }
    return null;
}

async function syncChildPersonDateOfBirthIfMissing(
    supabase: MinimalSupabase,
    personId: string,
    dob: string | null,
): Promise<void> {
    if (!dob) return;
    const { data: row } = await supabase
        .from("persons")
        .select("date_of_birth")
        .eq("id", personId)
        .maybeSingle();
    const existing = normalizeDob((row as { date_of_birth?: string | null } | null)?.date_of_birth);
    if (existing) return;
    await supabase.from("persons").update({ date_of_birth: dob }).eq("id", personId);
}

/**
 * Resolve or create a durable child `persons` row for household/opportunity flows.
 */
export async function findOrCreateChildPersonInOrg(
    supabase: MinimalSupabase,
    input: FindOrCreateChildPersonInOrgInput,
): Promise<FindOrCreateChildPersonInOrgResult | null> {
    const firstName = trim(input.firstName);
    const lastName = trim(input.lastName);
    const dob = normalizeDob(input.dob);
    if (!firstName || !lastName || !trim(input.orgId) || !trim(input.customerId)) {
        return null;
    }

    const fromHousehold = await findPersonIdFromHouseholdChildMember(supabase, {
        ...input,
        firstName,
        lastName,
        dob,
    });
    if (fromHousehold) {
        await syncChildPersonDateOfBirthIfMissing(supabase, fromHousehold, dob);
        return { person_id: fromHousehold, created: false, source: "household_member" };
    }

    const fromOrg = await findPersonIdByOrgChildIdentity(supabase, {
        ...input,
        firstName,
        lastName,
        dob,
    });
    if (fromOrg) {
        await syncChildPersonDateOfBirthIfMissing(supabase, fromOrg, dob);
        return { person_id: fromOrg, created: false, source: "org_identity" };
    }

    const { data: created, error } = await supabase
        .from("persons")
        .insert({
            org_id: input.orgId,
            first_name: firstName,
            last_name: lastName,
            date_of_birth: dob,
            email: null,
            phone: null,
            ...enrollmentIntakePersonStatusFields(),
        })
        .select("id")
        .single();

    if (error || !created) {
        console.warn("[findOrCreateChildPersonInOrg] insert failed", error?.message);
        return null;
    }

    const personId = trim((created as { id?: string }).id);
    if (!personId) return null;
    return { person_id: personId, created: true, source: "insert" };
}
