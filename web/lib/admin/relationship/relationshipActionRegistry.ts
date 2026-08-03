/**
 * Relationship Action Framework — declarative action registry.
 */

import type { DrawerLayoutEditorSurfaceKey } from "@/lib/layout/drawerLayoutEditorSurfaceConfig";

export type RelationshipActionPickerContext =
    | "section_row"
    | "contact_block"
    | "contact_related_list"
    | "contact_repeater_row";
import type {
    RelationshipActionKey,
    RelationshipActionScope,
    RelationshipActionSourceSurface,
    RelationshipRoleKey,
} from "@/lib/admin/relationship/relationshipActionContract";
import {
    RELATIONSHIP_DEFINITIONS,
    type RelationshipDefinition,
    type RelationshipWriteTarget,
    type RelationshipExecutorKind,
} from "@/lib/fields/relationship/relationshipDefinitions";

export type RelationshipIdentityKind = "person" | "child" | "either";

// Write-path vocabulary now lives on the canonical side (definitions → registry). Re-exported here so
// existing importers are unaffected.
export type { RelationshipWriteTarget, RelationshipExecutorKind } from "@/lib/fields/relationship/relationshipDefinitions";

export type RelationshipActionRegistryEntry = {
    actionKey: RelationshipActionKey;
    label: string;
    description: string;
    identityKind: RelationshipIdentityKind;
    defaultRoleKey: RelationshipRoleKey | null;
    roleEditable: boolean;
    allowedSurfaces: readonly DrawerLayoutEditorSurfaceKey[];
    allowedContexts: readonly RelationshipActionPickerContext[];
    allowedScopes: readonly RelationshipActionScope[];
    allowedSourceSurfaces: readonly RelationshipActionSourceSurface[];
    writeTargets: readonly RelationshipWriteTarget[];
    executorKind: RelationshipExecutorKind;
    confirmationCopy: string;
    bosExamples: readonly string[];
    runtimeWired: boolean;
    /** Uses dedicated legacy runtime path (e.g. make_primary_contact). */
    externalExecutor?: boolean;
};

/**
 * Project ONE relationship definition into its action-registry entry.
 *
 * Every semantic field comes off the definition (`apply_command_key`, `operational_role_key`,
 * `scopes`, `write_targets`, `executor_kind`); presentation falls back to definition-derived defaults
 * so a NEW relationship row produces a working command with no edit here. This is what removes the
 * per-role allowlist from the execution layer.
 *
 * @see docs/platform/core/data/relationship-model.md
 */
export function relationshipCommandPresentation(def: RelationshipDefinition): RelationshipActionRegistryEntry {
    const p = def.command_presentation ?? {};
    return {
        actionKey: def.apply_command_key as RelationshipActionKey,
        label: p.label ?? `Add ${def.label}`,
        description: p.description ?? def.help_text,
        // Definition-backed relationships always resolve a person identity onto a child/household.
        identityKind: "person",
        defaultRoleKey: def.operational_role_key as RelationshipRoleKey,
        // Fixed-role by construction: the definition names the role, so operators cannot repoint it.
        roleEditable: false,
        allowedSurfaces: (p.allowed_surfaces ?? ["child_drawer"]) as readonly DrawerLayoutEditorSurfaceKey[],
        allowedContexts: (p.allowed_contexts ?? ["section_row", "contact_block"]) as readonly RelationshipActionPickerContext[],
        allowedScopes: def.scopes as readonly RelationshipActionScope[],
        allowedSourceSurfaces: (p.allowed_source_surfaces ?? ["child_drawer", "bos_rail"]) as readonly RelationshipActionSourceSurface[],
        writeTargets: def.write_targets,
        executorKind: def.executor_kind,
        confirmationCopy:
            p.confirmation_copy
            ?? `This will link the person as ${def.label.toLowerCase()} on the selected child record(s).`,
        bosExamples: p.bos_examples ?? [],
        runtimeWired: true,
    };
}

/** Registry entries owned by the relationship model — one per definition, derived. */
export function deriveRelationshipCommandEntries(): RelationshipActionRegistryEntry[] {
    return RELATIONSHIP_DEFINITIONS.map(relationshipCommandPresentation);
}

