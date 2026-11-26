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

import type { OperationalRoleKey } from "@/lib/fields/personChildRelationship/personChildRelationshipEntity";

/**
 * Write-path vocabulary. Defined HERE rather than in the relationship action registry because the
 * registry now derives from these definitions — the dependency runs definitions → registry, so the
 * types must live on the canonical side. `relationshipActionRegistry` re-exports both for compatibility.
 */
export type RelationshipWriteTarget =
    | "persons"
    | "contacts"
    | "customer_persons"
    | "customer_members"
    | "opportunity_persons"
    /**
     * The legacy participation bridge. `add_child` no longer declares it — `process_instances`
     * became the sole runtime owner of child participation — but `link_existing_child` still
     * declares and writes it, and the executor gates that write on this declaration.
     */
    | "opportunity_customer_members"
    /** Canonical child participation — the owner that replaced the OCM bridge. */
    | "process_instances"
    | "customer_member_contacts";

export type RelationshipExecutorKind =
    | "child_scoped_contact"
    | "guardian"
    | "billing"
    | "add_child"
    | "link_person"
    | "link_child"
    | "make_primary_external";

/** One row of the (future) `relationship_definitions` table. */
export interface RelationshipDefinition {
    /** Stable definition key — the future table PK. */
    definition_key: string;

    // ── RELATIONSHIP SEMANTICS (canonical — what this relationship IS) ──
    /**
     * Canonical operational role assigned on apply (`person_child_relationship_roles`).
     * OPEN vocabulary — a definition may declare a role the platform does not enumerate.
     */
    operational_role_key: OperationalRoleKey;
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

    // ── DISCOVERY-DETECTION PROJECTION (how this relationship is recognised in a source document) ──
    /**
     * Regex source fragments matched against a source-document section title by Configuration
     * Discovery. Detection was previously a hardcoded regex-per-role, which meant a configured role
     * was never DETECTED and its (already generic) apply path was therefore unreachable.
     */
    detection_patterns: readonly string[];
    /**
     * Match order, lowest first. A title can satisfy more than one definition ("Parent/Guardian
     * Emergency Contact"), so the MORE SPECIFIC role must be tested first. These values reproduce the
     * original hardcoded order exactly: emergency contact, then authorized pickup, then parent/guardian.
     */
    detection_priority: number;
    /**
     * Whether the title matcher closes with a word boundary. Preserves today's per-role regex
     * semantics EXACTLY: parent/guardian and pickup close with `\b`, emergency contact does not (so
     * "Emergency Contacts" matches). Consequence worth knowing: a section titled "Guardians" is seen
     * as a person GROUP but is not classified as the guardian role, because `\bguardian\b` fails on
     * the plural. That quirk is preserved deliberately, not endorsed — see the follow-up in
     * docs/platform/core/data/relationship-model.md.
     */
    detection_word_suffix: boolean;
    /** Anchor grain the role attaches to. */
    relationship_scope: "child" | "household";
    /**
     * Label for the collapsed relationship_group concept in Configuration Discovery. Distinct from
     * `label` (the authoring label) because Discovery has always used its own sentence-case wording;
     * kept as a column so that wording stays byte-identical and stays owned by the definition.
     * Falls back to `label` when a new definition does not specify one.
     */
    discovery_group_label?: string;

