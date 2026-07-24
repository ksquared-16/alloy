/**
 * Domain-neutral Organization ↔ Location configuration scope primitives.
 * Proven by Programs (assignment + coarse override) and Tuition (rate cell inherit/override).
 */

export type ConfigurationOwnershipSource =
    | "organization_default"
    | "inherited"
    | "location_override"
    | "location_required"
    | "not_assigned";

export type ConfigurationMutationScope = "location_only" | "organization_default";

export function configurationOwnershipLabel(
    source: ConfigurationOwnershipSource,
    locationLabel?: string | null,
): string {
    switch (source) {
        case "organization_default":
            return "Organization default";
        case "inherited":
            return "Inherited from Organization";
        case "location_override":
            return locationLabel?.trim()
                ? `Overridden by ${locationLabel.trim()}`
                : "Location override";
        case "location_required":
            return "Location must supply";
        case "not_assigned":
            return "Not assigned";
        default:
            return "Unknown source";
    }
}

export function resolveTuitionCellOwnership(input: {
    hasLocationRow: boolean;
    locationId: string | null | undefined;
}): ConfigurationOwnershipSource {
    if (!input.locationId) return "organization_default";
    return input.hasLocationRow ? "location_override" : "inherited";
}

export function resolveProgramOfferingOwnership(input: {
    hasProgramRevision: boolean;
    hasLocalDescriptionOverride: boolean;
}): ConfigurationOwnershipSource {
    if (!input.hasProgramRevision) return "location_required";
    if (input.hasLocalDescriptionOverride) return "location_override";
    return "inherited";
}

export type ConfigurationImpactPreview = {
    willUpdate: readonly { id: string; label: string }[];
    excludedOverrides: readonly { id: string; label: string; reason: string }[];
};

export function buildOrganizationDefaultImpactPreview(input: {
    locations: readonly { id: string; label: string; hasOverride: boolean }[];
}): ConfigurationImpactPreview {
    const willUpdate: { id: string; label: string }[] = [];
    const excludedOverrides: { id: string; label: string; reason: string }[] = [];
    for (const location of input.locations) {
        if (location.hasOverride) {
            excludedOverrides.push({
                id: location.id,
                label: location.label,
                reason: "Has a Location override and will not change",
            });
        } else {
            willUpdate.push({ id: location.id, label: location.label });
        }
    }
    return { willUpdate, excludedOverrides };
}
