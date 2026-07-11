/**
 * Canonical collection provider registry — source- and consumer-neutral identity.
 *
 * Defines whole-collection provider metadata. Consumer modules (Forms, Queue Rows,
 * Processing) derive authoring enablement and presentation separately.
 */

export type CanonicalCollectionProviderKind = "household_membership" | "relationship_role" | "document" | "communication" | "work";

export type CanonicalCollectionProviderDefinition = {
    /** Canonical provider refKey — stable platform identity. */
    refKey: string;
    /** Internal collection_ref slug used in projection metadata. */
    collectionRef: string;
    label: string;
    itemEntityType: string;
    providerKind: CanonicalCollectionProviderKind;
    /** Source entity grain for resolution (e.g. customer household). */
    sourceEntityType: string;
    /** Required launch/resolution context keys — not Forms field IDs. */
    requiredContextKeys: readonly string[];
    /** Resolver module owner for read resolution. */
    resolverOwner: string;
    /** Whether inactive items are excluded at resolution time. */
    activeOnly: boolean;
    /** Stable item identity field policy. */
    itemIdentityField: "id";
    /** Default sort policy for resolved items. */
    orderingPolicy: "display_name" | "created_at";
    /** Relationship role key when providerKind is relationship_role. */
    relationshipRoleKey?: string;
};

const CHILDREN: CanonicalCollectionProviderDefinition = {
    refKey: "children",
    collectionRef: "children",
    label: "Children",
    itemEntityType: "customer_member",
    providerKind: "household_membership",
    sourceEntityType: "customer",
    requiredContextKeys: ["customer_id"],
    resolverOwner: "web/lib/fields/relationship/canonicalCollectionResolver.ts",
    activeOnly: true,
    itemIdentityField: "id",
    orderingPolicy: "display_name",
};

const HOUSEHOLD_MEMBERS: CanonicalCollectionProviderDefinition = {
    refKey: "household.members",
    collectionRef: "household_members",
    label: "Household Members",
    itemEntityType: "customer_member",
    providerKind: "household_membership",
    sourceEntityType: "customer",
    requiredContextKeys: ["customer_id"],
    resolverOwner: "web/lib/fields/relationship/canonicalCollectionResolver.ts",
    activeOnly: true,
    itemIdentityField: "id",
    orderingPolicy: "display_name",
};

const PARENTS_GUARDIANS: CanonicalCollectionProviderDefinition = {
    refKey: "person.contact_role.parents",
    collectionRef: "parents_guardians",
    label: "Parents / Guardians",
    itemEntityType: "person",
    providerKind: "relationship_role",
    sourceEntityType: "customer",
    requiredContextKeys: ["customer_id"],
    resolverOwner: "web/lib/fields/relationship/canonicalCollectionResolver.ts",
    activeOnly: false,
    itemIdentityField: "id",
    orderingPolicy: "display_name",
    relationshipRoleKey: "parents",
};

const REGISTRY: readonly CanonicalCollectionProviderDefinition[] = [
    CHILDREN,
    HOUSEHOLD_MEMBERS,
    PARENTS_GUARDIANS,
];

const BY_REF = new Map(REGISTRY.map((p) => [p.refKey, p]));

export function listCanonicalCollectionProviders(): readonly CanonicalCollectionProviderDefinition[] {
    return REGISTRY;
}

export function findCanonicalCollectionProvider(refKey: string): CanonicalCollectionProviderDefinition | undefined {
    return BY_REF.get(refKey.trim());
}

export function collectionRequiredContextForProvider(refKey: string): readonly string[] {
    return findCanonicalCollectionProvider(refKey)?.requiredContextKeys ?? ["customer_id"];
}

export function collectionItemEntityTypeForProvider(refKey: string): string | undefined {
    return findCanonicalCollectionProvider(refKey)?.itemEntityType;
}

export function isRegisteredCanonicalCollectionProvider(refKey: string): boolean {
    return BY_REF.has(refKey.trim());
}
