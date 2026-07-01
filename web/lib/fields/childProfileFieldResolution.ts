/**
 * Canonical child profile field resolution (Phase 2).
 *
 * Profile facts live on customer_members (+ field_values for config keys).
 * Enrollment participation facts live on opportunity_customer_members (inquiry_child grain).
 */

import { CUSTOMER_MEMBER_CONFIG_FIELD_KEYS } from "@/lib/fields/customerMemberFieldRegistry";
import type { InquiryChildCompletionSnapshot } from "@/lib/completion/requirementValidationTypes";

/** Profile fields owned by customer_member — not OCM enrollment columns. */
export const CUSTOMER_MEMBER_PROFILE_RESOLUTION_FIELDS = [
    "first_name",
    "last_name",
    "dob",
    "date_of_birth",
    "preferred_name",
    "gender",
    "allergies",
    "medical_notes",
    "special_instructions",
] as const;

export type CustomerMemberProfileResolutionField = (typeof CUSTOMER_MEMBER_PROFILE_RESOLUTION_FIELDS)[number];

const PROFILE_FIELD_SET = new Set<string>(CUSTOMER_MEMBER_PROFILE_RESOLUTION_FIELDS);

const CONFIG_PROFILE_SET = new Set<string>(CUSTOMER_MEMBER_CONFIG_FIELD_KEYS);

/** Rule / layout field_key → customer_member storage key. */
export function normalizeCustomerMemberProfileFieldKey(fieldKey: string): CustomerMemberProfileResolutionField | null {
    const key = fieldKey.trim();
    if (key === "date_of_birth") return "dob";
    if (PROFILE_FIELD_SET.has(key)) return key as CustomerMemberProfileResolutionField;
    return null;
}

export function isCustomerMemberProfileResolutionField(fieldKey: string): boolean {
    return normalizeCustomerMemberProfileFieldKey(fieldKey) != null;
}

function readCustomField(row: InquiryChildCompletionSnapshot, key: string): unknown {
    const custom = row.custom_fields;
    if (custom && typeof custom === "object" && !Array.isArray(custom)) {
        return (custom as Record<string, unknown>)[key];
    }
    return undefined;
}

/**
 * Resolve a child profile value from a completion/drawer inquiry child row.
 * Profile data must come from customer_member grain fields on the snapshot — never OCM enrollment columns.
 */
export function resolveChildProfileFieldValue(
    row: InquiryChildCompletionSnapshot,
    fieldKey: string
): unknown {
    const normalized = normalizeCustomerMemberProfileFieldKey(fieldKey);
    if (!normalized) return undefined;

    switch (normalized) {
        case "first_name":
            return row.first_name ?? null;
        case "last_name":
            return row.last_name ?? null;
        case "dob":
        case "date_of_birth":
            return row.dob ?? row.date_of_birth ?? null;
        case "preferred_name":
            return row.preferred_name ?? readCustomField(row, "preferred_name") ?? null;
        case "gender":
            return row.gender ?? readCustomField(row, "gender") ?? null;
        case "allergies":
            return row.allergies ?? readCustomField(row, "allergies") ?? null;
        case "medical_notes":
            return row.medical_notes ?? readCustomField(row, "medical_notes") ?? null;
        case "special_instructions":
            return row.special_instructions ?? readCustomField(row, "special_instructions") ?? null;
        default:
            return null;
    }
}

export function isConfigProfileFieldKey(fieldKey: string): boolean {
    return CONFIG_PROFILE_SET.has(fieldKey.trim());
}
