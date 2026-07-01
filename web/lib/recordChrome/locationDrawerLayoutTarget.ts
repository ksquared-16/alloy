/**
 * Target Location drawer layout — Card 1 convergence prep.
 *
 * Documents the intended configured-layout shape for `locations` before the entity
 * joins Settings → Layouts and `record_drawer_layouts` runtime resolution.
 *
 * **Runtime today:** `web/lib/entityPresentation.ts` (`locations.drawer`) + `field_definitions`
 * (`entity_type = location`). `AdminEntityDrawer` does not read `record_drawer_layouts` for locations.
 *
 * **Blockers to full convergence:** see `docs/sprints/05_2026/record_person_location_convergence_audit.md` § Card 1.
 */

export type LocationDrawerFieldAvailability =
    | "implemented"
    | "field_definition"
    | "metadata_only"
    | "not_implemented";

export type LocationDrawerTargetField = {
    field_key: string;
    label: string;
    availability: LocationDrawerFieldAvailability;
    notes?: string;
};

export type LocationDrawerTargetSection = {
    section_key: string;
    title: string;
    applies_to: Array<"all" | "address" | "site" | "unit">;
    fields: LocationDrawerTargetField[];
};

/** Intended default drawer sections when location joins the layout control plane. */
export const LOCATION_DRAWER_LAYOUT_TARGET_V1: {
    entity_type: "location";
    surface: "drawer";
    tabs: readonly string[];
    sections: LocationDrawerTargetSection[];
} = {
    entity_type: "location",
    surface: "drawer",
    tabs: ["overview", "related", "activity", "documents"],
    sections: [
        {
            section_key: "location_identity",
            title: "Location",
            applies_to: ["all"],
            fields: [
                { field_key: "label", label: "Location name", availability: "implemented" },
                { field_key: "location_type", label: "Location type", availability: "implemented" },
                {
                    field_key: "parent_location_id",
                    label: "Parent location",
                    availability: "implemented",
                    notes: "Hydrated as parent label on entity GET; hierarchy edit API deferred.",
                },
                {
                    field_key: "square_footage_tier_key",
                    label: "Square footage",
                    availability: "field_definition",
                    notes: "Option set `square_footage_tier`; mirrored on service address rows.",
                },
                {
                    field_key: "is_active",
                    label: "Active",
                    availability: "implemented",
                    notes: "Deactivate via PATCH; no archived_at column on locations.",
                },
                { field_key: "status_key", label: "Status", availability: "implemented" },
            ],
        },
        {
            section_key: "site_contact",
            title: "Site details",
            applies_to: ["site"],
            fields: [
                { field_key: "address1", label: "Address", availability: "implemented" },
                { field_key: "city", label: "City", availability: "implemented" },
                { field_key: "state", label: "State", availability: "implemented" },
                { field_key: "postal_code", label: "Postal code", availability: "implemented" },
                {
                    field_key: "phone",
                    label: "Phone",
                    availability: "not_implemented",
                    notes: "No phone column on locations — requires schema or metadata card.",
                },
                {
                    field_key: "email",
                    label: "Email",
                    availability: "not_implemented",
                    notes: "No email column on locations — requires schema or metadata card.",
                },
                {
                    field_key: "director_person_id",
                    label: "Director",
                    availability: "not_implemented",
                    notes: "No director FK on locations — use person_locations or future config card.",
                },
            ],
        },
        {
            section_key: "unit_classroom",
            title: "Room details",
            applies_to: ["unit"],
            fields: [
                {
                    field_key: "parent_location_id",
                    label: "Parent site",
                    availability: "implemented",
                },
                {
                    field_key: "age_range",
                    label: "Age range",
                    availability: "not_implemented",
                    notes: "No first-class column; may live in metadata in seeds only.",
                },
                {
                    field_key: "room_category",
                    label: "Room category",
                    availability: "metadata_only",
                    notes: "Optional metadata.semantic_kind / location_types catalog label.",
                },
                {
                    field_key: "capacity",
                    label: "Capacity",
                    availability: "not_implemented",
                    notes: "Requires schema or field_definitions card.",
                },
                {
                    field_key: "ratio_licensing_notes",
                    label: "Ratio / licensing notes",
                    availability: "not_implemented",
                    notes: "Requires schema or field_definitions card.",
                },
            ],
        },
        {
            section_key: "custom_property_fields",
            title: "Property & custom fields",
            applies_to: ["all"],
            fields: [],
        },
        {
            section_key: "customer",
            title: "Customer",
            applies_to: ["address"],
            fields: [],
        },
        {
            section_key: "relationships",
            title: "Relationships",
            applies_to: ["all"],
            fields: [],
        },
    ],
};
