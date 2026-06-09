/**
 * Server-side: ensure opportunity VM record carries household child rows for layout mapping.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { isActiveChildCustomerMemberForInquiry } from "@/lib/admin/drawer/inquiryChildrenHydration";

function trimId(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    return s || null;
}

/** Attach active household customer_members as `_household_children` for canonical child merge. */
export async function enrichOpportunityVmRecordWithHouseholdChildren(input: {
    supabase: SupabaseClient;
    orgId: string;
    vmRecord: Record<string, unknown>;
}): Promise<Record<string, unknown>> {
    const existing = input.vmRecord._household_children;
    if (Array.isArray(existing) && existing.length > 0) {
        return input.vmRecord;
    }

    const customerId = trimId(input.vmRecord.customer_id);
    if (!customerId) return input.vmRecord;

    const { data: members } = await input.supabase
        .from("customer_members")
        .select("id, display_name, person_id, first_name, last_name, dob, relationship, is_active, metadata")
        .eq("org_id", input.orgId)
        .eq("customer_id", customerId)
        .eq("is_active", true)
        .limit(25);

    const childRows = (members ?? []).filter((row) =>
        isActiveChildCustomerMemberForInquiry(row as Record<string, unknown>),
    );
    if (childRows.length === 0) return input.vmRecord;

    const householdChildren = childRows.map((m) => {
        const row = m as Record<string, unknown>;
        return {
            id: trimId(row.id),
            customer_member_id: trimId(row.id),
            person_id: trimId(row.person_id),
            display_name: trimId(row.display_name),
            first_name: trimId(row.first_name),
            last_name: trimId(row.last_name),
            dob: row.dob != null ? String(row.dob).slice(0, 10) : null,
            linked_on_inquiry: false,
        };
    });

    return {
        ...input.vmRecord,
        _household_children: householdChildren,
    };
}
