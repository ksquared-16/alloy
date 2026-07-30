/**
 * Canonical Household relationship-section definitions.
 *
 * Definitions describe platform capabilities; tenant configs store section instances.
 */

export type RelationshipSectionClickBehavior =
    | "open_identity_details"
    | "handoff_to_surface"
    | "none";

export type RelationshipSectionPolicy = "required" | "default" | "optional";

export type RelationshipCriteria = {
    roleKeys?: string[];
    relationshipTypes?: string[];
    excludeRoleKeys?: string[];
};

export type HouseholdRelationshipSectionDefinition = {
    definitionKey: string;
    defaultLabel: string;
    /** Registry group key used for field presentation / disclosure authoring. */
    presentationGroupKey: string;
    supportedEntity: "person" | "child" | "collection";
    defaultCriteria?: RelationshipCriteria;
    clickBehavior: RelationshipSectionClickBehavior;
    handoffSurfaceKey?: string;
    policy: RelationshipSectionPolicy;
    defaultEnabled: boolean;
    allowMultipleInstances: boolean;
    sectionSemantic?: string;
};

/** Legacy registry group keys → canonical definition keys. */
export const LEGACY_GROUP_KEY_TO_DEFINITION: Record<string, string> = {
    primary_contact: "parent_primary",
    other_parent_guardian: "parent_guardian",
    household_members: "additional_contact",
    children: "children",
    emergency_contacts: "emergency_contact",
    authorized_pickups: "authorized_pickup",
    billing_contact: "billing_contact",
    emergency_medical: "emergency_medical",
    custom_notes: "custom_relationship",
};

const DEFINITIONS: HouseholdRelationshipSectionDefinition[] = [
    {
        definitionKey: "parent_primary",
        defaultLabel: "Primary Contact",
        presentationGroupKey: "primary_contact",
        supportedEntity: "person",
        policy: "required",
        defaultEnabled: true,
        allowMultipleInstances: false,
        clickBehavior: "open_identity_details",
        defaultCriteria: { roleKeys: ["primary", "primary_contact"] },
    },
    {
        definitionKey: "parent_guardian",
        defaultLabel: "Other Parent / Guardian",
        presentationGroupKey: "other_parent_guardian",
        supportedEntity: "person",
        policy: "default",
        defaultEnabled: true,
        allowMultipleInstances: false,
        clickBehavior: "open_identity_details",
        defaultCriteria: {
            // Include create-lead / Processing roles that historically landed as
            // family_member or primary_contact on the secondary adult.
            roleKeys: [
                "parent",
                "guardian",
                "family_member",
                "primary_contact",
                "secondary",
                "co_parent",
                "spouse",
                "partner",
            ],
            excludeRoleKeys: ["emergency", "pickup", "billing"],
        },
    },
    {
        definitionKey: "children",
        defaultLabel: "Children",
        presentationGroupKey: "children",
        supportedEntity: "child",
        policy: "default",
        defaultEnabled: true,
        allowMultipleInstances: false,
        clickBehavior: "handoff_to_surface",
        handoffSurfaceKey: "children_surface",
    },
    {
        definitionKey: "emergency_contact",
        defaultLabel: "Emergency Contacts",
        presentationGroupKey: "emergency_contacts",
        supportedEntity: "person",
        policy: "optional",
        defaultEnabled: false,
        allowMultipleInstances: false,
        clickBehavior: "open_identity_details",
        sectionSemantic: "emergency_contact",
        defaultCriteria: {
            roleKeys: ["emergency_contact", "emergency"],
            excludeRoleKeys: ["parent", "guardian", "primary"],
        },
    },
    {
        definitionKey: "authorized_pickup",
        defaultLabel: "Authorized Pickup",
        presentationGroupKey: "authorized_pickups",
        supportedEntity: "person",
        policy: "optional",
        defaultEnabled: false,
        allowMultipleInstances: false,
        clickBehavior: "open_identity_details",
        sectionSemantic: "authorized_pickup",
        defaultCriteria: {
            roleKeys: ["authorized_pickup", "pickup"],
            excludeRoleKeys: ["parent", "guardian", "emergency"],
        },
    },
    {
        definitionKey: "additional_contact",
        defaultLabel: "Additional Contacts",
        presentationGroupKey: "household_members",
        supportedEntity: "person",
        policy: "optional",
        defaultEnabled: true,
        allowMultipleInstances: false,
        clickBehavior: "open_identity_details",
        defaultCriteria: {
            roleKeys: ["additional", "contact", "member", "relative", "grandparent"],
        },
    },
    {
        definitionKey: "billing_contact",
        defaultLabel: "Billing Contact",
        presentationGroupKey: "billing_contact",
        supportedEntity: "person",
        policy: "optional",
        defaultEnabled: false,
        allowMultipleInstances: false,
        clickBehavior: "open_identity_details",
        sectionSemantic: "billing_contact",
        defaultCriteria: {
            roleKeys: ["billing_contact", "billing"],
        },
    },
    {
        definitionKey: "emergency_medical",
        defaultLabel: "Emergency Medical",
        presentationGroupKey: "emergency_medical",
        supportedEntity: "person",
        policy: "optional",
        defaultEnabled: false,
        allowMultipleInstances: false,
        clickBehavior: "open_identity_details",
        sectionSemantic: "emergency_medical",
    },
    {
        definitionKey: "custom_relationship",
        defaultLabel: "Custom Relationship",
        presentationGroupKey: "custom_notes",
        supportedEntity: "person",
        policy: "optional",
        defaultEnabled: false,
        allowMultipleInstances: true,
        clickBehavior: "open_identity_details",
        sectionSemantic: "custom",
    },
];

