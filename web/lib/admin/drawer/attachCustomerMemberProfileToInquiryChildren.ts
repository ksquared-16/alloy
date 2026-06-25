import type { SupabaseClient } from "@supabase/supabase-js";
import {
    loadCustomerMemberProfileFieldsByMemberId,
    type CustomerMemberProfileFieldsRow,
} from "@/lib/completion/loadCustomerMemberProfileFields";
import { CUSTOMER_MEMBER_CONFIG_FIELD_KEYS } from "@/lib/fields/customerMemberFieldRegistry";

type InquiryChildProfileAttachRow = {
    customer_member_id?: string | null;
    custom_fields?: Record<string, unknown>;
    gender?: string | null;
    allergies?: string | null;
    medical_notes?: string | null;
    preferred_name?: string | null;
    special_instructions?: string | null;
};

function trimMemberId(value: unknown): string | null {
    if (value == null) return null;
    const s = String(value).trim();
    return s || null;
}

function mergeProfileOntoRow<T extends InquiryChildProfileAttachRow>(
    row: T,
    profile: CustomerMemberProfileFieldsRow | undefined,
): T {
    if (!profile) return row;

    const configPatch: Record<string, unknown> = {};
    for (const key of CUSTOMER_MEMBER_CONFIG_FIELD_KEYS) {
        const value = profile[key as keyof CustomerMemberProfileFieldsRow];
        if (value != null && String(value).trim() !== "") {
            configPatch[key] = value;
        }
    }

    const custom_fields = {
        ...(row.custom_fields ?? {}),
        ...configPatch,
    };

    return {
        ...row,
        ...(profile.gender != null ? { gender: profile.gender } : {}),
        ...(profile.allergies != null ? { allergies: profile.allergies } : {}),
        ...(profile.medical_notes != null ? { medical_notes: profile.medical_notes } : {}),
        ...(profile.preferred_name != null ? { preferred_name: profile.preferred_name } : {}),
        ...(profile.special_instructions != null ? { special_instructions: profile.special_instructions } : {}),
        custom_fields,
    };
}

/**
 * Attach canonical child profile config fields from customer_members onto inquiry child rows.
 * Profile facts must not be read from OCM enrollment columns or inquiry_child field_values.
 */
export async function attachCustomerMemberProfileToInquiryChildren<T extends InquiryChildProfileAttachRow>(
    supabase: SupabaseClient,
    orgId: string,
    rows: T[],
): Promise<T[]> {
    if (!rows.length) return rows;

    const memberIds = [
        ...new Set(
            rows
                .map((row) => trimMemberId(row.customer_member_id))
                .filter((id): id is string => Boolean(id)),
        ),
    ];
    if (!memberIds.length) return rows;

    const profileByMemberId = await loadCustomerMemberProfileFieldsByMemberId(supabase, orgId, memberIds);

    return rows.map((row) => {
        const memberId = trimMemberId(row.customer_member_id);
        if (!memberId) return row;
        return mergeProfileOntoRow(row, profileByMemberId.get(memberId));
    });
}

/** Pure merge helper for tests. */
export function mergeCustomerMemberProfileOntoInquiryChildRow<T extends InquiryChildProfileAttachRow>(
    row: T,
    profile: CustomerMemberProfileFieldsRow | undefined,
): T {
    return mergeProfileOntoRow(row, profile);
}
