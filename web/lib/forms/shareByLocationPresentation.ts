import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveOrgSiteLocationsForAdmin } from "@/lib/admin/resolveOrgSiteLocations";
import type { OutcomeRoutingLabelCatalog } from "@/lib/forms/outcomeConfigLabelCatalog";
import type { OutcomeConfigPickerOption } from "@/lib/forms/resolveOutcomeConfigPickerOptions";

export const SHARE_BY_LOCATION_COPY = {
    sectionTitle: "Share by Location",
    helper:
        "One form can create separate links for each school. Each link routes new inquiries to the selected location.",
    createPrompt: "Choose a school",
    createSectionTitle: "Create new location link",
    createButton: "Create link",
    createLink: "Create link",
    copyLink: "Copy link",
    copyEmbed: "Copy embed",
    notSetUp: "Not set up yet",
    emptyLocations: "No active locations found. Add locations before creating campus-specific links.",
    publishFirst: "Publish your form before creating campus share links.",
    selectLocation: "Select a school…",
    tableLocation: "School",
    tableStatus: "Status",
    tableActions: "Actions",
    copyIframe: "Copy iframe",
    openLink: "Open",
    embedOnceHint: "Copy embed code right after creating the link",
    noLinksYet: "No campus links yet. Choose a school above to create one.",
} as const;

/** Operator-facing share link label: `{Form Name} — {Location Name}`. */
export function buildLocationShareLinkLabel(formName: string, locationName: string): string {
    const form = formName.trim();
    const location = locationName.trim();
    if (form && location) return `${form} — ${location}`;
    return location || form || "Share link";
}

export type ShareByLocationSiteOption = OutcomeConfigPickerOption;

/** Active site locations for Share by Location — uses canonical org site query. */
export async function resolveShareByLocationSitePickerOptions(
    supabase: SupabaseClient,
    orgId: string,
    options?: { allowedSiteLocationIds?: string[] | null }
): Promise<ShareByLocationSiteOption[]> {
    return resolveOrgSiteLocationsForAdmin(supabase, orgId, options);
}

/** @deprecated Use shareByLocationSites from API — single canonical source. */
export function shareByLocationSitesFromCatalog(
    catalog: { locations?: Record<string, string> } | null | undefined
): ShareByLocationSiteOption[] {
    if (!catalog?.locations) return [];
    return Object.entries(catalog.locations)
        .map(([id, label]) => ({ id, label }))
        .sort((a, b) => a.label.localeCompare(b.label));
}

export function resolveShareByLocationSiteLabel(
    siteId: string,
    sites: ShareByLocationSiteOption[]
): string | null {
    const match = sites.find((s) => s.id === siteId);
    return match?.label?.trim() ? match.label.trim() : null;
}

/** Shorter table label — campus name when routed, otherwise stored link label. */
export function shareByLocationRowLabel(
    linkMetadata: Record<string, unknown> | null | undefined,
    locationCatalog: Record<string, string> | null | undefined,
    fallbackLabel: string
): string {
    const locationId =
        linkMetadata && typeof linkMetadata.default_location_id === "string" ?
            linkMetadata.default_location_id.trim()
        :   "";
    if (locationId && locationCatalog?.[locationId]) {
        return locationCatalog[locationId];
    }
    const stored =
        linkMetadata && typeof linkMetadata.label === "string" ? linkMetadata.label.trim() : "";
    if (stored.includes("—")) {
        const tail = stored.split("—").pop()?.trim();
        if (tail) return tail;
    }
    return fallbackLabel;
}

export type OutcomeLabelsApiPayload = OutcomeRoutingLabelCatalog & {
    pickerOptions?: unknown;
    shareByLocationSites?: ShareByLocationSiteOption[] | null;
};

/** Unwrap `{ data: … }` API responses from outcome-labels route. */
export function parseOutcomeLabelsApiPayload(json: unknown): OutcomeLabelsApiPayload | null {
    if (!json || typeof json !== "object") return null;
    const root = json as Record<string, unknown>;
    const payload =
        root.data && typeof root.data === "object" && !Array.isArray(root.data) ?
            (root.data as OutcomeLabelsApiPayload)
        :   (root as OutcomeLabelsApiPayload);
    return payload;
}

/** Location-specific public link for a campus — excludes general/default share links. */
export function findLocationSpecificShareLinkForSite(
    links: Array<{ id: string; is_active: boolean; metadata?: Record<string, unknown> }>,
    siteId: string
): { id: string; is_active: boolean; metadata?: Record<string, unknown> } | null {
    for (const link of links) {
        const meta = link.metadata;
        if (!meta || typeof meta !== "object") continue;
        if (meta.distribution_context !== "location_specific") continue;
        const loc = meta.default_location_id;
        if (typeof loc === "string" && loc.trim() === siteId) return link;
    }
    return null;
}

/** @deprecated Use findLocationSpecificShareLinkForSite — general links are not campus share links. */
export function findShareLinkForSite(
    links: Array<{ id: string; is_active: boolean; metadata?: Record<string, unknown> }>,
    siteId: string
): { id: string; is_active: boolean; metadata?: Record<string, unknown> } | null {
    return findLocationSpecificShareLinkForSite(links, siteId);
}
