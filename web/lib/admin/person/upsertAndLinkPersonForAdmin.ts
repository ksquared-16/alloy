import type { SupabaseClient } from "@supabase/supabase-js";
import { findOrCreatePersonInOrgWithMeta } from "@/lib/persons/findOrCreatePersonInOrg";
import { customerPersonRowIsHouseholdPrimaryContact } from "@/lib/admin/person/householdPrimaryContact";

export type UpsertAndLinkPersonInput = {
    orgId: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    roleType: string;
    /** When set, links `customer_persons` (household truth). */
    customerId: string | null;
    /** When set, links `opportunity_persons` (case-scoped adults on inquiry). */
    opportunityId: string | null;
};

export type UpsertAndLinkPersonResult = {
    person_id: string;
    customer_person_id?: string;
    opportunity_person_id?: string;
    existed: boolean;
};

function trim(v: unknown): string {
    return v != null ? String(v).trim() : "";
}

export function validatePersonIdentityFields(input: {
    first_name: string;
    last_name: string;
    email?: string | null;
    phone?: string | null;
}): string | null {
    if (!trim(input.first_name)) return "First name is required.";
    if (!trim(input.last_name)) return "Last name is required.";
    const email = trim(input.email) || null;
    const phone = trim(input.phone) || null;
    if (!email && !phone) return "Phone or email is required.";
    return null;
}

function defaultRoleForActionKey(actionKey: string): string {
    const k = actionKey.trim();
    if (k === "add_related_person") return "primary_contact";
    if (k === "add_family_member") return "parent";
    return "parent";
}

export function resolvePersonRoleType(roleTypeRaw: string | null | undefined, actionKey: string): string {
    const role = trim(roleTypeRaw);
    if (role) return role;
    return defaultRoleForActionKey(actionKey);
}

function roleImpliesHouseholdPrimary(roleType: string): boolean {
    const key = roleType.trim().toLowerCase().replace(/\s+/g, "_");
    return key === "primary_contact" || key === "primary";
}

async function ensurePersonId(
    supabase: SupabaseClient,
    input: Pick<UpsertAndLinkPersonInput, "orgId" | "firstName" | "lastName" | "email" | "phone">
): Promise<string | null> {
    const foundOrCreated = await findOrCreatePersonInOrgWithMeta(supabase, {
        org_id: input.orgId,
        first_name: input.firstName,
        last_name: input.lastName,
        email: input.email,
        phone: input.phone,
    });
    const existingId = foundOrCreated?.id?.trim() || null;
    if (existingId) return existingId;

    const { data: created, error } = await supabase
        .from("persons")
        .insert({
            org_id: input.orgId,
            first_name: input.firstName,
            last_name: input.lastName,
            email: input.email,
            phone: input.phone,
        })
        .select("id")
        .single();
    if (error || !created) return null;
    return (created as { id: string }).id;
}

/**
 * Create or resolve a person and link to household and/or opportunity.
 * Used by add_family_member / add_related_person execute paths (capture-first submit).
 */
export async function upsertAndLinkPersonForAdmin(
    supabase: SupabaseClient,
    input: UpsertAndLinkPersonInput & { actionKey?: string }
): Promise<{ ok: true; result: UpsertAndLinkPersonResult } | { ok: false; error: string }> {
    const validation = validatePersonIdentityFields({
        first_name: input.firstName,
        last_name: input.lastName,
        email: input.email,
        phone: input.phone,
    });
    if (validation) return { ok: false, error: validation };

    const roleType = resolvePersonRoleType(input.roleType, input.actionKey ?? "add_family_member");
    const personId = await ensurePersonId(supabase, input);
    if (!personId) return { ok: false, error: "Failed to create person." };

    let customerPersonId: string | undefined;
    let opportunityPersonId: string | undefined;
    let existed = false;

    if (input.customerId) {
        const { data: existingLink } = await supabase
            .from("customer_persons")
            .select("id, role_type, is_primary")
            .eq("org_id", input.orgId)
            .eq("customer_id", input.customerId)
            .eq("person_id", personId)
            .eq("role_type", roleType)
            .maybeSingle();

        if (existingLink?.id) {
            customerPersonId = (existingLink as { id: string }).id;
            existed = true;
        } else {
            const isPrimary = roleImpliesHouseholdPrimary(roleType);
            const { data: insertedLink, error: linkErr } = await supabase
                .from("customer_persons")
                .insert({
                    org_id: input.orgId,
                    customer_id: input.customerId,
                    person_id: personId,
                    role_type: roleType,
                    is_primary: isPrimary,
                    metadata: {},
                })
                .select("id")
                .single();
            if (linkErr?.code === "23505") {
                existed = true;
            } else if (linkErr || !insertedLink) {
                return { ok: false, error: linkErr?.message ?? "Failed to link person to household." };
            } else {
                customerPersonId = (insertedLink as { id: string }).id;
            }
        }
    }

    if (input.opportunityId) {
        const { data: existingRow } = await supabase
            .from("opportunity_persons")
            .select("id")
            .eq("org_id", input.orgId)
            .eq("opportunity_id", input.opportunityId)
            .eq("person_id", personId)
            .maybeSingle();

        if (existingRow?.id) {
            opportunityPersonId = (existingRow as { id: string }).id;
            existed = true;
        } else {
            const { data: insertedOppPerson, error: oppPersonErr } = await supabase
                .from("opportunity_persons")
                .insert({
                    org_id: input.orgId,
                    opportunity_id: input.opportunityId,
                    person_id: personId,
                    role_type: roleType,
                    metadata: { source: input.actionKey ?? "add_person" },
                })
                .select("id")
                .single();
            if (oppPersonErr?.code === "23505") {
                existed = true;
            } else if (oppPersonErr || !insertedOppPerson) {
                return { ok: false, error: oppPersonErr?.message ?? "Failed to link person to opportunity." };
            } else {
                opportunityPersonId = (insertedOppPerson as { id: string }).id;
            }
        }
    }

    return {
        ok: true,
        result: {
            person_id: personId,
            customer_person_id: customerPersonId,
            opportunity_person_id: opportunityPersonId,
            existed,
        },
    };
}

/** Whether an existing customer_persons row already represents household primary. */
export function customerPersonLinkIsPrimary(row: {
    role_type?: string | null;
    is_primary?: boolean | null;
}): boolean {
    return customerPersonRowIsHouseholdPrimaryContact(row);
}