    // ── EXECUTION PROJECTION (the canonical write path) ──
    /** Executor branch in `executeRelationshipAction`. */
    executor_kind: RelationshipExecutorKind;
    /** Tables this relationship's command is permitted to link. */
    write_targets: readonly RelationshipWriteTarget[];
    /**
     * Where child-scoped role rows land. This was an IMPLICIT consequence of `executor_kind` — only
     * `child_scoped_contact` and `link_person` reached `person_child_relationships`, so
     * `add_parent_guardian` has always written the legacy `customer_member_contacts` table despite
     * being a first-class relationship. Making it an explicit column preserves that behaviour exactly
     * while stopping it from being a hidden rule, and lets a future migration flip guardian to PCR as
     * a one-row config change.
     */
    persists_to: "person_child_relationships" | "customer_member_contacts";
    /**
     * Ordered tenant role-key candidates resolved against active `customer_member_contact_roles`.
     * First active match wins. Replaces the per-action candidate map + switch.
     */
    role_key_candidates: readonly string[];
    /**
     * Auto-resolution policy against the org's active `customer_member_contact_roles`.
     *
     * Distinct from `role_key_candidates` (which is the operator-facing picker list): guardian
     * resolves through different candidate sets depending on whether the anchor is the PRIMARY
     * guardian, and must always land on some role rather than returning null. Encoding that here
     * keeps `resolveRelationshipRoleKeyForAction` free of its per-action switch while preserving
     * today's behaviour exactly.
     */
    role_resolution?: {
        /** Candidates tried when the anchor is the primary guardian. */
        primary_candidates?: readonly string[];
        /** Candidates tried otherwise. Defaults to `role_key_candidates`. */
        default_candidates?: readonly string[];
        /** Must resolve: fall back to "guardian", then any active role, else throw. */
        required?: boolean;
    };
    /**
     * How this relationship's canonical command presents itself in the action registry.
     *
     * OPTIONAL — every field defaults from the definition (see `relationshipCommandPresentation`), so
     * a new relationship row yields a working, sensibly-labelled command with nothing specified here.
     * It exists so the three shipped commands keep their exact current copy and surface allowances,
     * and so that copy is owned by the relationship model rather than by the registry consuming it.
     *
     * Surface/context values are typed loosely on purpose: the canonical model must not import
     * layout-editor types (that coupling belongs to the registry, which casts on the way out).
     */
    command_presentation?: {
        label?: string;
        description?: string;
        confirmation_copy?: string;
        bos_examples?: readonly string[];
        allowed_surfaces?: readonly string[];
        allowed_contexts?: readonly string[];
        allowed_source_surfaces?: readonly string[];
    };
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
        detection_patterns: ["parent", "guardian"],
        detection_priority: 30,
        detection_word_suffix: true,
        relationship_scope: "child",
        discovery_group_label: "Guardians",
        executor_kind: "guardian",
        write_targets: ["contacts", "customer_persons", "customer_member_contacts"],
        // Guardian has always landed on the legacy CMC table (executor_kind "guardian" was excluded
        // from the PCR fork). Preserved byte-for-byte; now explicit instead of implicit.
        persists_to: "customer_member_contacts",
        role_key_candidates: ["guardian", "parent_guardian", "parent", "secondary_guardian"],
        role_resolution: {
            primary_candidates: ["guardian", "primary_contact", "parent"],
            default_candidates: ["secondary_guardian", "secondary", "guardian"],
            required: true,
        },
        command_presentation: {
            label: "Add Parent / Guardian",
            description: "Add or link a parent/guardian for this child or household.",
            confirmation_copy: "This will link the person as a guardian on the selected child record(s) and household.",
            bos_examples: ["Add Jordan Lee as guardian for both children."],
            allowed_surfaces: ["child_drawer", "opportunity_drawer"],
            allowed_contexts: ["section_row", "contact_block"],
            allowed_source_surfaces: ["child_drawer", "opportunity_drawer", "bos_rail"],
        },
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
        detection_patterns: ["emergency\\s*contact"],
        detection_priority: 10,
        detection_word_suffix: false,
        relationship_scope: "child",
        discovery_group_label: "Emergency contacts",
        executor_kind: "child_scoped_contact",
        write_targets: ["contacts", "customer_persons"],
        persists_to: "person_child_relationships",
        role_key_candidates: ["emergency_contact", "emergency"],
        command_presentation: {
            label: "Add Emergency Contact",
            description: "Add or link an emergency contact scoped to this child or siblings.",
            confirmation_copy: "This will link the person as an emergency contact on the selected child record(s).",
            bos_examples: [
                "Add Grandma Susan as emergency contact for Billie and her siblings.",
                "Add emergency contact Pat for this child only.",
            ],
            allowed_surfaces: ["child_drawer"],
            allowed_contexts: ["section_row", "contact_block"],
            allowed_source_surfaces: ["child_drawer", "bos_rail"],
        },
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
        detection_patterns: ["pick\\s*up", "pickup", "authorized"],
        detection_priority: 20,
        detection_word_suffix: true,
        relationship_scope: "child",
        discovery_group_label: "Authorized pickup people",
        executor_kind: "child_scoped_contact",
        write_targets: ["contacts"],
        persists_to: "person_child_relationships",
        role_key_candidates: ["authorized_pickup", "pickup"],
        command_presentation: {
            label: "Add Authorized Pickup",
            description: "Authorize a person for pickup on this child or selected siblings.",
            confirmation_copy: "This will link the person as authorized pickup on the selected child record(s).",
            bos_examples: ["Add Uncle Mike as authorized pickup for Riley."],
            allowed_surfaces: ["child_drawer"],
            allowed_contexts: ["section_row", "contact_block"],
            allowed_source_surfaces: ["child_drawer", "bos_rail"],
        },
    },
    // ── care providers ───────────────────────────────────────────────────────────────────────
    // The future-proof rule at the top of this module names PHYSICIAN as its worked example, and
    // a real enrollment packet asked for one. A child's doctor is a person reached through a
    // relationship — never the household's own contact details, which is why binding a physician's
    // phone to `person.phone` is refused at the proposal boundary. These two rows are the whole
    // addition: the action registry, capability registry and role mapping all derive from here.
    {
        definition_key: "child_physicians",
        operational_role_key: "physician",
        source_entity_type: "customer",
        target_entity_type: "person",
        direction: "anchor_to_target",
        cardinality: "many",
        label: "Physicians",
        help_text: "The child's doctor or pediatric practice.",
        collectable: true,
        scopes: ["this_child", "selected_children", "all_children_in_household"],
        // Name and phone are what a packet asks for. A provider's address lives on the person when
        // a source supplies one; nothing here invents a destination no document asked for.
        nested_field_keys: ["full_name", "phone"],
        create_link_policy: "create_or_link",
        apply_command_key: "add_physician",
        responsibility_default: "either_guardian",
        native: false,
        provider_ref: "person.contact_role.physicians",
        collection_ref: "physicians",
        item_entity_type: "person",
        provider_role_key: "physician",
        required_context_keys: ["customer_id"],
        active_only: false,
        ordering_policy: "display_name",
        iteration_alias: "physician",
        detection_patterns: ["physician", "pediatrician", "primary\\s*care", "doctor"],
        detection_priority: 30,
        detection_word_suffix: true,
        relationship_scope: "child",
        discovery_group_label: "Physicians",
        executor_kind: "child_scoped_contact",
        write_targets: ["contacts"],
        persists_to: "person_child_relationships",
        role_key_candidates: ["physician", "doctor", "pediatrician", "primary_physician"],
        command_presentation: {
            label: "Add Physician",
            description: "Record the child's doctor or practice on this child or selected siblings.",
            confirmation_copy: "This will link the person as the child's physician on the selected child record(s).",
            bos_examples: ["Add Dr. Alvarez as Riley's physician.", "Set the same pediatrician for both children."],
            allowed_surfaces: ["child_drawer"],
            allowed_contexts: ["section_row", "contact_block"],
            allowed_source_surfaces: ["child_drawer", "bos_rail"],
        },
    },
    {
        definition_key: "child_dentists",
        operational_role_key: "dentist",
        source_entity_type: "customer",
        target_entity_type: "person",
        direction: "anchor_to_target",
        cardinality: "many",
        label: "Dentists",
        help_text: "The child's dentist or dental practice.",
        collectable: true,
        scopes: ["this_child", "selected_children", "all_children_in_household"],
        nested_field_keys: ["full_name", "phone"],
        create_link_policy: "create_or_link",
        apply_command_key: "add_dentist",
        responsibility_default: "either_guardian",
        native: false,
        provider_ref: "person.contact_role.dentists",
        collection_ref: "dentists",
        item_entity_type: "person",
        provider_role_key: "dentist",
        required_context_keys: ["customer_id"],
        active_only: false,
        ordering_policy: "display_name",
        iteration_alias: "dentist",
        // A separate row rather than a shared "provider" role: a dentist and a physician are
        // different relationships, and one role would lose which is which.
        detection_patterns: ["dentist", "dental"],
        detection_priority: 31,
        detection_word_suffix: true,
        relationship_scope: "child",
        discovery_group_label: "Dentists",
        executor_kind: "child_scoped_contact",
        write_targets: ["contacts"],
        persists_to: "person_child_relationships",
        role_key_candidates: ["dentist", "dental"],
        command_presentation: {
            label: "Add Dentist",
            description: "Record the child's dentist or practice on this child or selected siblings.",
            confirmation_copy: "This will link the person as the child's dentist on the selected child record(s).",
            bos_examples: ["Add Dr. Okafor as Riley's dentist."],
            allowed_surfaces: ["child_drawer"],
            allowed_contexts: ["section_row", "contact_block"],
            allowed_source_surfaces: ["child_drawer", "bos_rail"],
        },
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
    return DEF_BY_ROLE.get(r);
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

const DEF_BY_COMMAND = new Map(RELATIONSHIP_DEFINITIONS.map((d) => [d.apply_command_key, d]));

/** Canonical write command → definition. The execution layer's entry point into the model. */
export function relationshipDefinitionForCommandKey(commandKey: string): RelationshipDefinition | undefined {
    return DEF_BY_COMMAND.get(commandKey.trim());
}

/** Every command key owned by a relationship definition (the derived half of the action registry). */
export function relationshipDefinitionCommandKeys(): string[] {
    return RELATIONSHIP_DEFINITIONS.map((d) => d.apply_command_key);
}

/** Definitions in detection order — most specific first. */
export function relationshipDefinitionsByDetectionPriority(): RelationshipDefinition[] {
    return [...RELATIONSHIP_DEFINITIONS].sort((a, b) => a.detection_priority - b.detection_priority);
}

const DETECTION_RE_BY_KEY = new Map(
    RELATIONSHIP_DEFINITIONS.map((d) => [
        d.definition_key,
        d.detection_patterns.length
            ? new RegExp(`\\b(${d.detection_patterns.join("|")})${d.detection_word_suffix ? "\\b" : ""}`, "i")
            : null,
    ]),
);

/**
 * Which relationship (if any) a source-document section title denotes. Ties break by
 * `detection_priority`, so "Emergency Contact" cannot be claimed by the parent/guardian definition.
 * Configuration Discovery calls this instead of owning a regex ladder.
 */
export function detectRelationshipDefinitionForTitle(title: string): RelationshipDefinition | undefined {
    const t = title.toLowerCase();
    for (const def of relationshipDefinitionsByDetectionPriority()) {
        const re = DETECTION_RE_BY_KEY.get(def.definition_key);
        if (re?.test(t)) return def;
    }
    return undefined;
}

/** Combined detection regex — "does this title denote ANY configured relationship?" */
export function relationshipDetectionPattern(): RegExp {
    const all = RELATIONSHIP_DEFINITIONS.flatMap((d) => d.detection_patterns);
    return new RegExp(`\\b(${all.join("|")})`, "i");
}
