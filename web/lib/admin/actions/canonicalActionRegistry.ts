/**
 * Canonical platform action registry — code-side catalog of action capabilities.
 *
 * Runtime availability still flows through action_definitions + action_placements (DB).
 * Relationship actions share the same actionKey / executor model; layout builder and BOS
 * read from this registry rather than maintaining parallel catalogs.
 *
 * @see docs/archive/2026-06-superseded-system/actions-and-workflows.md
 */

import type { ActionRegistryEntry } from "@/lib/admin/actions/actionDefinitionRegistry";
import { ACTION_BUTTON_LIBRARY, type CapabilityInteractionHost } from "@/lib/admin/actions/actionDefinitionRegistry";
import type { RelationshipActionKey } from "@/lib/admin/relationship/relationshipActionContract";
import {
    RELATIONSHIP_ACTION_REGISTRY,
    type RelationshipActionRegistryEntry,
} from "@/lib/admin/relationship/relationshipActionRegistry";
import type { DrawerLayoutEditorSurfaceKey } from "@/lib/layout/drawerLayoutEditorSurfaceConfig";
import type { LayoutEditorActionPickerContext } from "@/lib/layout/layoutEditorActionCatalog";

export type CanonicalActionCategory =
    | "relationship"
    | "record"
    | "communication"
    | "workflow"
    | "status_lifecycle"
    | "bos_native";

/** Where an action may be placed / invoked (platform-wide). */
export type CanonicalActionPlacement =
    | "workspace_actions_menu"
    | "drawer_header_actions"
    | "drawer_section"
    | "drawer_contact_block"
    | "drawer_related_list_row"
    | "drawer_repeater_row"
    | "queue_row"
    | "bos_rail";

export type CanonicalActionConfirmationPolicy = "required" | "none" | "destructive";

export type CanonicalActionExecutor =
    | { kind: "admin_execute"; definitionKey: string; formKey?: string }
    | { kind: "relationship_execute"; relationshipKey: RelationshipActionKey }
    | { kind: "dedicated_modal"; modal: "make_primary_contact" }
    | { kind: "ui_intent"; intent: string };

export type CanonicalActionDefinition = {
    actionKey: string;
    label: string;
    description: string;
    category: CanonicalActionCategory;
    /** Empty = all business processes when BP resolver is active. */
    allowedBusinessProcesses: readonly string[];
    /** Empty = all stages within BP when stage resolver is active. */
    allowedStages: readonly string[];
    allowedPlacements: readonly CanonicalActionPlacement[];
    allowedLayoutSurfaces: readonly DrawerLayoutEditorSurfaceKey[];
    allowedLayoutContexts: readonly LayoutEditorActionPickerContext[];
    requiredContext: {
        entityTypes: readonly ("opportunity" | "person" | "child")[];
        requiresCustomer: boolean;
        requiresOpportunity: boolean;
    };
    inputSchema: "relationship_wizard" | "registry_form" | "none";
    executor: CanonicalActionExecutor;
    confirmationPolicy: CanonicalActionConfirmationPolicy;
    bosProposalSupport: boolean;
    runtimeWired: boolean;
    settingsConfigurable: boolean;
    /** Capability-declared interaction host; the runtime resolves the host from this, not the key. */
    interactionHost?: CapabilityInteractionHost;
};

const LAYOUT_CONTEXT_ALL: readonly LayoutEditorActionPickerContext[] = [
    "section_row",
    "contact_block",
    "contact_related_list",
    "contact_repeater_row",
];

const LAYOUT_SURFACE_ALL: readonly DrawerLayoutEditorSurfaceKey[] = [
    "opportunity_drawer",
    "person_drawer",
    "child_drawer",
];