const BY_DEFINITION_KEY = new Map(DEFINITIONS.map((def) => [def.definitionKey, def]));
const BY_PRESENTATION_KEY = new Map(DEFINITIONS.map((def) => [def.presentationGroupKey, def]));

export function householdRelationshipSectionDefinitions(): readonly HouseholdRelationshipSectionDefinition[] {
    return DEFINITIONS;
}

export function householdRelationshipSectionDefinition(
    definitionKey: string,
): HouseholdRelationshipSectionDefinition | undefined {
    return BY_DEFINITION_KEY.get(definitionKey);
}

export function householdRelationshipSectionDefinitionForGroupKey(
    groupKey: string,
): HouseholdRelationshipSectionDefinition | undefined {
    const definitionKey = LEGACY_GROUP_KEY_TO_DEFINITION[groupKey];
    if (definitionKey) return BY_DEFINITION_KEY.get(definitionKey);
    return BY_PRESENTATION_KEY.get(groupKey);
}

export function householdRelationshipSectionDefinitionForLegacyGroup(
    groupKey: string,
): HouseholdRelationshipSectionDefinition | undefined {
    return householdRelationshipSectionDefinitionForGroupKey(groupKey);
}

/** Definitions an operator may add via + Add section. */
export function addableHouseholdRelationshipSectionDefinitions(
    existingDefinitionKeys: ReadonlySet<string>,
): HouseholdRelationshipSectionDefinition[] {
    return DEFINITIONS.filter((def) => {
        if (def.policy === "required") return false;
        if (!def.allowMultipleInstances && existingDefinitionKeys.has(def.definitionKey)) return false;
        return true;
    });
}

export function isRequiredHouseholdRelationshipDefinition(definitionKey: string): boolean {
    return BY_DEFINITION_KEY.get(definitionKey)?.policy === "required";
}

export function canRemoveHouseholdRelationshipInstance(args: {
    definitionKey: string;
    policy?: RelationshipSectionPolicy;
}): boolean {
    const def = householdRelationshipSectionDefinition(args.definitionKey);
    const policy = def?.policy ?? args.policy;
    return policy !== "required";
}
