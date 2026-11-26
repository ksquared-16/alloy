/**
 * Canonical semantic shape per contact role — governs singular leaf vs collection.
 */

import type { FormsRelationshipRoleKey } from "@/lib/fields/canonicalFormsRelationshipProviderDerivation";

export type RelationshipSemanticShape =
    | "singular"
    | "optional_singular"
    | "collection"
    | "contextual_collection"
    | "unsupported";

export type RelationshipRoleSemanticDefinition = {
    role: FormsRelationshipRoleKey;
    shape: RelationshipSemanticShape;
    /** True when platform stores an enforced singular designation (not first-match). */
    singularDesignationExists: boolean;
    contextRequired?: string;
    collectionProviderRefKey?: string;
    pickerEnabledInP3A: boolean;
};

/**
 * Repository-evidence classification (P3A).
 * Primary: household `customer_persons` primary link + opportunity `primary_person_id`.
 * Others: no enforced singular designation — plural collections only.
 */
export const RELATIONSHIP_ROLE_SEMANTICS: Readonly<Record<FormsRelationshipRoleKey, RelationshipRoleSemanticDefinition>> = {
    primary: {
        role: "primary",
        shape: "optional_singular",
        singularDesignationExists: true,
        pickerEnabledInP3A: true,
    },
    secondary: {
        role: "secondary",
        shape: "collection",
        singularDesignationExists: false,
        collectionProviderRefKey: "person.contact_role.secondary",
        pickerEnabledInP3A: false,
    },
    parents: {
        role: "parents",
        shape: "collection",
        singularDesignationExists: false,
        collectionProviderRefKey: "person.contact_role.parents",
        pickerEnabledInP3A: false,
    },
    emergency: {
        role: "emergency",
        shape: "contextual_collection",
        singularDesignationExists: false,
        contextRequired: "customer_member_id for child-scoped emergency",
        collectionProviderRefKey: "person.contact_role.emergency",
        pickerEnabledInP3A: false,
    },
    billing: {
        role: "billing",
        shape: "collection",
        singularDesignationExists: false,
        collectionProviderRefKey: "person.contact_role.billing",
        pickerEnabledInP3A: false,
    },
};

export function semanticShapeForRole(role: FormsRelationshipRoleKey): RelationshipRoleSemanticDefinition {
    return RELATIONSHIP_ROLE_SEMANTICS[role];
}

export function roleSupportsSingularRelationshipLeaf(role: FormsRelationshipRoleKey): boolean {
    const def = RELATIONSHIP_ROLE_SEMANTICS[role];
    return def.singularDesignationExists && (def.shape === "singular" || def.shape === "optional_singular");
}
