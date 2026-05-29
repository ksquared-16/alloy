import {
    formatLocationAgeRange,
    readLocationMetadataPresentation,
    type LocationMetadataPresentation,
} from "@/lib/admin/location/locationMetadataFields";

export type { LocationMetadataPresentation };

export function locationMetadataPresentation(metadata: unknown): LocationMetadataPresentation {
    return readLocationMetadataPresentation(metadata);
}

export { formatLocationAgeRange };

export function formatLocationTypeLabel(locationType: string | null | undefined): string {
    const t = String(locationType ?? "").trim().toLowerCase();
    if (t === "site") return "Site";
    if (t === "unit") return "Room";
    if (t === "address") return "Address";
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : "—";
}
