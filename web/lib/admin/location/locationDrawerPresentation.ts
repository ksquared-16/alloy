import type { EntityDrawerFieldConfig, EntityDrawerSectionConfig } from "@/lib/entityPresentation";
import { readLocationMetadataPresentation } from "@/lib/admin/location/locationMetadataFields";
import {
    labelForLocationFieldKey,
    LOCATION_ROOM_METADATA_FIELD_KEYS,
    LOCATION_SITE_METADATA_FIELD_KEYS,
    type LocationFieldDefLike,
} from "@/lib/admin/location/locationMetadataFieldKeys";

const SITE_HIDDEN_SECTION_KEYS = new Set(["custom_property_fields", "customer", "relationships", "overview"]);

const PARENT_SITE_LINK_FIELD: EntityDrawerFieldConfig = {
    key: "parent_location_id",
    label: "Parent site",
    span: 2,
    renderHint: "link",
    editable: false,
    linkTarget: { entityType: "locations", idField: "parent_location_id" },
};

function metadataField(
    fieldDefs: LocationFieldDefLike[] | undefined,
    key: string,
    fallbackLabel: string,
    span: 1 | 2,
    renderHint: EntityDrawerFieldConfig["renderHint"] = "text"
): EntityDrawerFieldConfig {
    return {
        key,
        label: labelForLocationFieldKey(fieldDefs, key, fallbackLabel),
        span,
        renderHint,
        editable: true,
    };
}

function siteMetadataFields(fieldDefs?: LocationFieldDefLike[]): EntityDrawerFieldConfig[] {
    return LOCATION_SITE_METADATA_FIELD_KEYS.map((key) => {
        const hint = key === "site_phone" ? "phone" : "text";
        const fallback =
            key === "director_name" ? "Director name"
            : key === "director_email" ? "Director email"
            : "Site phone";
        return metadataField(fieldDefs, key, fallback, 1, hint);
    });
}

function unitMetadataFields(fieldDefs?: LocationFieldDefLike[]): EntityDrawerFieldConfig[] {
    const fallbacks: Record<(typeof LOCATION_ROOM_METADATA_FIELD_KEYS)[number], string> = {
        category: "Category",
        age_range_from: "Age range from",
        age_range_to: "Age range to",
        age_range_unit: "Age range unit",
        capacity: "Capacity",
        student_teacher_ratio: "Student:Teacher Ratio",
    };
    const spans: Record<(typeof LOCATION_ROOM_METADATA_FIELD_KEYS)[number], 1 | 2> = {
        category: 2,
        age_range_from: 1,
        age_range_to: 1,
        age_range_unit: 1,
        capacity: 1,
        student_teacher_ratio: 1,
    };
    return LOCATION_ROOM_METADATA_FIELD_KEYS.map((key) =>
        metadataField(fieldDefs, key, fallbacks[key], spans[key])
    );
}

export function locationDrawerKind(locationType: string | null | undefined): "site" | "unit" | "other" {
    const t = String(locationType ?? "").trim().toLowerCase();
    if (t === "site") return "site";
    if (t === "unit") return "unit";
    return "other";
}

function siteDetailSections(
    sections: EntityDrawerSectionConfig[],
    fieldDefs?: LocationFieldDefLike[]
): EntityDrawerSectionConfig[] {
    const overview = sections.find((s) => s.key === "overview");
    const addressFields = (overview?.fields ?? []).filter((f) =>
        ["address1", "address2", "city", "state", "postal_code"].includes(f.key)
    );
    return [
        {
            key: "location_site_details",
            title: "Site details",
            defaultExpanded: true,
            collapsible: true,
            gridCols: 2,
            fields: [...(overview?.fields.filter((f) => f.key === "label") ?? []), ...siteMetadataFields(fieldDefs)],
        },
        {
            key: "location_address",
            title: "Address",
            defaultExpanded: true,
            collapsible: true,
            gridCols: 2,
            fields: addressFields.length
                ? addressFields
                : [{ key: "address1", label: "Address", span: 2, renderHint: "text", editable: true }],
        },
    ];
}

function unitDetailSections(
    sections: EntityDrawerSectionConfig[],
    fieldDefs?: LocationFieldDefLike[]
): EntityDrawerSectionConfig[] {
    const overview = sections.find((s) => s.key === "overview");
    return [
        {
            key: "location_unit_details",
            title: "Room details",
            defaultExpanded: true,
            collapsible: true,
            gridCols: 3,
            fields: [
                ...(overview?.fields.filter((f) => f.key === "label") ?? []),
                PARENT_SITE_LINK_FIELD,
                ...unitMetadataFields(fieldDefs),
            ],
        },
    ];
}

export function applyLocationDrawerPresentation(
    sections: EntityDrawerSectionConfig[],
    locationType: string | null | undefined,
    fieldDefs?: LocationFieldDefLike[]
): EntityDrawerSectionConfig[] {
    const kind = locationDrawerKind(locationType);
    if (kind === "site") {
        return siteDetailSections(sections, fieldDefs);
    }
    if (kind === "unit") {
        return unitDetailSections(sections, fieldDefs);
    }

    return sections;
}

export function locationCustomContentKeysForKind(
    locationType: string | null | undefined
): { customer: boolean; relationships: boolean; custom_property_fields: boolean } {
    const kind = locationDrawerKind(locationType);
    if (kind === "site" || kind === "unit") {
        return { customer: false, relationships: false, custom_property_fields: false };
    }
    return { customer: true, relationships: true, custom_property_fields: true };
}

/** Spread metadata values into location form state for drawer editing. */
export function locationMetadataFormValues(record: Record<string, unknown>): Record<string, string> {
    const meta = readLocationMetadataPresentation(record.metadata);
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(meta)) {
        if (v != null) out[k] = v;
    }
    return out;
}

export const LOCATION_DRAWER_METADATA_FORM_KEYS = [
    ...LOCATION_SITE_METADATA_FIELD_KEYS,
    ...LOCATION_ROOM_METADATA_FIELD_KEYS,
] as const;
