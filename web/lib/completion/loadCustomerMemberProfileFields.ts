import type { SupabaseClient } from "@supabase/supabase-js";
import { displayFromFieldValueRow } from "@/lib/admin/typedFieldValues";
import { CUSTOMER_MEMBER_CONFIG_FIELD_KEYS, CUSTOMER_MEMBER_ENTITY_TYPE } from "@/lib/fields/customerMemberFieldRegistry";

export type CustomerMemberProfileFieldsRow = {
    person_id?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    dob?: string | null;
    gender?: string | null;
    allergies?: string | null;
    medical_notes?: string | null;
    preferred_name?: string | null;
    special_instructions?: string | null;
};

/** Load native + config profile fields for customer_members (canonical child profile grain). */
export async function loadCustomerMemberProfileFieldsByMemberId(
    supabase: SupabaseClient,
    orgId: string,
    memberIds: string[]
): Promise<Map<string, CustomerMemberProfileFieldsRow>> {
    const out = new Map<string, CustomerMemberProfileFieldsRow>();
    if (!memberIds.length) return out;

    const { data: members } = await supabase
        .from("customer_members")
        .select("id, person_id, first_name, last_name, dob")
        .eq("org_id", orgId)
        .in("id", memberIds);

    for (const m of members ?? []) {
        const row = m as {
            id?: string;
            person_id?: string | null;
            first_name?: string | null;
            last_name?: string | null;
            dob?: string | null;
        };
        if (!row.id) continue;
        out.set(row.id, {
            person_id: row.person_id ?? null,
            first_name: row.first_name ?? null,
            last_name: row.last_name ?? null,
            dob: row.dob ?? null,
        });
    }

    const { data: defRows } = await supabase
        .from("field_definitions")
        .select("id, field_key, field_type")
        .eq("org_id", orgId)
        .eq("entity_type", CUSTOMER_MEMBER_ENTITY_TYPE)
        .eq("is_active", true)
        .in("field_key", [...CUSTOMER_MEMBER_CONFIG_FIELD_KEYS]);

    const defs = (defRows ?? []) as { id: string; field_key: string; field_type: string }[];
    if (!defs.length) return out;

    const defById = new Map(defs.map((d) => [d.id, d]));
    const { data: valueRows } = await supabase
        .from("field_values")
        .select("*")
        .eq("org_id", orgId)
        .eq("entity_type", CUSTOMER_MEMBER_ENTITY_TYPE)
        .in("entity_id", memberIds)
        .in(
            "field_definition_id",
            defs.map((d) => d.id)
        );

    for (const raw of valueRows ?? []) {
        const fv = raw as { entity_id?: string; field_definition_id?: string };
        const memberId = fv.entity_id;
        const def = fv.field_definition_id ? defById.get(fv.field_definition_id) : undefined;
        if (!memberId || !def) continue;
        const existing = out.get(memberId) ?? {};
        const key = def.field_key as keyof CustomerMemberProfileFieldsRow;
        (existing as Record<string, unknown>)[key] = displayFromFieldValueRow(
            def.field_type,
            raw as Record<string, unknown>
        );
        out.set(memberId, existing);
    }

    return out;
}
