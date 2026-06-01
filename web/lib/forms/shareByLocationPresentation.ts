import type { SupabaseClient } from "@supabase/supabase-js";
import { LOCATION_DISPLAY_LABEL_SELECT } from "@/lib/admin/locationDisplayLabel";
import { locationLabelsFromRows, type OutcomeRoutingLabelCatalog } from "@/lib/forms/outcomeConfigLabelCatalog";
import type { OutcomeConfigPickerOption } from "@/lib/forms/resolveOutcomeConfigPickerOptions";

export const SHARE_BY_LOCATION_COPY = {
    sectionTitle: "Share by Location",
    helper:
        "One form can create separate links for each school. Each link routes new inquiries to the selected location.",
    createPrompt: "Choose a school",
    createButton: "Create link for location",
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

/** Active site locations for Share by Location — schools only, not classroom units. */
export async function resolveShareByLocationSitePickerOptions(
    supabase: SupabaseClient,
    orgId: string
): Promise<ShareByLocationSiteOption[]> {
    const { data, error } = await supabase
        .from("locations")
        .select(LOCATION_DISPLAY_LABEL_SELECT)
        .eq("org_id", orgId)
        .eq("is_active", true)
        .eq("location_type", "site")
        .order("label")
        .limit(200);
    if (error) throw new Error(error.message);

    const locationMap = locationLabelsFromRows(
        (data ?? []) as {
            id: string;
            label?: string | null;
            address1?: string | null;
            city?: string | null;
            postal_code?: string | null;
        }[]
    );

    return Object.entries(locationMap)
        .map(([id, label]) => ({ id, label }))
        .sort((a, b) => a.label.localeCompare(b.label));
}

/** Fallback when dedicated site query is unavailable. */
export function shareByLocationSitesFromCatalog(
    catalog: OutcomeRoutingLabelCatalog | null | undefined
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
