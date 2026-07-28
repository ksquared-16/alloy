/**
 * Forms / Documents — relationship leaf and collection binding provider seeds.
 *
 * Adapts platform contact-role and collection sources (same lineage as queue rows)
 * with Forms-specific capability filters — not a manually maintained catalog.
 *
 * @see web/lib/fields/canonicalQueueRowProviderDerivation.ts
 */

import type {
    CanonicalDataProvider,
    CanonicalDataProviderSourceDerivation,
    CanonicalDataValueType,
} from "@/lib/fields/canonicalDataProviderModel";
import {
    contactRoleFieldRefs,
    LAYOUT_EDITOR_CONTACT_ROLES,
    LAYOUT_EDITOR_CONTACT_ROLE_LABELS,
    type LayoutEditorContactRole,
} from "@/lib/layout/layoutEditorContactRoles";
import { QUEUE_ROW_CHILDREN_COLLECTION_FIELD_KEY } from "@/lib/layout/runtime/queueRowChildrenFieldRegistry";
import { platformFieldByRefKey } from "@/lib/fields/platformFieldCatalog";
import { FORMS_RELATIONSHIP_PROVIDER_ROLE_BY_REF } from "@/lib/fields/formsLegacyContactRoleCompatibility";
import { collectionBindingAuthoringEnabledForProvider } from "@/lib/fields/formsRelationshipOperationalSupport";
import { collectableRelationshipDefinitions } from "@/lib/fields/relationship/relationshipDefinitions";

const BOTH: CanonicalDataProvider["availability"] = { pipeline: true, waitlist: true };

/**
 * Native structural collection refs authorable as repeatable Form groups. Configured relationship
 * collections are NOT listed here — they derive from `RELATIONSHIP_DEFINITIONS` (see
 * `docs/platform/core/data/relationship-model.md`). Forms is a consumer, never an owner.
 */
const FORMS_NATIVE_COLLECTION_REFS = ["children", "household_members"] as const;

/** Supported whole-collection bindings for repeatable Form groups — natives + every collectable definition. */
export const FORMS_REPEATABLE_COLLECTION_REFS: readonly string[] = [
    ...FORMS_NATIVE_COLLECTION_REFS,
    ...collectableRelationshipDefinitions().map((d) => d.collection_ref),
];

/** Open by design: a new relationship definition widens this set without a code change. */
export type FormsRepeatableCollectionRef = string;

export type FormsRelationshipRoleKey =
    | "primary"
    | "parents"
    | "billing"
    | "emergency"
    | "secondary";

const FORMS_CONTACT_ROLES: readonly LayoutEditorContactRole[] = LAYOUT_EDITOR_CONTACT_ROLES.filter(
    (role) => role !== "any",
);

function sourceMeta(
    source: NonNullable<CanonicalDataProvider["source"]>["source"],
    sourceModule: string,
): CanonicalDataProviderSourceDerivation {
    return { source, sourceModule };
}

function leafValueType(leafKey: string): CanonicalDataValueType {
    if (leafKey === "email" || leafKey === "phone") return "link";
    return "text";
}

function roleLabel(role: LayoutEditorContactRole): string {
    if (role === "secondary") return "Secondary Contact";
    return LAYOUT_EDITOR_CONTACT_ROLE_LABELS[role];
}

function relationshipLeafProvider(
    manifestRefKey: string,
    relationshipId: string,
    role: FormsRelationshipRoleKey,
    leafKey: string,
    roleDisplay: string,
): CanonicalDataProvider {
    const refKey = `person.contact_role.${role}.${leafKey}`;
    const platform = platformFieldByRefKey(manifestRefKey);
    return {
        refKey,
        label: platform?.label ?? `${roleDisplay} → ${leafKey.replace(/_/g, " ")}`,
        kind: "relationship",
        outputShape: "scalar",
        entityNamespace: "person",
        settingsEntity: "person",
        fieldType: leafKey === "email" ? "email" : leafKey === "phone" ? "phone" : "text",
        valueType: leafValueType(leafKey),
        isSystem: true,
        availability: BOTH,
        relationship: { relationship_id: relationshipId, leaf_key: leafKey },
        source: sourceMeta("contact_role_catalog", "web/lib/layout/layoutEditorContactRoles.ts"),
        resolverOwner: "web/lib/forms/prefill/formsRelationshipPrefillMap.ts",
    };
}

