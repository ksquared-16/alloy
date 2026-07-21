/**
 * Organization domain eligibility for Configuration Object Runtime (C.5).
 *
 * Classification is product doctrine, not route inventory alone.
 */

export type ConfigurationSurfaceKind =
    | "configuration_object"
    | "hierarchical_workspace"
    | "nested_concern"
    | "landing"
    | "utility"
    | "singleton"
    | "operational"
    | "simulation";

export type ConfigurationSurfaceClassification = {
    id: string;
    label: string;
    kind: ConfigurationSurfaceKind;
    primaryPath: string;
    /** Eligible for ConfigurationObjectWorkspace adoption. */
    objectRuntimeEligible: boolean;
    notes: string;
};

/**
 * Current Organization / Configuration surfaces — Checkpoint C.5 evidence.
 * Update when IA changes; do not force every page into the object runtime.
 */
export const ORGANIZATION_SURFACE_CLASSIFICATION: readonly ConfigurationSurfaceClassification[] = [
    {
        id: "organization-landing",
        label: "Organization landing",
        kind: "landing",
        primaryPath: "/organization",
        objectRuntimeEligible: false,
        notes: "Domain cards / Continuity entry — not an object collection.",
    },
    {
        id: "locations",
        label: "Locations",
        kind: "hierarchical_workspace",
        primaryPath: "/organization/locations",
        objectRuntimeEligible: false,
        notes:
            "Strongest product reference for collection/detail laws, but hierarchical Location workspace with nested concerns — not the generic object model consumer.",
    },
    {
        id: "location-concerns",
        label: "Location nested concerns",
        kind: "nested_concern",
        primaryPath: "/organization/locations?tab=*",
        objectRuntimeEligible: false,
        notes: "Owned by Locations workspace (Checkpoint C), not Configuration Object Runtime.",
    },
    {
        id: "programs",
        label: "Programs",
        kind: "configuration_object",
        primaryPath: "/organization/programs",
        objectRuntimeEligible: true,
        notes: "First production consumer planned for Checkpoint D. Publication/assignment/distribution already exist.",
    },
    {
        id: "commercial-compat",
        label: "Commercial (compat)",
        kind: "utility",
        primaryPath: "/settings/commercial",
        objectRuntimeEligible: false,
        notes: "Legacy/compat shell — migrate via Programs, not a second object runtime.",
    },
    {
        id: "tuition",
        label: "Tuition structures",
        kind: "configuration_object",
        primaryPath: "/settings/commercial (tuition chapter)",
        objectRuntimeEligible: true,
        notes: "Eligible after Programs; remains chapter/sibling of Programs workspace until extracted.",
    },
    {
        id: "funding",
        label: "Funding definitions",
        kind: "configuration_object",
        primaryPath: "/settings/commercial (funding)",
        objectRuntimeEligible: true,
        notes: "Eligible catalog-style object; not in Checkpoint D scope.",
    },
    {
        id: "policies",
        label: "Policies",
        kind: "configuration_object",
        primaryPath: "/settings/commercial (policies)",
        objectRuntimeEligible: true,
        notes: "Eligible; may also appear as Program concern content.",
    },
    {
        id: "catalog",
        label: "Catalog",
        kind: "singleton",
        primaryPath: "/settings/commercial (catalog)",
        objectRuntimeEligible: false,
        notes: "Often a workspace chapter / reference surface without selected-object detail.",
    },
    {
        id: "accounting",
        label: "Accounting",
        kind: "utility",
        primaryPath: "/settings/commercial (accounting)",
        objectRuntimeEligible: false,
        notes: "Utility / ledger-adjacent configuration — not object collection/detail.",
    },
    {
        id: "simulator",
        label: "Simulator",
        kind: "simulation",
        primaryPath: "/settings/commercial (simulator)",
        objectRuntimeEligible: false,
        notes: "Simulation tool — operational/analysis, not authored Configuration Object.",
    },
    {
        id: "access",
        label: "Access (Users & Roles)",
        kind: "utility",
        primaryPath: "/settings/users-roles",
        objectRuntimeEligible: false,
        notes: "Permission administration utility.",
    },
    {
        id: "communications",
        label: "Communications",
        kind: "configuration_object",
        primaryPath: "/settings/communications",
        objectRuntimeEligible: true,
        notes: "Doctrine lists as Collection Runtime candidate; ownership still maturing.",
    },
    {
        id: "fields",
        label: "Data Model / Fields",
        kind: "utility",
        primaryPath: "/settings/fields",
        objectRuntimeEligible: false,
        notes: "Platform data-model authoring — distinct from Organization configuration objects.",
    },
] as const;

export function configurationObjectEligibleSurfaces(): ConfigurationSurfaceClassification[] {
    return ORGANIZATION_SURFACE_CLASSIFICATION.filter((s) => s.objectRuntimeEligible);
}
