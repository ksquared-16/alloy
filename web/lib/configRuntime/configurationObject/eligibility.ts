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
        notes:
            "First production consumer planned for Checkpoint D. Publication/assignment/distribution already exist. Continuity already retains programId/programSection; workspace does not yet restore via Continuity (D gap).",
    },
    {
        id: "commercial-compat",
        label: "Commercial (compat)",
        kind: "utility",
        primaryPath: "/settings/commercial",
        objectRuntimeEligible: false,
        notes: "Legacy/compat chapter home — not a peer object; retire as peer IA after Programs owns pricing/policies.",
    },
    {
        id: "tuition",
        label: "Tuition structures",
        kind: "nested_concern",
        primaryPath: "/settings/commercial (tuition) · Program pricing",
        objectRuntimeEligible: true,
        notes:
            "Today nested under Commercial/Program; eligible as extracted Configuration Object after Programs adoption.",
    },
    {
        id: "funding",
        label: "Funding definitions",
        kind: "utility",
        primaryPath: "/settings/commercial (funding)",
        objectRuntimeEligible: false,
        notes: "Placeholder (“managed in Processing”) — not yet an authored object surface.",
    },
    {
        id: "policies",
        label: "Policies",
        kind: "nested_concern",
        primaryPath: "/settings/commercial (policies) · Program policies",
        objectRuntimeEligible: true,
        notes: "Split authoring (Commercial panel + Program section); eligible for object extraction later.",
    },
    {
        id: "catalog",
        label: "Catalog (fees/products)",
        kind: "nested_concern",
        primaryPath: "/settings/commercial (fees)",
        objectRuntimeEligible: true,
        notes: "Product/fee rows exist but trapped in Commercial chapter — not Locations-class workspace yet.",
    },
    {
        id: "accounting",
        label: "Accounting",
        kind: "utility",
        primaryPath: "/settings/commercial (accounting) · /settings/financials",
        objectRuntimeEligible: false,
        notes: "Reference / GL mapping panels — not collection→detail object.",
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
        id: "financials",
        label: "Financials",
        kind: "operational",
        primaryPath: "/settings/financials",
        objectRuntimeEligible: false,
        notes: "Mixed: rate plans are partial objects; consumption/obligations are operational — older ConfigurationQueue shell.",
    },
    {
        id: "statuses",
        label: "Statuses",
        kind: "configuration_object",
        primaryPath: "/settings/statuses",
        objectRuntimeEligible: true,
        notes: "Durable status defs with select→edit; needs Detail Runtime convergence (post-Programs).",
    },
    {
        id: "surfaces",
        label: "Surfaces",
        kind: "configuration_object",
        primaryPath: "/settings/surfaces",
        objectRuntimeEligible: true,
        notes: "Durable surface IDs; studio editors — not yet on ConfigDetailRuntime grammar.",
    },
    {
        id: "processes",
        label: "Business Processes",
        kind: "operational",
        primaryPath: "/settings/processes",
        objectRuntimeEligible: false,
        notes: "Lifecycle builder workspace — object-like but separate product surface.",
    },
    {
        id: "entities",
        label: "Entities",
        kind: "singleton",
        primaryPath: "/settings/entities",
        objectRuntimeEligible: false,
        notes: "Vocabulary / terminology landing — not collection→detail.",
    },
    {
        id: "access",
        label: "Access (Users & Roles)",
        kind: "utility",
        primaryPath: "/settings/users-roles",
        objectRuntimeEligible: false,
        notes: "Permission administration utility; Location also owns Access concern.",
    },
    {
        id: "communications",
        label: "Communications",
        kind: "singleton",
        primaryPath: "/organization/communications",
        objectRuntimeEligible: false,
        notes: "Provider/setup bindings — singleton setup, not selected-object Detail Runtime yet.",
    },
    {
        id: "fields",
        label: "Data Model / Fields",
        kind: "utility",
        primaryPath: "/settings/fields",
        objectRuntimeEligible: false,
        notes: "Platform data-model authoring — entity selector with field concerns, not Organization object class.",
    },
] as const;

export function configurationObjectEligibleSurfaces(): ConfigurationSurfaceClassification[] {
    return ORGANIZATION_SURFACE_CLASSIFICATION.filter((s) => s.objectRuntimeEligible);
}
