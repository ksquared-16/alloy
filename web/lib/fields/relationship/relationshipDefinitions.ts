/**
 * CANONICAL RELATIONSHIP DEFINITIONS — the source of truth for configured relationships.
 *
 * ## Where this sits
 *
 *   Entity Model
 *     ↓
 *   Relationship Definitions        ← THIS MODULE (canonical owner)
 *     ↓
 *   Configuration Model
 *     ↓
 *   Relationship Collection Projection   (`fields/collection/canonicalCollectionProviderRegistry`)
 *     ↓
 *   Forms · Conversation Runtime · Configuration Discovery · Processing · BOS · APIs
 *
 * A **collection is ONE projection** of a relationship definition — it is not the definition. Other
 * projections already exist (`personChildRelationshipReportingProjection`) and more will follow. Every
 * consumer must read THIS module (directly, or through a projection derived from it). No consumer may
 * become the owner: if a consumer needs a new fact about a relationship, the fact belongs on the
 * definition row here, not in a consumer-local table, allowlist, or role union.
 *
 * ## Authored, not derived
 *
 * These rows are AUTHORED truth, shaped exactly like a future `relationship_definitions` DB table.
 * They are not projected from anywhere else in code. Alloy has no such table today: operational role
 * keys are platform constants (`PERSON_CHILD_OPERATIONAL_ROLE_KEYS`) and the "definition" layer was
 * previously scattered across the household section registry, the relationship action registry, and
 * the operational-role set. This module unifies them into one row set so that promotion to a
 * first-class config table is a MECHANICAL migration — each row here becomes one DB row, and every
 * consumer keeps reading the same accessor functions (`relationshipDefinitionForRole`,
 * `collectableRelationshipDefinitions`) whose bodies switch from an in-memory array to a config read.
 * Consumers do not change when the storage changes. That is the whole point of the seam.
 *
 * ## Native structural collections are the documented exception
 *
 * `children` and `household.members` are NOT relationship definitions and deliberately do not appear
 * here. See the native-exception rule in `canonicalCollectionProviderRegistry` and
 * `docs/platform/core/data/relationship-model.md`.
 *
 * ## The future-proof rule
 *
 * Adding a new collectable role (physician, attorney, case worker, therapist, foster parent, sponsor)
 * must be ONE new definition row — never new provider code, and never an edit to Forms, Conversation
 * Runtime, Configuration Discovery, Processing, or BOS. Conformance against that rule is tracked in
 * `docs/platform/core/data/relationship-model.md`.
 *
 * Row values are kept consistent with the canonical write path (`relationshipActionRegistry` command
 * keys + scopes) and reproduce the previously hand-authored collection providers byte-for-byte, so
 * derivation is a pure refactor (the additive-then-widen strategy).
 */

import type { PersonChildOperationalRoleKey } from "@/lib/fields/personChildRelationship/personChildRelationshipEntity";

/** One row of the (future) `relationship_definitions` table. */
export interface RelationshipDefinition {
    /** Stable definition key — the future table PK. */
    definition_key: string;

    // ── RELATIONSHIP SEMANTICS (canonical — what this relationship IS) ──
    /** Canonical operational role assigned on apply (`person_child_relationship_roles`). */
    operational_role_key: PersonChildOperationalRoleKey;
    /** Anchor (source) entity grain. */
    source_entity_type: string;
    target_entity_type: string;
    direction: "anchor_to_target";
    cardinality: "one" | "many";
    /** Operator label. */
    label: string;
    /** Help text (operator authoring). */
    help_text: string;
    /** Eligible for Forms authoring + Configuration Discovery collection binding. */
    collectable: boolean;
    /** Scopes offered on apply (from the relationship action registry). */
    scopes: readonly string[];
    /** Person fields collected for each related member (nested field ownership). */
    nested_field_keys: readonly string[];
    create_link_policy: "create_or_link";
    /** Canonical apply command (`relationshipActionRegistry` → `relationshipExecutionAdapter`). */
    apply_command_key: string;
    /** Default requirement responsibility party where relevant. */
    responsibility_default: string;
    /** Always false here — native structural collections are not relationship definitions. */
    native: false;

    // ── COLLECTION-PROJECTION IDENTITY (stable published keys for the collection projection) ──
    // These are NOT extra truth about the relationship; they are the durable identity the collection
    // projection publishes into saved forms and layout config. They live on the definition because
    // they must stay stable across renames, and they are consumed only via the projection.
    /** Canonical provider refKey emitted by the collection projection. */
    provider_ref: string;
    /** collection_ref slug used in projection metadata. */
    collection_ref: string;
    /** Collected item entity. */
    item_entity_type: string;
    /** Projection role-map key ("parents" for the parents/guardians group, else the role). */
    provider_role_key: string;
    /** Required resolution/launch context keys. */
    required_context_keys: readonly string[];
    /** Whether inactive members are excluded at resolution. */
    active_only: boolean;
    /** Default sort. */
    ordering_policy: "display_name" | "created_at";
    /** Per-item alias inside a repeatable Forms group ("guardian" → `{{guardian.full_name}}`). */
    iteration_alias: string;
}

