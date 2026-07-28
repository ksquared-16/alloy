/**
 * POS-FP17 — configured relationship collection DEFINITIONS (table-shaped, in-code).
 *
 * Alloy has no `relationship_definitions` table today; operational roles are code constants and the
 * "definition" layer is scattered across the household section-definition registry, the relationship
 * action registry, and the operational-role set. This module unifies them into ONE definition source
 * of truth, shaped exactly like a future `relationship_collection_definitions` DB table's rows — so
 * promotion to a first-class config table is a mechanical migration (each row → one DB row), not a
 * rewrite. A new collectable role ("physician", "sponsor") is added by appending ONE row here (or, in
 * future, one DB row), never by editing five registries.
 *
 * From these rows the platform derives, generically: the collection PROVIDER (see
 * `deriveRelationshipCollectionProviders`), read-resolution eligibility, Forms authoring eligibility,
 * Configuration Discovery matching, and the canonical apply command. Native STRUCTURAL collections
 * (household children, household members) are NOT relationship definitions — they remain native (see
 * the registry's documented native exceptions).
 *
 * Row values are kept consistent with the canonical write path (`relationshipActionRegistry` command
 * keys + scopes) and the current provider registry (so derivation is byte-identical for existing
 * providers — the additive-then-widen strategy).
 */

import type { PersonChildOperationalRoleKey } from "@/lib/fields/personChildRelationship/personChildRelationshipEntity";

/** One row of the (future) relationship_collection_definitions table. */
export interface RelationshipCollectionDefinition {
    /** Stable definition key — the future table PK. */
    definition_key: string;

    // ── provider projection (reproduces the canonical collection provider def) ──
    /** Canonical provider refKey. */
    provider_ref: string;
    /** collection_ref slug used in projection metadata. */
    collection_ref: string;
    /** Operator label. */
    label: string;
    /** Help text (operator authoring). */
    help_text: string;
    /** Collected item entity. */
    item_entity_type: string;
    /** Anchor (source) entity grain. */
    source_entity_type: string;
    /** Provider role key written into `CanonicalCollectionProviderDefinition.relationshipRoleKey`
     *  (the resolver's role-map key — "parents" for the parents/guardians group, else the role). */
    provider_role_key: string;
    /** Required resolution/launch context keys. */
    required_context_keys: readonly string[];
    /** Whether inactive members are excluded at resolution. */
    active_only: boolean;
    /** Default sort. */
    ordering_policy: "display_name" | "created_at";

    // ── definition metadata (future config columns) ──
    /** Canonical operational role assigned on apply (person_child_relationship_roles). */
    operational_role_key: PersonChildOperationalRoleKey;
    target_entity_type: string;
    direction: "anchor_to_target";
    cardinality: "one" | "many";
    /** Eligible for Forms authoring + Configuration Discovery collection binding. */
    collectable: boolean;
    /** Scopes offered on apply (from the relationship action registry). */
    scopes: readonly string[];
    /** Person fields collected for each related member (nested field ownership). */
    nested_field_keys: readonly string[];
    create_link_policy: "create_or_link";
    /** Canonical apply command (relationshipActionRegistry → relationshipExecutionAdapter). */
    apply_command_key: string;
    /** Default requirement responsibility party where relevant. */
    responsibility_default: string;
    /** Always false here — native structural collections are not relationship definitions. */
    native: false;
}

export const RELATIONSHIP_COLLECTION_DEFINITIONS: readonly RelationshipCollectionDefinition[] = [
    {
        definition_key: "parents_guardians",
        provider_ref: "person.contact_role.parents",
        collection_ref: "parents_guardians",
        label: "Parents / Guardians",
        help_text: "The child's parents or legal guardians.",
        item_entity_type: "person",
        source_entity_type: "customer",
        provider_role_key: "parents",
        required_context_keys: ["customer_id"],
        active_only: false,
        ordering_policy: "display_name",
        operational_role_key: "guardian",
        target_entity_type: "person",
        direction: "anchor_to_target",
        cardinality: "many",
        collectable: true,
        scopes: ["this_child", "selected_children", "all_children_in_household"],
        nested_field_keys: ["full_name", "email", "phone", "relationship_type"],
        create_link_policy: "create_or_link",
        apply_command_key: "add_parent_guardian",
        responsibility_default: "all_guardians",
        native: false,
    },
    {
        definition_key: "emergency_contacts",
        provider_ref: "person.contact_role.emergency_contacts",
        collection_ref: "emergency_contacts",
        label: "Emergency Contacts",
        help_text: "People to contact in an emergency.",
        item_entity_type: "person",
        source_entity_type: "customer",
        provider_role_key: "emergency_contact",
        required_context_keys: ["customer_id"],
        active_only: false,
        ordering_policy: "display_name",
        operational_role_key: "emergency_contact",
        target_entity_type: "person",
        direction: "anchor_to_target",
        cardinality: "many",
        collectable: true,
        scopes: ["this_child", "selected_children", "all_children_in_household"],
        nested_field_keys: ["full_name", "phone", "relationship_type", "address"],
        create_link_policy: "create_or_link",
        apply_command_key: "add_emergency_contact",
        responsibility_default: "either_guardian",
        native: false,
    },
    {
        definition_key: "authorized_pickups",
        provider_ref: "person.contact_role.authorized_pickups",
        collection_ref: "authorized_pickups",
        label: "Authorized Pickup People",
        help_text: "People authorized to pick up the child.",
        item_entity_type: "person",
        source_entity_type: "customer",
        provider_role_key: "authorized_pickup",
        required_context_keys: ["customer_id"],
        active_only: false,
        ordering_policy: "display_name",
        operational_role_key: "authorized_pickup",
        target_entity_type: "person",
        direction: "anchor_to_target",
        cardinality: "many",
        collectable: true,
        scopes: ["this_child", "selected_children", "all_children_in_household"],
        nested_field_keys: ["full_name", "phone", "relationship_type"],
        create_link_policy: "create_or_link",
        apply_command_key: "add_authorized_pickup",
        responsibility_default: "either_guardian",
        native: false,
    },
];

const DEF_BY_ROLE = new Map(RELATIONSHIP_COLLECTION_DEFINITIONS.map((d) => [d.operational_role_key, d]));
const DEF_BY_REF = new Map(RELATIONSHIP_COLLECTION_DEFINITIONS.map((d) => [d.provider_ref, d]));

export function relationshipDefinitionForRole(operationalRoleKey: string): RelationshipCollectionDefinition | undefined {
    const r = operationalRoleKey.trim();
    if (r === "parent" || r === "guardian") return DEF_BY_ROLE.get("guardian");
    return DEF_BY_ROLE.get(r as PersonChildOperationalRoleKey);
}

export function relationshipDefinitionForRef(providerRef: string): RelationshipCollectionDefinition | undefined {
    return DEF_BY_REF.get(providerRef.trim());
}

/** All collectable relationship definitions — the set Forms authoring + Discovery may bind. */
export function collectableRelationshipDefinitions(): RelationshipCollectionDefinition[] {
    return RELATIONSHIP_COLLECTION_DEFINITIONS.filter((d) => d.collectable);
}
