/**
 * Legacy Forms contact bindings ↔ canonical relationship role lineage.
 *
 * Flattened guardian.* keys remain load-only; role-specific relationship leaves
 * use canonical provider refKeys without duplicating picker entries.
 */

import type { CanonicalRegistryRef } from "@/lib/fields/fieldRegistryReferenceMatrix";
import type { FormFieldSourceRelationship } from "@/lib/forms/schema";
import type { FormsRelationshipRoleKey } from "@/lib/fields/canonicalFormsRelationshipProviderDerivation";

/** Platform person scalars replaced by role-specific relationship leaves in new authoring. */
export const FORMS_AMBIGUOUS_PERSON_SCALAR_REFS = new Set([
    "person.email",
    "person.phone",
    "person.first_name",
    "person.last_name",
    "person.full_name",
]);

export function isFormsAmbiguousPersonScalarRef(refKey: string): boolean {
    return FORMS_AMBIGUOUS_PERSON_SCALAR_REFS.has(refKey.trim());
}

/** Legacy operational keys that collapse person.email without role — load/hydrate only in picker. */
export const FORMS_LEGACY_AMBIGUOUS_CONTACT_SYSTEM_IDS = new Set([
    "guardian_first_name",
    "guardian_last_name",
    "guardian_email",
    "guardian_phone",
]);

/** Canonical provider refKey → relationship role (distinct roles must not collapse). */
export const FORMS_RELATIONSHIP_PROVIDER_ROLE_BY_REF: Readonly<Record<string, FormsRelationshipRoleKey>> = {
    "person.contact_role.primary.name": "primary",
    "person.contact_role.primary.email": "primary",
    "person.contact_role.primary.phone": "primary",
    "person.contact_role.parents.name": "parents",
    "person.contact_role.parents.email": "parents",
    "person.contact_role.parents.phone": "parents",
    "person.contact_role.secondary.name": "secondary",
    "person.contact_role.secondary.email": "secondary",
    "person.contact_role.secondary.phone": "secondary",
    "person.contact_role.billing.name": "billing",
    "person.contact_role.billing.email": "billing",
    "person.contact_role.billing.phone": "billing",
    "person.contact_role.emergency.name": "emergency",
    "person.contact_role.emergency.email": "emergency",
    "person.contact_role.emergency.phone": "emergency",
};

/**
 * LEGACY BRIDGE — canonical collection provider ref → legacy Forms role axis, where one exists.
 *
 * The legacy axis (`primary/parents/billing/emergency/secondary`) predates and does not correspond to
 * the canonical `operational_role_key`. Only `parents` has a role-specific manifest column set, so it
 * is the only entry. A NEW relationship definition needs NO entry here: with no mapping, leaf values
 * resolve from the generic person columns, which is the correct behaviour. Do not grow this map —
 * collapse the legacy axis instead (gap #7 in docs/platform/core/data/relationship-model.md).
 */
export const FORMS_LEGACY_ROLE_BY_COLLECTION_PROVIDER_REF: Readonly<Record<string, FormsRelationshipRoleKey>> = {
    "person.contact_role.parents": "parents",
};

/** Whether a legacy system field id should be hidden when role-specific relationship leaf exists. */
export function isLegacyAmbiguousContactSystemFieldId(systemFieldId: string): boolean {
    return FORMS_LEGACY_AMBIGUOUS_CONTACT_SYSTEM_IDS.has(systemFieldId.trim());
}

/** Infer role from persisted relationship metadata or provider refKey. */
export function formsRelationshipRoleFromSource(
    relationship: FormFieldSourceRelationship | undefined,
    providerRefKey?: string | null,
): FormsRelationshipRoleKey | null {
    const role = relationship?.role?.trim();
    if (
        role === "primary"
        || role === "parents"
        || role === "billing"
        || role === "emergency"
        || role === "secondary"
    ) {
        return role;
    }
    const ref = (relationship?.provider_ref_key ?? providerRefKey ?? "").trim();
    return FORMS_RELATIONSHIP_PROVIDER_ROLE_BY_REF[ref] ?? null;
}

/** Dedupe key for picker — relationship leaves and legacy aliases must not double-list. */
export function formsRelationshipPickerDedupeKey(providerRefKey: string): string {
    return `relationship:${providerRefKey.trim()}`;
}

/** Legacy guardian flat binding canonical ref — ambiguous role (not primary/billing/etc.). */
export function legacyGuardianFlatCanonicalRef(fieldKey: string): CanonicalRegistryRef | null {
    switch (fieldKey.trim()) {
        case "guardian_email":
            return { entity_type: "person", field_key: "email" };
        case "guardian_phone":
            return { entity_type: "person", field_key: "phone" };
        case "guardian_first_name":
            return { entity_type: "person", field_key: "first_name" };
        case "guardian_last_name":
            return { entity_type: "person", field_key: "last_name" };
        default:
            return null;
    }
}