export const RELATIONSHIP_DEFINITIONS: readonly RelationshipDefinition[] = [
    {
        definition_key: "parents_guardians",
        operational_role_key: "guardian",
        source_entity_type: "customer",
        target_entity_type: "person",
        direction: "anchor_to_target",
        cardinality: "many",
        label: "Parents / Guardians",
        help_text: "The child's parents or legal guardians.",
        collectable: true,
        scopes: ["this_child", "selected_children", "all_children_in_household"],
        nested_field_keys: ["full_name", "email", "phone", "relationship_type"],
        create_link_policy: "create_or_link",
        apply_command_key: "add_parent_guardian",
        responsibility_default: "all_guardians",
        native: false,
        provider_ref: "person.contact_role.parents",
        collection_ref: "parents_guardians",
        item_entity_type: "person",
        provider_role_key: "parents",
        required_context_keys: ["customer_id"],
        active_only: false,
        ordering_policy: "display_name",
        iteration_alias: "guardian",
    },
    {
        definition_key: "emergency_contacts",
        operational_role_key: "emergency_contact",
        source_entity_type: "customer",
        target_entity_type: "person",
        direction: "anchor_to_target",
        cardinality: "many",
        label: "Emergency Contacts",
        help_text: "People to contact in an emergency.",
        collectable: true,
        scopes: ["this_child", "selected_children", "all_children_in_household"],
        nested_field_keys: ["full_name", "phone", "relationship_type", "address"],
        create_link_policy: "create_or_link",
        apply_command_key: "add_emergency_contact",
        responsibility_default: "either_guardian",
        native: false,
        provider_ref: "person.contact_role.emergency_contacts",
        collection_ref: "emergency_contacts",
        item_entity_type: "person",
        provider_role_key: "emergency_contact",
        required_context_keys: ["customer_id"],
        active_only: false,
        ordering_policy: "display_name",
        iteration_alias: "emergency_contact",
    },
    {
        definition_key: "authorized_pickups",
        operational_role_key: "authorized_pickup",
        source_entity_type: "customer",
        target_entity_type: "person",
        direction: "anchor_to_target",
        cardinality: "many",
        label: "Authorized Pickup People",
        help_text: "People authorized to pick up the child.",
        collectable: true,
        scopes: ["this_child", "selected_children", "all_children_in_household"],
        nested_field_keys: ["full_name", "phone", "relationship_type"],
        create_link_policy: "create_or_link",
        apply_command_key: "add_authorized_pickup",
        responsibility_default: "either_guardian",
        native: false,
        provider_ref: "person.contact_role.authorized_pickups",
        collection_ref: "authorized_pickups",
        item_entity_type: "person",
        provider_role_key: "authorized_pickup",
        required_context_keys: ["customer_id"],
        active_only: false,
        ordering_policy: "display_name",
        iteration_alias: "authorized_pickup",
    },
];

const DEF_BY_ROLE = new Map(RELATIONSHIP_DEFINITIONS.map((d) => [d.operational_role_key, d]));
const DEF_BY_REF = new Map(RELATIONSHIP_DEFINITIONS.map((d) => [d.provider_ref, d]));

/**
 * Role → definition. The definition owns the role grouping: `parent` and `guardian` are two
 * operational roles served by ONE parents/guardians definition. Consumers must never re-implement
 * this grouping with their own branch.
 */
export function relationshipDefinitionForRole(operationalRoleKey: string): RelationshipDefinition | undefined {
    const r = operationalRoleKey.trim();
    if (r === "parent" || r === "guardian") return DEF_BY_ROLE.get("guardian");
    return DEF_BY_ROLE.get(r as PersonChildOperationalRoleKey);
}

/** Published collection provider ref → definition. */
export function relationshipDefinitionForRef(providerRef: string): RelationshipDefinition | undefined {
    return DEF_BY_REF.get(providerRef.trim());
}

/**
 * All collectable relationship definitions — the ONE set Forms authoring, Conversation Runtime and
 * Configuration Discovery may bind. Consumers must derive their eligible set from this call rather
 * than hardcoding role allowlists, so a new definition row widens every consumer at once.
 */
export function collectableRelationshipDefinitions(): RelationshipDefinition[] {
    return RELATIONSHIP_DEFINITIONS.filter((d) => d.collectable);
}
