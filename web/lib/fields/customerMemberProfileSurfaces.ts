/**
 * The child-profile manifest is the OWNER. Every surface derives from it.
 *
 * Adding a durable child fact used to mean editing four hand-maintained lists — the manifest, the
 * layout picker catalog (twice: a row and a ref-key list), the identity surface resolvers, and the
 * inline-save map. Four chances to forget one, and a conformance test that asserted "no picker
 * allowlists" for a set that only held because five keys happened to be enumerated everywhere.
 *
 * The relationship layer already solved the same problem: one definition row, every consumer derived.
 * This is that move for child-profile fields. `CUSTOMER_MEMBER_CONFIG_FIELD_MANIFEST` is the row set;
 * everything here is a projection of it, and `tests/fields/childProfileManifestDerivation.test.ts`
 * fails if a surface stops deriving.
 *
 * EXPLICIT EXCEPTIONS are allowed and named. A field whose surface genuinely differs — gender needs a
 * select bound to an option set; three legacy keys are exposed on the child subject under camelCase
 * property names that predate the manifest — declares that here rather than being quietly special.
 *
 * Pure + deterministic.
 */

import {
    CUSTOMER_MEMBER_CONFIG_FIELD_MANIFEST,
    CUSTOMER_MEMBER_ENTITY_TYPE,
    type CustomerMemberConfigFieldKey,
    type CustomerMemberConfigFieldManifestRow,
} from "./customerMemberFieldRegistry";

/** Layout/picker refKeys live in the `child.*` namespace even though the entity is customer_member. */
export const CHILD_PROFILE_REF_NAMESPACE = "child" as const;

export function childProfileRefKey(fieldKey: string): string {
    return `${CHILD_PROFILE_REF_NAMESPACE}.${fieldKey}`;
}

/** The manifest key a `child.*` ref names, or null when the ref is not a manifest field. */
export function childProfileFieldKeyFromRef(fieldRef: string): CustomerMemberConfigFieldKey | null {
    const trimmed = (fieldRef ?? "").trim();
    const prefix = `${CHILD_PROFILE_REF_NAMESPACE}.`;
    if (!trimmed.startsWith(prefix)) return null;
    const key = trimmed.slice(prefix.length);
    const row = CUSTOMER_MEMBER_CONFIG_FIELD_MANIFEST.find((r) => r.field_key === key);
    return row ? row.field_key : null;
}

/** Every manifest field's refKey, in manifest order. Derived — never hand-listed. */
export const CHILD_PROFILE_REF_KEYS: readonly string[] = CUSTOMER_MEMBER_CONFIG_FIELD_MANIFEST.map((r) =>
    childProfileRefKey(r.field_key)
);

/** `child.<ref>` → manifest field key, for surfaces that save by key. Derived. */
export const CHILD_PROFILE_INLINE_SAVE_MAP: Readonly<Record<string, CustomerMemberConfigFieldKey>> = Object.fromEntries(
    CUSTOMER_MEMBER_CONFIG_FIELD_MANIFEST.map((r) => [childProfileRefKey(r.field_key), r.field_key])
);

/**
 * The property a child subject exposes a manifest field under.
 *
 * The general rule is camelCase of the field key. Three keys predate the manifest and are exposed
 * under names that do not follow it; they are listed rather than made general, because inventing a
 * rule to fit three legacy names would be a worse rule.
 */
const LEGACY_SUBJECT_PROPERTY: Readonly<Record<string, string>> = {
    preferred_name: "preferredName",
    medical_notes: "medicalNotes",
    special_instructions: "specialInstructions",
};

export function childProfileSubjectProperty(fieldKey: string): string {
    return LEGACY_SUBJECT_PROPERTY[fieldKey] ?? fieldKey.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

/**
 * Fields whose CONTROL is not derivable from the manifest's `field_type` alone. `gender` is a select
 * bound to an option set; the option-set key is manifest config, so the exception is about the
 * control's shape, not about the field being special.
 */
export const CHILD_PROFILE_CONTROL_EXCEPTIONS: Readonly<Record<string, string>> = {
    gender: "select bound to the person_gender option set",
};

/** One layout picker row per manifest field, derived. */
export interface DerivedChildProfileCatalogRow {
    refKey: string;
    pickerLabel: string;
    fieldType: string;
    sortOrder: number;
    defEntityType: string;
    defFieldKey: string;
    storageTable: string;
    storageColumn: string;
}

export function deriveChildProfileCatalogRows(): DerivedChildProfileCatalogRow[] {
    return CUSTOMER_MEMBER_CONFIG_FIELD_MANIFEST.map((row: CustomerMemberConfigFieldManifestRow) => ({
        refKey: childProfileRefKey(row.field_key),
        pickerLabel: row.label,
        fieldType: row.field_type,
        sortOrder: row.sort_order,
        // Every manifest field is a field_definitions row on customer_member, stored in field_values.
        // That uniformity is what makes the row derivable at all.
        defEntityType: CUSTOMER_MEMBER_ENTITY_TYPE,
        defFieldKey: row.field_key,
        storageTable: "customer_members",
        storageColumn: "field_values",
    }));
}

/** Health-classified manifest fields — derived, so a privacy rule can be applied by class. */
export const CHILD_PROFILE_HEALTH_REF_KEYS: readonly string[] = CUSTOMER_MEMBER_CONFIG_FIELD_MANIFEST.filter(
    (r) => r.sensitivity === "health"
).map((r) => childProfileRefKey(r.field_key));
