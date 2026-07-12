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

export type RelationshipIdentityKind = "person" | "child" | "either";

export type RelationshipWriteTarget =
    | "persons"
    | "contacts"
    | "customer_persons"
    | "customer_members"
    | "opportunity_persons"
    | "opportunity_customer_members"
    | "customer_member_contacts";

export type RelationshipExecutorKind =
    | "child_scoped_contact"
    | "guardian"
    | "billing"
    | "add_child"
    | "link_person"
    | "link_child"
    | "make_primary_external";

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

export const RELATIONSHIP_ACTION_REGISTRY: RelationshipActionRegistryEntry[] = [
    {
        actionKey: "add_emergency_contact",
        label: "Add Emergency Contact",
        description: "Add or link an emergency contact scoped to this child or siblings.",
        identityKind: "person",
        defaultRoleKey: "emergency_contact",
        roleEditable: false,
        allowedSurfaces: ["child_drawer"],
        allowedContexts: ["section_row", "contact_block"],
        allowedScopes: ["this_child", "selected_children", "all_children_in_household"],
        allowedSourceSurfaces: ["child_drawer", "bos_rail"],
        writeTargets: ["contacts", "customer_persons"],
        executorKind: "child_scoped_contact",
        confirmationCopy: "This will link the person as an emergency contact on the selected child record(s).",
        bosExamples: [
            "Add Grandma Susan as emergency contact for Billie and her siblings.",
            "Add emergency contact Pat for this child only.",
        ],
        runtimeWired: true,
    },
    {
        actionKey: "add_authorized_pickup",
        label: "Add Authorized Pickup",
        description: "Authorize a person for pickup on this child or selected siblings.",
        identityKind: "person",
        defaultRoleKey: "authorized_pickup",
        roleEditable: false,
        allowedSurfaces: ["child_drawer"],
        allowedContexts: ["section_row", "contact_block"],
        allowedScopes: ["this_child", "selected_children", "all_children_in_household"],
        allowedSourceSurfaces: ["child_drawer", "bos_rail"],
        writeTargets: ["contacts"],
        executorKind: "child_scoped_contact",
        confirmationCopy: "This will link the person as authorized pickup on the selected child record(s).",
        bosExamples: ["Add Uncle Mike as authorized pickup for Riley."],
        runtimeWired: true,
    },
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
        actionKey: "add_parent_guardian",
        label: "Add Parent / Guardian",
        description: "Add or link a parent/guardian for this child or household.",
        identityKind: "person",
        defaultRoleKey: "guardian",
        roleEditable: false,
        allowedSurfaces: ["child_drawer", "opportunity_drawer"],
        allowedContexts: ["section_row", "contact_block"],
        allowedScopes: ["this_child", "selected_children", "all_children_in_household", "household"],
        allowedSourceSurfaces: ["child_drawer", "opportunity_drawer", "bos_rail"],
        writeTargets: ["contacts", "customer_persons", "customer_member_contacts"],
        executorKind: "guardian",
        confirmationCopy: "This will link the person as a guardian on the selected child record(s) and household.",
        bosExamples: ["Add Jordan Lee as guardian for both children."],
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
        writeTargets: ["customer_persons", "customer_member_contacts", "opportunity_persons"],
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

const REGISTRY_BY_KEY = new Map(RELATIONSHIP_ACTION_REGISTRY.map((entry) => [entry.actionKey, entry]));

export function relationshipActionRegistryEntry(
    actionKey: RelationshipActionKey,
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

export function listEditableRelationshipRoles(): RelationshipRoleKey[] {
    return [
        "emergency_contact",
        "authorized_pickup",
        "billing_contact",
        "payer",
        "guardian",
        "parent_guardian",
        "parent",
        "secondary_guardian",
    ];
}