/** Relationship-derived scalar leaves for Forms / Documents authoring. */
export function buildFormsRelationshipProviderSeeds(): CanonicalDataProvider[] {
    const out: CanonicalDataProvider[] = [];
    for (const role of FORMS_CONTACT_ROLES) {
        const refs = contactRoleFieldRefs(role);
        const relationshipId = `person.contact_role.${role}`;
        const display = roleLabel(role);
        const formsRole = role as FormsRelationshipRoleKey;
        out.push(relationshipLeafProvider(refs.name, relationshipId, formsRole, "name", display));
        out.push(relationshipLeafProvider(refs.email, relationshipId, formsRole, "email", display));
        out.push(relationshipLeafProvider(refs.phone, relationshipId, formsRole, "phone", display));
    }
    return out;
}

function wholeCollectionProvider(
    refKey: string,
    collectionRef: FormsRepeatableCollectionRef,
    label: string,
    iterationEntityType: string,
): CanonicalDataProvider {
    return {
        refKey,
        label,
        kind: "collection",
        outputShape: "collection",
        entityNamespace: iterationEntityType === "customer_member" ? "child" : "customer",
        settingsEntity: iterationEntityType,
        isSystem: true,
        availability: BOTH,
        source: sourceMeta(
            collectionRef === "children" ? "children_collection_registry" : "field_definitions",
            collectionRef === "children"
                ? "web/lib/layout/runtime/queueRowChildrenFieldRegistry.ts"
                : "web/lib/fields/canonicalFormsRelationshipProviderDerivation.ts",
        ),
        resolverOwner: "web/lib/forms/prefill/formsCollectionPrefill.ts",
        collectionProjection: { collection_ref: collectionRef, projection: "items" },
    };
}

/**
 * Whole-collection providers bound to repeatable Form groups (not scalar picker).
 *
 * Two native structural collections, then ONE provider per collectable relationship definition —
 * derived, never hand-authored. Adding a relationship definition row makes it bindable in Forms with
 * no edit here. Previously only `parents_guardians` was listed, so `emergency_contacts` and
 * `authorized_pickups` were unreachable from Forms authoring despite being registered providers.
 */
export function buildFormsCollectionBindingSeeds(): CanonicalDataProvider[] {
    return [
        wholeCollectionProvider(
            QUEUE_ROW_CHILDREN_COLLECTION_FIELD_KEY,
            "children",
            "Children",
            "customer_member",
        ),
        wholeCollectionProvider(
            "household.members",
            "household_members",
            "Household Members",
            "customer_member",
        ),
        ...collectableRelationshipDefinitions().map((def) =>
            wholeCollectionProvider(def.provider_ref, def.collection_ref, def.label, def.item_entity_type),
        ),
    ];
}

/** Collection providers eligible for repeatable-section authoring (dedicated selector — not scalar picker). */
export function buildFormsAuthorableCollectionBindingSeeds(): CanonicalDataProvider[] {
    return buildFormsCollectionBindingSeeds().filter((p) => collectionBindingAuthoringEnabledForProvider(p.refKey));
}

export function findFormsCollectionBindingProvider(refKey: string): CanonicalDataProvider | undefined {
    return buildFormsCollectionBindingSeeds().find((p) => p.refKey === refKey.trim());
}

export function findFormsRelationshipProvider(refKey: string): CanonicalDataProvider | undefined {
    return buildFormsRelationshipProviderSeeds().find((p) => p.refKey === refKey.trim());
}

export function formsRelationshipRoleFromProvider(provider: CanonicalDataProvider): FormsRelationshipRoleKey | null {
    const mapped = FORMS_RELATIONSHIP_PROVIDER_ROLE_BY_REF[provider.refKey];
    if (mapped) return mapped;
    const id = provider.relationship?.relationship_id ?? "";
    const m = /^person\.contact_role\.(.+)$/.exec(id);
    if (!m?.[1]) return null;
    const role = m[1];
    if (role === "parents" || role === "primary" || role === "billing" || role === "emergency" || role === "secondary") {
        return role;
    }
    return null;
}