function layoutPlacementsFromRelationship(entry: RelationshipActionRegistryEntry): CanonicalActionPlacement[] {
    if (entry.actionKey === "make_primary_contact") {
        const placements: CanonicalActionPlacement[] = [];
        if (entry.allowedContexts.includes("contact_block")) placements.push("drawer_contact_block");
        if (entry.allowedContexts.includes("contact_related_list")) placements.push("drawer_related_list_row");
        if (entry.allowedContexts.includes("contact_repeater_row")) placements.push("drawer_repeater_row");
        return placements;
    }
    const placements = new Set<CanonicalActionPlacement>(["bos_rail"]);
    if (entry.allowedContexts.includes("section_row")) placements.add("drawer_section");
    if (entry.allowedContexts.includes("contact_block")) placements.add("drawer_contact_block");
    if (entry.allowedContexts.includes("contact_related_list")) placements.add("drawer_related_list_row");
    if (entry.allowedContexts.includes("contact_repeater_row")) placements.add("drawer_repeater_row");
    return [...placements];
}

function relationshipCanonicalEntry(entry: RelationshipActionRegistryEntry): CanonicalActionDefinition {
    const actionKey = entry.actionKey;
    const entityTypes: CanonicalActionDefinition["requiredContext"]["entityTypes"] =
        entry.identityKind === "child" ?
            entry.allowedSurfaces.includes("child_drawer") ?
                ["child", "opportunity", "person"]
            :   ["opportunity", "person"]
        :   entry.allowedSurfaces.includes("child_drawer") ?
            ["child", "opportunity", "person"]
        :   ["opportunity", "person"];

    return {
        actionKey,
        label: entry.label,
        description: entry.description,
        category: "relationship",
        allowedBusinessProcesses: [],
        allowedStages: [],
        allowedPlacements: layoutPlacementsFromRelationship(entry),
        allowedLayoutSurfaces: entry.allowedSurfaces,
        allowedLayoutContexts: entry.allowedContexts,
        requiredContext: {
            entityTypes,
            requiresCustomer: true,
            requiresOpportunity: entry.allowedScopes.includes("this_opportunity"),
        },
        inputSchema: "relationship_wizard",
        executor:
            entry.externalExecutor ?
                { kind: "dedicated_modal", modal: "make_primary_contact" }
            :   { kind: "relationship_execute", relationshipKey: actionKey },
        confirmationPolicy: "required",
        bosProposalSupport: entry.allowedSourceSurfaces.includes("bos_rail"),
        runtimeWired: entry.runtimeWired,
        settingsConfigurable: false,
        // Capture-first Add Child on What's Next — not the Link existing | Create new wizard.
        ...(actionKey === "add_child"
            ? {
                  interactionHost: "inline_form" as const,
                  inputSchema: "registry_form" as const,
              }
            : {}),
    };
}

function platformSurfaceToPlacements(entry: ActionRegistryEntry): CanonicalActionPlacement[] {
    const placements: CanonicalActionPlacement[] = [];
    switch (entry.defaultSurface) {
        case "record_header":
            placements.push("drawer_header_actions");
            break;
        case "queue_row":
            placements.push("queue_row");
            break;
        case "record_section":
            placements.push("drawer_section");
            break;
        default:
            break;
    }
    if (entry.category === "bos_native") placements.push("bos_rail");
    placements.push("workspace_actions_menu");
    return placements;
}

function platformCanonicalEntry(entry: ActionRegistryEntry): CanonicalActionDefinition {
    return {
        actionKey: entry.key,
        label: entry.label,
        description: entry.description,
        category: entry.category as CanonicalActionCategory,
        allowedBusinessProcesses: [],
        allowedStages: [],
        allowedPlacements: platformSurfaceToPlacements(entry),
        allowedLayoutSurfaces: [],
        allowedLayoutContexts: [],
        requiredContext: {
            entityTypes: ["opportunity"],
            requiresCustomer: false,
            requiresOpportunity: true,
        },
        inputSchema: entry.category === "workflow" || entry.category === "status_lifecycle" ? "registry_form" : "none",
        executor: { kind: "admin_execute", definitionKey: entry.key },
        confirmationPolicy: entry.category === "status_lifecycle" ? "destructive" : "required",
        bosProposalSupport: entry.category === "bos_native",
        runtimeWired: true,
        settingsConfigurable: entry.settingsConfigurable,
        interactionHost: entry.interactionHost,
    };
}