/**
 * Commands that are NOT relationship definitions and stay hand-authored:
 *
 *  • `add_billing_contact` — a financial responsibility command (`executorKind: "billing"`, writes
 *    `customer_member_contacts` + `opportunity_persons`). It has no definition row and must keep
 *    flowing through its own executor untouched.
 *  • `add_child` / `link_existing_child` — child IDENTITY and household membership, not relationship
 *    edges. Same reasoning as the native structural collections (`children`, `household.members`).
 *  • `link_existing_person` — role-agnostic by design; the operator picks the role at runtime
 *    (`roleEditable: true`), so it cannot derive a role from any single definition.
 *  • `make_primary_contact` — external executor (household primary designation), not this path.
 */
const NATIVE_RELATIONSHIP_ACTION_ENTRIES: RelationshipActionRegistryEntry[] = [
    {
        actionKey: "add_billing_contact",
        label: "Add Billing Contact",
        description: "Assign billing/payer responsibility for child and optionally opportunity.",
        identityKind: "person",
        defaultRoleKey: "billing_contact",
        roleEditable: false,
        allowedSurfaces: ["child_drawer", "opportunity_drawer"],
        allowedContexts: ["section_row", "contact_block", "contact_related_list"],
        allowedScopes: [
            "this_child",
            "selected_children",
            "all_children_in_household",
            "this_opportunity",
            "household",
        ],
        allowedSourceSurfaces: ["child_drawer", "opportunity_drawer", "bos_rail"],
        writeTargets: ["contacts", "customer_member_contacts", "customer_persons", "opportunity_persons"],
        executorKind: "billing",
        confirmationCopy: "This will assign billing responsibility and link contacts on affected records.",
        bosExamples: ["Add Taylor as billing contact for this enrollment and household."],
        runtimeWired: true,
    },
    {
        actionKey: "add_child",
        label: "Add Child",
        description: "Create or link a child on this opportunity or household.",
        identityKind: "child",
        defaultRoleKey: null,
        roleEditable: false,
        allowedSurfaces: ["opportunity_drawer", "person_drawer"],
        allowedContexts: ["section_row", "contact_related_list"],
        allowedScopes: ["this_opportunity", "household"],
        allowedSourceSurfaces: ["opportunity_drawer", "person_drawer", "bos_rail"],
        writeTargets: ["persons", "customer_members", "opportunity_customer_members"],
        executorKind: "add_child",
        confirmationCopy: "This will create or link a child identity and enrollment participation.",
        bosExamples: ["Add a new child Avery to this opportunity."],
        runtimeWired: true,
    },
    {
        actionKey: "link_existing_person",
        label: "Link Existing Person",
        description: "Link an existing household person with a selected responsibility role.",
        identityKind: "person",
        defaultRoleKey: null,
        roleEditable: true,
        allowedSurfaces: ["opportunity_drawer", "person_drawer", "child_drawer"],
        allowedContexts: ["section_row", "contact_block", "contact_related_list"],
        allowedScopes: [
            "this_child",
            "selected_children",
            "all_children_in_household",
            "this_opportunity",
            "household",
        ],
        allowedSourceSurfaces: ["child_drawer", "person_drawer", "opportunity_drawer", "bos_rail"],
        writeTargets: ["customer_persons", "opportunity_persons"],
        executorKind: "link_person",
        confirmationCopy: "This will link the selected person with the chosen role on affected records.",
        bosExamples: ["Link existing person Susan as emergency contact for Billie."],
        runtimeWired: true,
    },
    {
        actionKey: "link_existing_child",
        label: "Link Existing Child",
        description: "Link an existing household child to this opportunity.",
        identityKind: "child",
        defaultRoleKey: null,
        roleEditable: false,
        allowedSurfaces: ["opportunity_drawer", "person_drawer"],
        allowedContexts: ["section_row", "contact_related_list"],
        allowedScopes: ["this_opportunity", "household"],
        allowedSourceSurfaces: ["opportunity_drawer", "person_drawer", "bos_rail"],
        writeTargets: ["customer_members", "opportunity_customer_members"],
        executorKind: "link_child",
        confirmationCopy: "This will link the selected child to the opportunity enrollment.",
        bosExamples: ["Link existing child Sam to this opportunity."],
        runtimeWired: true,
    },
    {
        actionKey: "make_primary_contact",
        label: "Make Primary Contact",
        description: "Promote a contact to household primary (confirmation required).",
        identityKind: "person",
        defaultRoleKey: "primary_contact",
        roleEditable: false,
        allowedSurfaces: ["opportunity_drawer", "person_drawer"],
        allowedContexts: ["contact_block", "contact_related_list", "contact_repeater_row"],
        allowedScopes: ["household", "this_opportunity"],
        allowedSourceSurfaces: ["opportunity_drawer", "person_drawer"],
        writeTargets: ["customer_persons"],
        executorKind: "make_primary_external",
        confirmationCopy: "This changes household primary designation — not a scalar field edit.",
        bosExamples: ["Make Kevin the primary contact for this household."],
        runtimeWired: true,
        externalExecutor: true,
    },
];

