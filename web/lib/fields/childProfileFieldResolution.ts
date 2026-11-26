/**
 * Canonical child profile field resolution (Phase 2).
 *
 * Profile facts live on customer_members (+ field_values for config keys).
 * Enrollment participation facts live on opportunity_customer_members (inquiry_child grain).
 */

import { CUSTOMER_MEMBER_CONFIG_FIELD_KEYS } from "@/lib/fields/customerMemberFieldRegistry";
import type { InquiryChildCompletionSnapshot } from "@/lib/completion/requirementValidationTypes";

/**
 * NATIVE customer_members columns. These are a genuine exception — they are columns, not manifest
 * rows, so they are listed here and nowhere else.
 */
export const CUSTOMER_MEMBER_NATIVE_PROFILE_FIELDS = ["first_name", "last_name", "dob", "date_of_birth"] as const;

/**
 * Every profile field owned by customer_member: the native columns above, plus every CONFIG field
 * the canonical manifest declares.
 *
 * The config half used to be hand-listed here as well — the fifth parallel list a new durable child
 * fact had to be added to, and the one that silently kept a manifest field out of the Focus Panel
 * even after the other four derived. It derives now. @see lib/fields/customerMemberProfileSurfaces
 */
export const CUSTOMER_MEMBER_PROFILE_RESOLUTION_FIELDS = [
    ...CUSTOMER_MEMBER_NATIVE_PROFILE_FIELDS,
    ...CUSTOMER_MEMBER_CONFIG_FIELD_KEYS,
] as const;

export type CustomerMemberProfileResolutionField = (typeof CUSTOMER_MEMBER_PROFILE_RESOLUTION_FIELDS)[number];

const PROFILE_FIELD_SET = new Set<string>(CUSTOMER_MEMBER_PROFILE_RESOLUTION_FIELDS);

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
        default:
            break;
    }

    // Every CONFIG field resolves the same way — a snapshot column if the query projected one,
    // otherwise the field_values bag. Enumerating the five original keys here was the SEVENTH
    // hand-maintained surface, and the one that returned `null` (a real "no value") rather than
    // `undefined` for a manifest field it had never heard of.
    if (isConfigProfileFieldKey(normalized)) {
        const projected = (row as unknown as Record<string, unknown>)[normalized];
        return projected ?? readCustomField(row, normalized) ?? null;
    }

    return null;
}

const CONFIG_PROFILE_SET = new Set<string>(CUSTOMER_MEMBER_CONFIG_FIELD_KEYS);

export function isConfigProfileFieldKey(fieldKey: string): boolean {
    return CONFIG_PROFILE_SET.has(fieldKey.trim());
}
