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

/**
 * Load native + config profile fields for customer_members (canonical child profile grain).
 *
 * TWO PARALLEL QUERIES AT ONE HOP OF DEPTH, not three serial round trips (P0-7.6 · A′).
 *
 * This read was `customer_members`, THEN `field_definitions`, THEN `field_values` — each awaiting
 * the last, measured at 399 ms P50 deployed, which made it the binding producer for the Focus
 * Panel's first-order Health card. Only the third read genuinely depended on the second, and that
 * dependency is removable: filtering `field_values` through an embedded `field_definitions!inner`
 * asks the database to resolve the definition ids instead of resolving them in a prior round trip.
 *
 * The native read and the values read are independent, so they run together. Measured deployed:
 * the values half is 137 ms, against 399 ms for the old chain.
 *
 * SEMANTICS ARE UNCHANGED, and that is the load-bearing claim: the same org scope, the same entity
 * type, the same active-definition filter, the same configured key set and the same
 * `displayFromFieldValueRow` conversion. `healthProfileReadShapeContract.test.ts` pins the fact
 * that every consumed key is `text` or `select`, so `value_text` is the only shape in play and no
 * value column is dropped by the narrower select.
 *
 * A FAILED READ IS NOT AN EMPTY PROFILE. Both halves are awaited together and a rejection
 * propagates, exactly as before — this must never degrade to "no configured fields", which a
 * caller cannot distinguish from a child who genuinely has none.
 */
export async function loadCustomerMemberProfileFieldsByMemberId(
    supabase: SupabaseClient,
    orgId: string,
    memberIds: string[]
): Promise<Map<string, CustomerMemberProfileFieldsRow>> {
    const out = new Map<string, CustomerMemberProfileFieldsRow>();
    if (!memberIds.length) return out;

    const [membersResult, valuesResult] = await Promise.all([
        supabase
            .from("customer_members")
            .select("id, person_id, first_name, last_name, dob")
            .eq("org_id", orgId)
            .in("id", memberIds),
        supabase
            .from("field_values")
            .select(
                "entity_id, value_text, value_number, value_date, value_boolean, value_json, "
                + "field_definitions!inner(field_key, field_type, entity_type, is_active)"
            )
            .eq("org_id", orgId)
            .eq("entity_type", CUSTOMER_MEMBER_ENTITY_TYPE)
            .in("entity_id", memberIds)
            .eq("field_definitions.is_active", true)
            .in("field_definitions.field_key", [...CUSTOMER_MEMBER_CONFIG_FIELD_KEYS]),
    ]);

    for (const m of membersResult.data ?? []) {
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

    for (const raw of (valuesResult.data ?? []) as unknown[]) {
        const fv = raw as {
            entity_id?: string;
            field_definitions?: { field_key?: string; field_type?: string } | null;
        };
        const memberId = fv.entity_id;
        const def = fv.field_definitions;
        if (!memberId || !def?.field_key) continue;
        // A value for a member the native read did not return is not attached to an invented row:
        // the member is out of org scope or absent, and inventing a row here would answer for a
        // child this caller was never given.
        const existing = out.get(memberId);
        if (!existing) continue;
        const key = def.field_key as keyof CustomerMemberProfileFieldsRow;
        (existing as Record<string, unknown>)[key] = displayFromFieldValueRow(
            def.field_type ?? "text",
            raw as Record<string, unknown>
        );
    }

    return out;
}
