/**
 * Canonical collection provider registry — source- and consumer-neutral identity.
 *
 * Defines whole-collection provider metadata. Consumer modules (Forms, Queue Rows,
 * Processing) derive authoring enablement and presentation separately.
 *
 * ARCHITECTURE: this registry is a PROJECTION, not an owner. The canonical truth for configured
 * relationships is `@/lib/fields/relationship/relationshipDefinitions` (the future
 * `relationship_definitions` table). A collection is ONE projection of a relationship definition —
 * Forms, Conversation Runtime, Configuration Discovery, Processing and BOS must all resolve back to
 * the same definitions rather than treating this registry as a second source of truth.
 */

import {
    RELATIONSHIP_DEFINITIONS,
    relationshipDefinitionForRole,
    type RelationshipDefinition,
} from "@/lib/fields/relationship/relationshipDefinitions";

export type CanonicalCollectionProviderKind = "household_membership" | "relationship_role" | "document" | "communication" | "work" | "health_fact";

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


/**
 * H2 — the four Health fact provider refs.
 *
 * FOUR REFS, NOT ONE, and that is the whole design. A Forms group binds to exactly ONE collection,
 * so an operator authoring an allergy section must not receive medications. All four resolve through
 * the same entity and the same resolver; the ref carries the `fact_kind` filter.
 *
 * Registered only now that M1 has landed. Registering while `allergy_notes` still wrote at
 * enrollment grain would have created the day-one disagreement M1 exists to prevent: a provider
 * whose `sourceEntityType` is `customer_member` beside a system field writing to the episode.
 *
 * H2's guarantees, which Enrollment plans against: these ref values are stable and will not be
 * renamed; `iteration_entity_type` is `person_health_fact` for all four; the subject context key is
 * `customer_member_id` (child grain, per D-H1); and a binding authored before any health data exists
 * resolves to an EMPTY collection rather than an error.
 */
function healthFactProvider(
    refKey: string,
    collectionRef: string,
    label: string,
): CanonicalCollectionProviderDefinition {
    return {
        refKey,
        collectionRef,
        label,
        itemEntityType: "person_health_fact",
        providerKind: "health_fact",
        sourceEntityType: "customer_member",
        requiredContextKeys: ["customer_member_id"],
        resolverOwner: "web/lib/health/healthFactCollectionResolver.ts",
        // status = active only. A superseded fact is history, not a current answer.
        activeOnly: true,
        itemIdentityField: "id",
        orderingPolicy: "created_at",
    };
}

const HEALTH_ALLERGIES = healthFactProvider("health.allergies", "health_allergies", "Allergies");
const HEALTH_CONDITIONS = healthFactProvider("health.conditions", "health_conditions", "Conditions");
const HEALTH_MEDICATIONS = healthFactProvider("health.medications", "health_medications", "Medications");
const HEALTH_IMMUNIZATIONS = healthFactProvider(
    "health.immunizations",
    "health_immunizations",
    "Immunizations",
);

/** The `fact_kind` each ref filters on — the resolver's only per-ref difference. */
export const HEALTH_FACT_KIND_BY_PROVIDER_REF: Readonly<Record<string, string>> = Object.freeze({
    "health.allergies": "allergy",
    "health.conditions": "condition",
    "health.medications": "medication",
    "health.immunizations": "immunization",
});

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

const RESOLVER_OWNER = "web/lib/fields/relationship/canonicalCollectionResolver.ts";

/**
 * NATIVE STRUCTURAL COLLECTIONS — the documented exception to "every collection projects a
 * relationship definition".
 *
 * `children` and `household.members` stay native because they are not relationship EDGES at all.
 * They enumerate the household's own structural membership, resolving directly off `customer_members`
 * (the household composition itself), and they carry no operational role, no role grouping, no apply
 * command, and no scope choice — the three things a relationship definition exists to declare. A
 * relationship definition answers "who is related to this child, in what role, and what command
 * writes it"; household membership answers "what is this household made of". Modelling membership as
 * a role-bearing relationship would invent a fictional role ("is_child_of_household") and route
 * household composition through the relationship write path, which is not where it lives.
 *
 * The rule: a collection is native ONLY if it enumerates structural membership of the anchor entity
 * and has no operational role. Everything else — physician, attorney, case worker, therapist, foster
 * parent, sponsor, and the three shipped roles — is a CONFIGURED relationship and must be one row in
 * `RELATIONSHIP_DEFINITIONS`, never a hand-authored provider here. This list is closed by design;
 * adding to it requires the same justification above.
 */
const NATIVE_PROVIDERS: readonly CanonicalCollectionProviderDefinition[] = [
    CHILDREN,
    HOUSEHOLD_MEMBERS,
    HEALTH_ALLERGIES,
    HEALTH_CONDITIONS,
    HEALTH_MEDICATIONS,
    HEALTH_IMMUNIZATIONS,
];

/**
 * Project ONE relationship definition into its collection provider — generic, no per-role code.
 * This is the projection seam: the definition owns the semantics, this function owns only the
 * collection-shaped view of them.
 */
export function relationshipCollectionProjection(def: RelationshipDefinition): CanonicalCollectionProviderDefinition {
    return {
        refKey: def.provider_ref,
        collectionRef: def.collection_ref,
        label: def.label,
        itemEntityType: def.item_entity_type,
        providerKind: "relationship_role",
        sourceEntityType: def.source_entity_type,
        requiredContextKeys: def.required_context_keys,
        resolverOwner: RESOLVER_OWNER,
        activeOnly: def.active_only,
        itemIdentityField: "id",
        orderingPolicy: def.ordering_policy,
        relationshipRoleKey: def.provider_role_key,
    };
}

/** All configured relationship-role collection providers, derived from definitions (not hand-authored). */
export function deriveRelationshipCollectionProviders(): CanonicalCollectionProviderDefinition[] {
    return RELATIONSHIP_DEFINITIONS.map(relationshipCollectionProjection);
}

const REGISTRY: readonly CanonicalCollectionProviderDefinition[] = [...NATIVE_PROVIDERS, ...deriveRelationshipCollectionProviders()];

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

/**
 * Map a canonical operational relationship ROLE key (person_child_relationship_roles: parent,
 * guardian, emergency_contact, authorized_pickup, …) to the collection provider that owns it.
 * parent/guardian both resolve to the parents/guardians provider (its filter spans both). Used by
 * Configuration Discovery application to project a relationship concept through the canonical
 * provider instead of flat fields.
 */
export function canonicalCollectionProviderForRole(operationalRoleKey: string): CanonicalCollectionProviderDefinition | undefined {
    // Definition-driven: the relationship definition owns the role→provider mapping (parent/guardian
    // both resolve to the parents/guardians definition). No per-role branch here.
    const def = relationshipDefinitionForRole(operationalRoleKey);
    return def ? BY_REF.get(def.provider_ref) : undefined;
}

/** The relationship definition behind a registered relationship-role provider (native providers → undefined). */
export function relationshipDefinitionForProvider(refKey: string): RelationshipDefinition | undefined {
    return RELATIONSHIP_DEFINITIONS.find((d) => d.provider_ref === refKey.trim());
}

/** Classify a provider: native structural collection vs configured relationship projection. */
export function classifyCollectionProvider(refKey: string): "native_structural" | "configured_relationship" | "unknown" {
    if (RELATIONSHIP_DEFINITIONS.some((d) => d.provider_ref === refKey.trim())) return "configured_relationship";
    if (refKey.trim() === "children" || refKey.trim() === "household.members") return "native_structural";
    return "unknown";
}