/** Lifecycle / drawer actions not in ACTION_BUTTON_LIBRARY but in action_definitions. */
const LIFECYCLE_PLATFORM_ACTIONS: CanonicalActionDefinition[] = [
    {
        actionKey: "create_lead",
        label: "Create lead",
        description: "Create a new enrollment opportunity and household.",
        category: "record",
        allowedBusinessProcesses: ["enrollment"],
        allowedStages: ["lead", "new_inquiry"],
        allowedPlacements: ["workspace_actions_menu", "drawer_header_actions"],
        allowedLayoutSurfaces: [],
        allowedLayoutContexts: [],
        requiredContext: { entityTypes: ["opportunity"], requiresCustomer: false, requiresOpportunity: false },
        inputSchema: "registry_form",
        executor: { kind: "admin_execute", definitionKey: "create_lead", formKey: "create_lead" },
        confirmationPolicy: "required",
        // Aligned with RegisteredAction.createLeadAction.bosProposalSupport — BOS may
        // propose/prepare Create Lead; execution remains the registered action path.
        bosProposalSupport: true,
        runtimeWired: true,
        settingsConfigurable: true,
    },
    {
        actionKey: "add_child",
        label: "Add child",
        description: "Add a child to this family and enrollment case.",
        category: "relationship",
        allowedBusinessProcesses: ["enrollment"],
        allowedStages: ["lead", "new_inquiry", "waitlist"],
        allowedPlacements: ["drawer_header_actions", "drawer_section", "drawer_related_list_row", "workspace_actions_menu", "bos_rail"],
        allowedLayoutSurfaces: ["opportunity_drawer", "person_drawer"],
        allowedLayoutContexts: ["section_row", "contact_related_list"],
        requiredContext: { entityTypes: ["opportunity", "person"], requiresCustomer: true, requiresOpportunity: true },
        inputSchema: "registry_form",
        executor: { kind: "relationship_execute", relationshipKey: "add_child" },
        confirmationPolicy: "required",
        bosProposalSupport: true,
        runtimeWired: true,
        settingsConfigurable: true,
        // What's Next / Current Work: capture-first create form — not the Link existing | Create new wizard.
        interactionHost: "inline_form",
    },
    {
        actionKey: "update_enrollment_status",
        label: "Change Enrollment Status",
        description: "Move child enrollment status or household record to a configured destination stage.",
        category: "status_lifecycle",
        allowedBusinessProcesses: ["enrollment"],
        allowedStages: [],
        allowedPlacements: ["drawer_header_actions", "queue_row", "workspace_actions_menu", "bos_rail"],
        allowedLayoutSurfaces: ["opportunity_drawer", "child_drawer", "person_drawer"],
        allowedLayoutContexts: ["section_row"],
        requiredContext: { entityTypes: ["opportunity", "child"], requiresCustomer: false, requiresOpportunity: true },
        inputSchema: "registry_form",
        executor: { kind: "admin_execute", definitionKey: "update_enrollment_status", formKey: "update_enrollment_status" },
        confirmationPolicy: "required",
        bosProposalSupport: true,
        runtimeWired: true,
        settingsConfigurable: true,
    },
    {
        actionKey: "add_sibling",
        label: "Add sibling",
        description: "Add another child to this enrollment (sibling).",
        category: "relationship",
        allowedBusinessProcesses: ["enrollment"],
        allowedStages: ["lead", "new_inquiry", "waitlist"],
        allowedPlacements: ["drawer_header_actions", "workspace_actions_menu"],
        allowedLayoutSurfaces: ["opportunity_drawer"],
        allowedLayoutContexts: ["section_row"],
        requiredContext: { entityTypes: ["opportunity"], requiresCustomer: true, requiresOpportunity: true },
        inputSchema: "registry_form",
        executor: { kind: "admin_execute", definitionKey: "add_sibling", formKey: "add_child" },
        confirmationPolicy: "required",
        bosProposalSupport: false,
        runtimeWired: true,
        settingsConfigurable: true,
    },
    {
        actionKey: "add_family_member",
        label: "Add family member",
        description: "Add a household adult (parent/guardian) to this enrollment.",
        category: "relationship",
        allowedBusinessProcesses: ["enrollment"],
        allowedStages: ["lead", "new_inquiry", "waitlist"],
        allowedPlacements: ["drawer_header_actions", "workspace_actions_menu"],
        allowedLayoutSurfaces: ["opportunity_drawer", "person_drawer"],
        allowedLayoutContexts: ["section_row", "contact_block"],
        requiredContext: { entityTypes: ["opportunity", "person"], requiresCustomer: true, requiresOpportunity: true },
        inputSchema: "registry_form",
        executor: { kind: "admin_execute", definitionKey: "add_family_member", formKey: "add_family_member" },
        confirmationPolicy: "required",
        bosProposalSupport: false,
        runtimeWired: true,
        settingsConfigurable: true,
    },
];

