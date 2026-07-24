/**
 * Fixture Configuration Object domain for Checkpoint C.5 reference harness.
 * Not mounted on production Organization routes.
 */

import type {
    ConfigurationObjectCollectionItem,
    ConfigurationObjectIdentity,
    ConfigurationObjectWorkspaceDescriptor,
} from "@/lib/configRuntime/configurationObject/types";

export const CONFIGURATION_OBJECT_HARNESS_DOMAIN_ID = "config-object-harness" as const;

export const CONFIGURATION_OBJECT_HARNESS_DESCRIPTOR: ConfigurationObjectWorkspaceDescriptor = {
    domainId: CONFIGURATION_OBJECT_HARNESS_DOMAIN_ID,
    objectTypeLabel: "Harness Object",
    collectionLabel: "Harness Objects",
    basePath: "/dev/configuration-object-harness",
    objectIdQueryParam: "objectId",
    concernQueryParam: "concern",
    itemIdQueryParam: "itemId",
    defaultConcernKey: "overview",
    lifecycleSlots: {
        assignment: true,
        publication: true,
        distribution: false,
        activation: true,
        history: true,
    },
    concerns: [
        {
            key: "overview",
            label: "Overview",
            order: 0,
            capability: "overview",
            visible: true,
            permissionAllowed: true,
        },
        {
            key: "relationships",
            label: "Relationships",
            order: 1,
            capability: "relationships",
            visible: true,
            permissionAllowed: true,
        },
        {
            key: "secrets",
            label: "Restricted",
            order: 2,
            capability: "domain",
            visible: true,
            permissionAllowed: false,
        },
        {
            key: "history",
            label: "History",
            order: 3,
            capability: "history",
            visible: true,
            permissionAllowed: true,
        },
        {
            key: "publication",
            label: "Publication",
            order: 4,
            capability: "publication",
            visible: true,
            permissionAllowed: true,
        },
    ],
};

export type HarnessObjectRecord = {
    id: string;
    label: string;
    summary: string;
    status: "active" | "inactive";
    related: string[];
};

export const CONFIGURATION_OBJECT_HARNESS_FIXTURES: readonly HarnessObjectRecord[] = [
    {
        id: "obj-alpha",
        label: "Alpha Policy Pack",
        summary: "Reference authored object for Continuity + Object Runtime certification.",
        status: "active",
        related: ["Locations · Downtown", "Programs · Preschool"],
    },
    {
        id: "obj-beta",
        label: "Beta Funding Rule",
        summary: "Second fixture used for selection and Back/Forward projection.",
        status: "inactive",
        related: ["Funding · Subsidy A"],
    },
];

export function harnessCollectionItems(): ConfigurationObjectCollectionItem[] {
    return CONFIGURATION_OBJECT_HARNESS_FIXTURES.map((row) => ({
        id: row.id,
        label: row.label,
        supportingLabel: row.summary,
        hasAttention: row.status === "inactive",
        lifecycleStatus: row.status,
        publicationState: row.status === "active" ? "published" : "draft_only",
        publicationLabel: row.status === "active" ? "Published" : "Draft",
    }));
}

export function harnessIdentity(objectId: string): ConfigurationObjectIdentity | null {
    const row = CONFIGURATION_OBJECT_HARNESS_FIXTURES.find((item) => item.id === objectId);
    if (!row) return null;
    return {
        domainId: CONFIGURATION_OBJECT_HARNESS_DOMAIN_ID,
        objectId: row.id,
        objectType: "harness_object",
        displayName: row.label,
        secondaryIdentity: row.id,
        lifecycleStatus: row.status,
        ownershipScopeLabel: "Organization",
    };
}

export function harnessRecord(objectId: string): HarnessObjectRecord | null {
    return CONFIGURATION_OBJECT_HARNESS_FIXTURES.find((item) => item.id === objectId) ?? null;
}
