/**
 * Canonical field mutation capability — resolves provider refs to writable PATCH targets.
 * Consumes existing registries; does not duplicate field ownership or storage truth.
 */

import {
    applyCustomerMemberMutationPatch,
    buildCustomerMemberPatchBodyFromFieldKeys,
    customerMemberNativeSnapshotSelectColumns,
    nativeProfileValuesFromRecord,
    validateCustomerMemberPatchBody,
} from "@/lib/admin/customerMemberPatch";
import type { CanonicalRegistryRef } from "@/lib/fields/fieldRegistryReferenceMatrix";
import { providerRefToCanonicalRef } from "@/lib/fields/fieldRegistryReferenceMatrix";
import {
    CUSTOMER_MEMBER_ENTITY_TYPE,
    isCustomerMemberConfigFieldKey,
    isCustomerMemberNativeColumnKey,
} from "@/lib/fields/customerMemberFieldRegistry";
import { CUSTOMER_MEMBER_NATIVE_PATCH_KEYS } from "@/lib/fields/partitionCustomerMemberPatchBody";

export {
    applyCustomerMemberMutationPatch,
    buildCustomerMemberPatchBodyFromFieldKeys,
    customerMemberNativeSnapshotSelectColumns,
    nativeProfileValuesFromRecord,
};

export type MutationStorageClass = "native" | "config";

export type MutationCapability = {
    provider_ref: string;
    canonical_ref: CanonicalRegistryRef;
    entity_type: typeof CUSTOMER_MEMBER_ENTITY_TYPE;
    field_key: string;
    storage_class: MutationStorageClass;
    patch_key: string;
    writable: true;
};

const NATIVE_PATCH_SET = new Set<string>(CUSTOMER_MEMBER_NATIVE_PATCH_KEYS);

export function resolveMutationCapability(providerRef: string): MutationCapability | null {
    const trimmed = providerRef.trim();
    if (!trimmed) return null;

    const canonical = providerRefToCanonicalRef(trimmed);
    if (!canonical || canonical.entity_type !== CUSTOMER_MEMBER_ENTITY_TYPE) return null;

    const fieldKey = canonical.field_key.trim();
    if (isCustomerMemberNativeColumnKey(fieldKey) && NATIVE_PATCH_SET.has(fieldKey)) {
        return {
            provider_ref: trimmed,
            canonical_ref: canonical,
            entity_type: CUSTOMER_MEMBER_ENTITY_TYPE,
            field_key: fieldKey,
            storage_class: "native",
            patch_key: fieldKey,
            writable: true,
        };
    }
    if (isCustomerMemberConfigFieldKey(fieldKey)) {
        return {
            provider_ref: trimmed,
            canonical_ref: canonical,
            entity_type: CUSTOMER_MEMBER_ENTITY_TYPE,
            field_key: fieldKey,
            storage_class: "config",
            patch_key: fieldKey,
            writable: true,
        };
    }
    return null;
}

export function validateMutationValue(
    capability: MutationCapability,
    value: unknown,
): { ok: true; value: unknown } | { ok: false; reason: string } {
    const validated = validateCustomerMemberPatchBody({ [capability.patch_key]: value });
    if (!validated.ok) return { ok: false, reason: validated.error };
    const part = capability.storage_class === "native" ? validated.native : validated.config;
    if (!Object.prototype.hasOwnProperty.call(part, capability.patch_key)) {
        return { ok: false, reason: "Value could not be normalized for this field." };
    }
    return { ok: true, value: part[capability.patch_key] };
}
