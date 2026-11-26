/**
 * Configuration Assignment Runtime — platform contract (Stage 2.5 certification).
 *
 * This is NOT "Programs Make Available" renamed.
 * Programs is the first adapter. Tuition does NOT use this runtime.
 *
 * Kind discrimination (doctrine):
 * - assignment / availability → this runtime (publish revision → make available at scopes)
 * - value inheritance / override → OrganizationLocationScope + Override Pattern (Tuition, fees, policies)
 * - authorization assignment → Access (roles + site/dept scope) — orthogonal
 * - surface/process binding → Surfaces publication + process bind — different bind axis
 *
 * Shared operator confidence pattern (cross-cutting):
 *   Preview → Review → Commit
 * used by Assignment Runtime and recommended for Publish / Apply Override / Activate / Migrate.
 */

export const CONFIGURATION_ASSIGNMENT_RUNTIME_KEY = "configuration.assignment.runtime.v1";

/** Domains whose product posture is Location availability assignment (not value inherit). */
export const CONFIGURATION_ASSIGNMENT_CANDIDATE_DOMAINS = [
    "programs",
    "business_processes",
    "surfaces_location_availability", // only if product becomes Location availability — not process bind
    "automation",
] as const;

/** Domains that must NOT invent a second assignment engine — they use value inherit/override. */
export const CONFIGURATION_VALUE_INHERITANCE_DOMAINS = [
    "tuition",
    "fees_catalog",
    "commercial_policies",
    "financial_policies",
] as const;

export type ConfigurationAssignmentOperatorVerb =
    | "Make available"
    | "Enable"
    | "Activate"
    | "Publish / Assign"
    | "Apply"; // Prefer "Apply" only when meaning availability; Tuition "Apply to Locations" is value copy — different primitive

export type ConfigurationPrimitiveKind =
    | "assignment_availability"
    | "value_inheritance_override"
    | "authorization_assignment"
    | "surface_process_binding"
    | "preview_commit_operator_pattern";

/**
 * Organization page implementation gate (post–Stage 3 strategy).
 * Answer before inventing page-local behavior.
 */
export type OrganizationPagePrimitiveChecklist = {
    isObjectCollection: boolean;
    needsConfigurationAssignment: boolean;
    needsConfigurationContinuity: boolean;
    supportsLocalOverrides: boolean;
    requiresPreviewCommit: boolean;
};

export function classifyOrganizationDomainPrimitive(domainKey: string): ConfigurationPrimitiveKind {
    switch (domainKey) {
        case "programs":
        case "business_processes":
        case "automation":
            return "assignment_availability";
        case "tuition":
        case "fees":
        case "catalog":
        case "policies":
        case "financials":
            return "value_inheritance_override";
        case "access":
            return "authorization_assignment";
        case "surfaces":
            return "surface_process_binding";
        default:
            return "preview_commit_operator_pattern";
    }
}

/**
 * Smell check: claiming Tuition needs Configuration Assignment Runtime
 * means we confused value override with availability assignment.
 */
export function wouldRequireSecondAssignmentEngine(domainKey: string): boolean {
    // Tuition/fees/policies already have the correct engine (inherit/override).
    // A "second assignment engine" smell appears only if someone tries to rebuild
    // availability distribution for those value domains.
    return (
        domainKey === "tuition"
        || domainKey === "fees"
        || domainKey === "catalog"
        || domainKey === "policies"
    );
}
