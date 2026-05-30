/**
 * Location-specific public link metadata — same form, per-link routing (Firefly multi-site).
 */

const UUID_RE = /^[0-9a-f-]{36}$/i;

export type LocationSpecificLinkInput = {
    label: string;
    locationId: string;
    workUnitId?: string | null;
};

export function readUuid(val: unknown): string | null {
    return typeof val === "string" && UUID_RE.test(val.trim()) ? val.trim() : null;
}

/** Build client metadata patch for a location-specific share link. */
export function buildLocationSpecificLinkMetadata(input: LocationSpecificLinkInput): Record<string, unknown> {
    const label = input.label.trim();
    const locationId = readUuid(input.locationId);
    if (!label) throw new Error("Link name is required");
    if (!locationId) throw new Error("Location is required");

    const metadata: Record<string, unknown> = {
        label,
        default_location_id: locationId,
        distribution_context: "location_specific",
    };

    const workUnitId = readUuid(input.workUnitId);
    if (workUnitId) metadata.default_work_unit_id = workUnitId;

    return metadata;
}

/** Resolve location label from link metadata + org catalog. */
export function resolveLinkLocationLabel(
    linkMetadata: Record<string, unknown> | null | undefined,
    locationCatalog: Record<string, string> | null | undefined
): string | null {
    const locationId = readUuid(
        linkMetadata && typeof linkMetadata === "object" ?
            (linkMetadata as Record<string, unknown>).default_location_id
        :   null
    );
    if (!locationId) return null;
    const label = locationCatalog?.[locationId];
    return label && label.trim() ? label.trim() : "Location configured";
}