function buildCanonicalActionRegistry(): CanonicalActionDefinition[] {
    const byKey = new Map<string, CanonicalActionDefinition>();
    for (const entry of ACTION_BUTTON_LIBRARY.map(platformCanonicalEntry)) {
        byKey.set(entry.actionKey, entry);
    }
    for (const entry of LIFECYCLE_PLATFORM_ACTIONS) {
        if (!byKey.has(entry.actionKey)) byKey.set(entry.actionKey, entry);
    }
    for (const entry of RELATIONSHIP_ACTION_REGISTRY.map(relationshipCanonicalEntry)) {
        byKey.set(entry.actionKey, entry);
    }
    return [...byKey.values()];
}

export const CANONICAL_ACTION_REGISTRY: CanonicalActionDefinition[] = buildCanonicalActionRegistry();

const CANONICAL_BY_KEY = new Map(CANONICAL_ACTION_REGISTRY.map((entry) => [entry.actionKey, entry]));

export function canonicalActionDefinition(actionKey: string): CanonicalActionDefinition | null {
    return CANONICAL_BY_KEY.get(actionKey.trim()) ?? null;
}

export function listCanonicalRelationshipActionKeys(): RelationshipActionKey[] {
    return RELATIONSHIP_ACTION_REGISTRY.map((entry) => entry.actionKey);
}

export function isCanonicalRelationshipExecutor(actionKey: string): boolean {
    const def = canonicalActionDefinition(actionKey);
    return def?.executor.kind === "relationship_execute";
}

/** Map layout editor surface + context → canonical placement(s). */
export function canonicalPlacementsForLayoutContext(input: {
    surfaceKey: DrawerLayoutEditorSurfaceKey;
    context: LayoutEditorActionPickerContext;
}): CanonicalActionPlacement[] {
    const placements: CanonicalActionPlacement[] = [];
    if (input.context === "section_row") placements.push("drawer_section");
    if (input.context === "contact_block") placements.push("drawer_contact_block");
    if (input.context === "contact_related_list") placements.push("drawer_related_list_row");
    if (input.context === "contact_repeater_row") placements.push("drawer_repeater_row");
    return placements;
}

export function layoutContextMatchesCanonicalAction(
    entry: CanonicalActionDefinition,
    input: { surfaceKey: DrawerLayoutEditorSurfaceKey; context: LayoutEditorActionPickerContext },
): boolean {
    if (entry.allowedLayoutSurfaces.length === 0) return false;
    if (!entry.allowedLayoutSurfaces.includes(input.surfaceKey)) return false;
    if (!entry.allowedLayoutContexts.includes(input.context)) return false;
    return true;
}

export { LAYOUT_CONTEXT_ALL, LAYOUT_SURFACE_ALL };