/**
 * The action registry = relationship-model-derived commands + the hand-authored native commands.
 *
 * Derived entries come first so that a relationship definition is always the authority for its own
 * command; a duplicate native entry for the same key would be shadowed rather than silently winning.
 */
export const RELATIONSHIP_ACTION_REGISTRY: RelationshipActionRegistryEntry[] = [
    ...deriveRelationshipCommandEntries(),
    ...NATIVE_RELATIONSHIP_ACTION_ENTRIES,
];

const REGISTRY_BY_KEY = new Map<string, RelationshipActionRegistryEntry>(
    RELATIONSHIP_ACTION_REGISTRY.map((entry) => [entry.actionKey, entry]),
);

/**
 * Lookup key is `string`, not the closed `RelationshipActionKey` union.
 *
 * The registry this queries is DERIVED — `deriveRelationshipCommandEntries()` maps
 * `RELATIONSHIP_DEFINITIONS`, so a newly configured relationship contributes its command without any
 * code change. A closed parameter union contradicted that: it is the same exact-key allowlist the
 * runtime gate already removed for exactly this reason ("meant a newly configured relationship could
 * never execute" — see `commandRuntimeExecutionGate`). The rest of the chain is already open:
 * `RelationshipDefinition.apply_command_key` is `string`, `RELATIONSHIP_RUNTIME_FACADE_COMMAND_KEYS`
 * is `readonly string[]`, and `isRelationshipRuntimeFacadeSupported` takes `string`.
 *
 * The signature was also the last one forcing callers to cast: `layoutEditorActionButton` carried
 * `key as (typeof RELATIONSHIP_ACTION_KEYS)[number]` purely to satisfy it. Widening removes that cast
 * rather than adding one, and the `| null` return already handles an unknown key.
 */
export function relationshipActionRegistryEntry(
    actionKey: string,
): RelationshipActionRegistryEntry | null {
    return REGISTRY_BY_KEY.get(actionKey) ?? null;
}

export function listRelationshipActionsForBuilder(input: {
    surfaceKey: DrawerLayoutEditorSurfaceKey;
    context: RelationshipActionPickerContext;
}): RelationshipActionRegistryEntry[] {
    return RELATIONSHIP_ACTION_REGISTRY.filter(
        (entry) =>
            entry.allowedSurfaces.includes(input.surfaceKey)
            && entry.allowedContexts.includes(input.context)
            && entry.runtimeWired
            && !entry.externalExecutor,
    );
}

/**
 * Roles an operator may pick for the role-agnostic `link_existing_person` command.
 *
 * Derived: every candidate declared by a relationship definition, plus the native financial roles
 * that have no definition row. A new relationship definition widens this picker automatically.
 */
export function listEditableRelationshipRoles(): RelationshipRoleKey[] {
    const NATIVE_EDITABLE_ROLES = ["billing_contact", "payer"];
    const seen = new Set<string>();
    const out: RelationshipRoleKey[] = [];
    for (const key of [
        ...RELATIONSHIP_DEFINITIONS.flatMap((d) => d.role_key_candidates),
        ...NATIVE_EDITABLE_ROLES,
    ]) {
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(key);
    }
    return out;
}
