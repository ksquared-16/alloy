/**
 * Programs → Locations availability vocabulary.
 * Production mutations: `@/lib/programs/makeProgramAvailableClient` (Stage 3).
 * Fixture/session helpers were removed when Stage 3 went production.
 */

export const PROGRAM_LOCATION_AVAILABILITY_STAGE = "production" as const;

export function isProgramLocationAvailabilityPrototype(): boolean {
    return false;
}

/** Operator-facing status vocabulary (Programs domain). */
export const PROGRAM_LOCATION_STATUS_LABEL = {
    organizationDefinition: "Organization definition",
    availableAtLocation: "Available at Location",
    inheritsOrganization: "Inherits Organization",
    locallyConfigured: "Locally configured",
    notAvailable: "Not available",
    blocked: "Blocked",
    restoreOrganizationDefault: "Restore Organization default",
} as const;
