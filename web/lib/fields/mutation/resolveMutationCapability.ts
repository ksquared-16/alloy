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
import {
    isPersonChildRelationshipConfigFieldKey,
    isPersonChildRelationshipNativeColumnKey,
    PERSON_CHILD_RELATIONSHIP_ENTITY_TYPE,
} from "@/lib/fields/personChildRelationship/personChildRelationshipFieldRegistry";
import { partitionPersonChildRelationshipPatchBody } from "@/lib/fields/personChildRelationship/personChildRelationshipPatch";

export {
    applyCustomerMemberMutationPatch,
    buildCustomerMemberPatchBodyFromFieldKeys,
    customerMemberNativeSnapshotSelectColumns,
    nativeProfileValuesFromRecord,
};

export type MutationStorageClass = "native" | "config";

export type MutationEntityType = typeof CUSTOMER_MEMBER_ENTITY_TYPE | typeof PERSON_CHILD_RELATIONSHIP_ENTITY_TYPE;

export type MutationCapability = {
    provider_ref: string;
    canonical_ref: CanonicalRegistryRef;
    entity_type: MutationEntityType;
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
    if (!canonical) return null;

    if (canonical.entity_type === PERSON_CHILD_RELATIONSHIP_ENTITY_TYPE) {
        const relFieldKey = canonical.field_key.trim();
        if (isPersonChildRelationshipNativeColumnKey(relFieldKey) && ["relationship_type", "priority", "status"].includes(relFieldKey)) {
            return {
                provider_ref: trimmed,
                canonical_ref: canonical,
                entity_type: PERSON_CHILD_RELATIONSHIP_ENTITY_TYPE,
                field_key: relFieldKey,
                storage_class: "native",
                patch_key: relFieldKey,
                writable: true,
            };
        }
        if (isPersonChildRelationshipConfigFieldKey(relFieldKey)) {
            return {
                provider_ref: trimmed,
                canonical_ref: canonical,
                entity_type: PERSON_CHILD_RELATIONSHIP_ENTITY_TYPE,
                field_key: relFieldKey,
                storage_class: "config",
                patch_key: relFieldKey,
                writable: true,
            };
        }
        return null;
    }


    if (canonical.entity_type !== CUSTOMER_MEMBER_ENTITY_TYPE) return null;

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
    if (capability.entity_type === PERSON_CHILD_RELATIONSHIP_ENTITY_TYPE) {
        const { native, config } = partitionPersonChildRelationshipPatchBody({ [capability.patch_key]: value });
        const part = capability.storage_class === "native" ? native : config;
        if (!Object.prototype.hasOwnProperty.call(part, capability.patch_key)) {
            return { ok: false, reason: "Value could not be normalized for this relationship field." };
        }
        return { ok: true, value: part[capability.patch_key] };
    }
    const validated = validateCustomerMemberPatchBody({ [capability.patch_key]: value });
    if (!validated.ok) return { ok: false, reason: validated.error };
    const part = capability.storage_class === "native" ? validated.native : validated.config;
    if (!Object.prototype.hasOwnProperty.call(part, capability.patch_key)) {
        return { ok: false, reason: "Value could not be normalized for this field." };
    }
    return { ok: true, value: part[capability.patch_key] };
}
