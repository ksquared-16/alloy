import type { FormsRelationshipRoleKey } from "@/lib/fields/canonicalFormsRelationshipProviderDerivation";

export type RelationshipRoleResolutionPolicy = {
    role: FormsRelationshipRoleKey;
    relationshipId: string;
    allowedSourceEntities: ReadonlySet<"customer" | "opportunity" | "customer_member">;
    requiresCustomerMemberContext: boolean;
    singularScalarOnly: boolean;
    rejectPluralForScalar: boolean;
};

export const RELATIONSHIP_ROLE_RESOLUTION_POLICIES: Readonly<Record<FormsRelationshipRoleKey, RelationshipRoleResolutionPolicy>> = {
    primary: {
        role: "primary",
        relationshipId: "person.contact_role.primary",
        allowedSourceEntities: new Set(["customer", "opportunity", "customer_member"]),
        requiresCustomerMemberContext: false,
        singularScalarOnly: true,
        rejectPluralForScalar: true,
    },
    secondary: {
        role: "secondary",
        relationshipId: "person.contact_role.secondary",
        allowedSourceEntities: new Set(["customer", "opportunity"]),
        requiresCustomerMemberContext: false,
        singularScalarOnly: true,
        rejectPluralForScalar: true,
    },
    parents: {
        role: "parents",
        relationshipId: "person.contact_role.parents",
        allowedSourceEntities: new Set(["customer", "opportunity"]),
        requiresCustomerMemberContext: false,
        singularScalarOnly: true,
        rejectPluralForScalar: true,
    },
    emergency: {
        role: "emergency",
        relationshipId: "person.contact_role.emergency",
        allowedSourceEntities: new Set(["customer", "customer_member", "opportunity"]),
        requiresCustomerMemberContext: false,
        singularScalarOnly: true,
        rejectPluralForScalar: true,
    },
    billing: {
        role: "billing",
        relationshipId: "person.contact_role.billing",
        allowedSourceEntities: new Set(["customer", "opportunity", "customer_member"]),
        requiresCustomerMemberContext: false,
        singularScalarOnly: true,
        rejectPluralForScalar: true,
    },
};

export function relationshipRoleFromRelationshipId(relationshipId: string): FormsRelationshipRoleKey | null {
    const id = relationshipId.trim();
    for (const policy of Object.values(RELATIONSHIP_ROLE_RESOLUTION_POLICIES)) {
        if (policy.relationshipId === id) return policy.role;
    }
    const suffix = id.split(".").pop();
    if (
        suffix === "primary"
        || suffix === "secondary"
        || suffix === "parents"
        || suffix === "emergency"
        || suffix === "billing"
    ) {
        return suffix;
    }
    return null;
}

export function policyForRelationshipId(relationshipId: string): RelationshipRoleResolutionPolicy | null {
    const role = relationshipRoleFromRelationshipId(relationshipId);
    return role ? RELATIONSHIP_ROLE_RESOLUTION_POLICIES[role] : null;
}
