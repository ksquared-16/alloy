/**
 * Booking funnel: keep contacts.person_id and customer_persons in sync when we know the canonical person.
 *
 * `customer_persons` rows written here are the canonical customer↔person relationship. Contacts updates exist so
 * messaging/workflows keyed by contact_id remain consistent — do not treat contacts as canonical for new CRM modeling.
 *
 * role_type must match an org's customer_person_role_types.key (seeded as `primary_contact` in data_public.sql).
 * Duplicates are prevented by UNIQUE (org_id, customer_id, person_id, role_type) plus pre-insert select;
 * on 23505 the existing row is promoted (never a silent no-op — required for flip-back).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Canonical key for the primary human on the account; aligns with customer_person_role_types.key. */
export const BOOKING_CUSTOMER_PERSON_ROLE_TYPE = "primary_contact" as const;

export async function ensureContactLinkedToPerson(
    supabase: SupabaseClient,
    params: { contactId: string; personId: string; orgId: string }
): Promise<void> {
    const { contactId, personId, orgId } = params;
    const { error } = await supabase
        .from("contacts")
        .update({ person_id: personId })
        .eq("id", contactId)
        .eq("org_id", orgId);
    if (error) {
        console.error("[BOOKING_CP_LINK] ensureContactLinkedToPerson failed", {
            contactId,
            personId,
            orgId,
            message: error.message,
            code: error.code,
        });
        throw new Error(`Failed to set contacts.person_id: ${error.message} (code: ${error.code ?? "unknown"})`);
    }
}

export async function ensureCustomerPersonsPrimaryLink(
    supabase: SupabaseClient,
    params: { customerId: string; personId: string; orgId: string }
): Promise<void> {
    const { customerId, personId, orgId } = params;
    if (!orgId.trim()) {
        console.warn("[BOOKING_CP_LINK] ensureCustomerPersonsPrimaryLink skipped: empty org_id");
        return;
    }

    const roleType = BOOKING_CUSTOMER_PERSON_ROLE_TYPE;

    const demoteOtherPrimaryRows = async () => {
        const { error } = await supabase
            .from("customer_persons")
            .update({ is_primary: false })
            .eq("org_id", orgId)
            .eq("customer_id", customerId)
            .eq("role_type", roleType)
            .neq("person_id", personId);
        if (error) {
            console.error("[BOOKING_CP_LINK] demote other primary_contact rows failed", {
                customerId,
                personId,
                orgId,
                message: error.message,
                code: error.code,
            });
            throw new Error(
                `Failed to demote prior household primary contact: ${error.message} (code: ${error.code ?? "unknown"})`
            );
        }
    };

    const promoteExistingRow = async (rowId: string) => {
        const { error } = await supabase
            .from("customer_persons")
            .update({ is_primary: true })
            .eq("id", rowId);
        if (error) {
            console.error("[BOOKING_CP_LINK] promote primary_contact row failed", {
                rowId,
                customerId,
                personId,
                orgId,
                message: error.message,
                code: error.code,
            });
            throw new Error(
                `Failed to promote household primary contact: ${error.message} (code: ${error.code ?? "unknown"})`
            );
        }
    };

    const { data: existing } = await supabase
        .from("customer_persons")
        .select("id, is_primary")
        .eq("org_id", orgId)
        .eq("customer_id", customerId)
        .eq("person_id", personId)
        .eq("role_type", roleType)
        .maybeSingle();

    if (existing?.id) {
        await demoteOtherPrimaryRows();
        // Always re-assert is_primary on flip-back — do not no-op when the row looks primary.
        await promoteExistingRow(existing.id);
        return;
    }

    await demoteOtherPrimaryRows();

    const insert = {
        org_id: orgId,
        customer_id: customerId,
        person_id: personId,
        role_type: roleType,
        is_primary: true,
        metadata: {} as Record<string, unknown>,
    };
    const { error } = await supabase.from("customer_persons").insert(insert);
    if (error?.code === "23505") {
        // Unique race / missed select: promote the existing row instead of silently returning.
        const { data: raced } = await supabase
            .from("customer_persons")
            .select("id")
            .eq("org_id", orgId)
            .eq("customer_id", customerId)
            .eq("person_id", personId)
            .eq("role_type", roleType)
            .maybeSingle();
        if (!raced?.id) {
            throw new Error(
                `Failed to ensure customer_persons row: unique conflict without existing row (code: 23505)`
            );
        }
        await demoteOtherPrimaryRows();
        await promoteExistingRow(raced.id);
        return;
    }
    if (error) {
        console.error("[BOOKING_CP_LINK] customer_persons insert failed", {
            insert,
            message: error.message,
            code: error.code,
        });
        throw new Error(`Failed to ensure customer_persons row: ${error.message} (code: ${error.code ?? "unknown"})`);
    }
}
