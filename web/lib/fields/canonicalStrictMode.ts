/**
 * Canonical data strict-mode guards (Phase 2).
 *
 * Lightweight assertions for tests and optional runtime checks — not a parallel catalog.
 */

import { findCustomerMemberProfileKeysInPatch, validateFieldDefinitionOwnership } from "@/lib/fields/canonicalFieldOwnership";
import { rejectLegacyTextStatusPatch } from "@/lib/fields/canonicalLegacyStatusWrite";
import { isCustomerMemberProfileResolutionField } from "@/lib/fields/childProfileFieldResolution";
import { INQUIRY_CHILD_NATIVE_OCM_FIELD_KEYS } from "@/lib/fields/inquiryChildFieldRegistry";
import { findDuplicateFieldDefinitionKeys } from "@/lib/fields/canonicalNativeColumnParity";

export { findDuplicateFieldDefinitionKeys };

/** Profile field keys that must not be read/written on OCM PATCH bodies. */
export function assertNoChildProfileKeysOnOcmPatch(body: Record<string, unknown>): string | null {
    const keys = findCustomerMemberProfileKeysInPatch(body);
    if (keys.length === 0) return null;
    return `Child profile fields must not target OCM: ${keys.join(", ")}`;
}

export function assertNoLegacyTextStatusPatch(body: Record<string, unknown>): string | null {
    return rejectLegacyTextStatusPatch(body);
}

export function assertFieldDefinitionOwnership(entityType: string, fieldKey: string): string | null {
    return validateFieldDefinitionOwnership(entityType, fieldKey);
}

/**
 * Lifecycle binding must not route profile fields through inquiry_child / ocm_field.
 * Enrollment fields must use inquiry_child value_source with ocm_field.
 */
export function assertLifecycleBindingGrain(input: {
    rule_id: string;
    value_source: string;
    field_key: string | null;
    ocm_field?: string;
    customer_member_field?: string;
}): string | null {
    const fieldKey = input.field_key ?? "";
    if (input.value_source === "inquiry_child" && isCustomerMemberProfileResolutionField(fieldKey)) {
        return `Rule ${input.rule_id}: profile field ${fieldKey} must use customer_member_profile, not inquiry_child`;
    }
    if (input.value_source === "customer_member_profile") {
        if (INQUIRY_CHILD_NATIVE_OCM_FIELD_KEYS.includes(fieldKey as (typeof INQUIRY_CHILD_NATIVE_OCM_FIELD_KEYS)[number])) {
            return `Rule ${input.rule_id}: enrollment field ${fieldKey} must use inquiry_child, not customer_member_profile`;
        }
        if (!input.customer_member_field) {
            return `Rule ${input.rule_id}: customer_member_profile binding requires customer_member_field`;
        }
    }
    if (input.value_source === "inquiry_child" && !input.ocm_field && fieldKey !== "age_group") {
        return `Rule ${input.rule_id}: inquiry_child binding requires ocm_field`;
    }
    return null;
}
