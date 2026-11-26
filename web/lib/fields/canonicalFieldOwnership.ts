/**
 * Canonical field ownership — which entity owns which business facts.
 *
 * Phase 1 guardrail: profile fields on customer_member; enrollment on inquiry_child;
 * case facts on opportunity; identity on person.
 */

import {
    CUSTOMER_MEMBER_CONFIG_FIELD_KEYS,
    isCustomerMemberConfigFieldKey,
} from "@/lib/fields/customerMemberFieldRegistry";
import {
    INQUIRY_CHILD_NATIVE_OCM_FIELD_KEYS,
    isInquiryChildNativeFieldKey,
} from "@/lib/fields/inquiryChildFieldRegistry";
import { isEnrollmentAssignmentFieldKeyOnCustomerMember } from "@/lib/fields/canonicalFieldProjection";

/** field_definitions entity_type → ownership summary (documentation + guards). */
export const CANONICAL_FIELD_OWNER_ENTITIES = {
    person: "Human identity and contact facts (adults, staff, linked child identity)",
    customer: "Household / account shell facts",
    customer_member: "Durable child profile facts (name, DOB, health config fields)",
    opportunity: "Enrollment case / family-level process facts",
    inquiry_child: "Child participation / enrollment facts on a case (OCM grain)",
    person_child_relationship: "Person ↔ Child relationship instance facts (roles, kinship, edge attributes)",
    field_definitions: "Configurable field metadata (labels, types, options)",
    status_definitions: "Status vocabulary (not field values)",
} as const;

export type CanonicalFieldOwnerEntity = keyof typeof CANONICAL_FIELD_OWNER_ENTITIES;

/** Native + config keys that belong on customer_member (child profile grain). */
export const CUSTOMER_MEMBER_PROFILE_FIELD_KEYS = [
    "first_name",
    "last_name",
    "dob",
    "date_of_birth",
    "display_name",
    "preferred_name",
    ...CUSTOMER_MEMBER_CONFIG_FIELD_KEYS,
] as const;

const PROFILE_KEY_SET = new Set<string>(CUSTOMER_MEMBER_PROFILE_FIELD_KEYS);

/** Layout child.* aliases → canonical customer_member field_key. */
export const CUSTOMER_MEMBER_LAYOUT_FIELD_KEY_ALIASES: Readonly<Record<string, string>> = {
    date_of_birth: "dob",
};

/** Enrollment keys that must not be registered or written on customer_member. */
const ENROLLMENT_KEY_SET = new Set<string>(INQUIRY_CHILD_NATIVE_OCM_FIELD_KEYS);

export function isCustomerMemberProfileFieldKey(fieldKey: string): boolean {
    const key = fieldKey.trim();
    if (PROFILE_KEY_SET.has(key)) return true;
    const aliased = CUSTOMER_MEMBER_LAYOUT_FIELD_KEY_ALIASES[key];
    return aliased != null && PROFILE_KEY_SET.has(aliased);
}

export function isInquiryChildEnrollmentFieldKey(fieldKey: string): boolean {
    return isInquiryChildNativeFieldKey(fieldKey);
}

/**
 * Returns an error message when a field_definition would be registered on the wrong entity.
 * System seeds and migrations may bypass; operator custom field POST should enforce.
 */
export function validateFieldDefinitionOwnership(entityType: string, fieldKey: string): string | null {
    const entity = entityType.trim().toLowerCase();
    const key = fieldKey.trim().toLowerCase();

    if (entity === "inquiry_child" && isCustomerMemberProfileFieldKey(key)) {
        return `Profile field '${key}' belongs on entity_type customer_member, not inquiry_child`;
    }
    if (entity === "customer_member" && (ENROLLMENT_KEY_SET.has(key) || isEnrollmentAssignmentFieldKeyOnCustomerMember(key))) {
        return `Enrollment field '${key}' belongs on entity_type inquiry_child, not customer_member`;
    }
    return null;
}

/** Keys in a PATCH body that are child profile fields and must not target OCM / inquiry_child routes. */
export function findCustomerMemberProfileKeysInPatch(body: Record<string, unknown>): string[] {
    return Object.keys(body).filter(
        (k) => !k.startsWith("_") && body[k] !== undefined && isCustomerMemberProfileFieldKey(k)
    );
}

/** Resolve layout child.* fieldKey to canonical customer_member field_key when applicable. */
export function customerMemberFieldKeyFromLayoutChildField(fieldKey: string): string | null {
    const key = fieldKey.trim();
    if (isCustomerMemberProfileFieldKey(key)) {
        return CUSTOMER_MEMBER_LAYOUT_FIELD_KEY_ALIASES[key] ?? key;
    }
    return null;
}
