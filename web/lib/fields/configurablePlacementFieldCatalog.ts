/**
 * Configurable placement/reference field catalog for Settings → Fields.
 * School → Program → Room cascade is model-driven via field_definitions.config.
 */

import type { PlacementOptionSource } from "@/lib/fields/inquiryChildPlacementFieldMetadata";

export type PlacementFieldTemplateKey = "school" | "program" | "room";

export type ConfigurablePlacementFieldTemplate = {
    template_key: PlacementFieldTemplateKey;
    operator_label: string;
    description: string;
    entity_type: string;
    field_key: string;
    field_type: "select";
    /** Native system column — upserted via ensure-platform-field, not custom POST. */
    is_native_system: boolean;
    section_key: string;
    sort_order: number;
    config: Record<string, unknown>;
};

const SCHOOL_SITE_FILTER = { location_type: "site" } as const;
const ROOM_UNIT_FILTER = { location_type: "unit" } as const;

export const CONFIGURABLE_PLACEMENT_FIELD_TEMPLATES: readonly ConfigurablePlacementFieldTemplate[] = [
    {
        template_key: "school",
        operator_label: "School / Location",
        description: "Family or child preferred school/site (locations reference).",
        entity_type: "opportunity",
        field_key: "location_id",
        field_type: "select",
        is_native_system: true,
        section_key: "inquiry_context",
        sort_order: 25,
        config: {
            operator_catalog_class: "operator_configurable",
            option_source: "locations",
            field_kind: "entity_reference",
            target_entity_type: "location",
            location_filter: SCHOOL_SITE_FILTER,
            storage_class: "native_column",
            storage_table: "opportunities",
            storage_column: "location_id",
        },
    },
    {
        template_key: "school",
        operator_label: "School / Location",
        description: "Child school/site for enrollment placement (may differ from lead).",
        entity_type: "inquiry_child",
        field_key: "location_id",
        field_type: "select",
        is_native_system: true,
        section_key: "inquiry_participation",
        sort_order: 15,
        config: {
            operator_catalog_class: "operator_configurable",
            option_source: "locations",
            field_kind: "entity_reference",
            target_entity_type: "location",
            location_filter: SCHOOL_SITE_FILTER,
            storage_class: "native_column",
            storage_table: "opportunity_customer_members",
            storage_column: "location_id",
        },
    },
    {
        template_key: "program",
        operator_label: "Program",
        description: "Location-owned program/category; options filter from selected school.",
        entity_type: "inquiry_child",
        field_key: "desired_program_category_id",
        field_type: "select",
        is_native_system: true,
        section_key: "inquiry_participation",
        sort_order: 18,
        config: {
            operator_catalog_class: "operator_configurable",
            option_source: "programs_for_location",
            field_kind: "entity_reference",
            target_entity_type: "location_program_category",
            depends_on_field_key: "location_id",
            storage_class: "native_column",
            storage_table: "opportunity_customer_members",
            storage_column: "desired_program_category_id",
        },
    },
    {
        template_key: "room",
        operator_label: "Room",
        description: "Classroom/unit under school; filters from school and program when set.",
        entity_type: "inquiry_child",
        field_key: "program_room_cohort_key",
        field_type: "select",
        is_native_system: true,
        section_key: "inquiry_participation",
        sort_order: 22,
        config: {
            operator_catalog_class: "operator_configurable",
            option_source: "rooms_for_location_program",
            field_kind: "entity_reference",
            target_entity_type: "location",
            location_filter: ROOM_UNIT_FILTER,
            depends_on_field_key: "desired_program_category_id",
            storage_class: "native_column",
            storage_table: "opportunity_customer_members",
            storage_column: "program_room_cohort_key",
        },
    },
] as const;

export function listConfigurablePlacementFieldTemplatesForEntity(
    entityType: string,
): ConfigurablePlacementFieldTemplate[] {
    const et = entityType.trim().toLowerCase();
    return CONFIGURABLE_PLACEMENT_FIELD_TEMPLATES.filter((t) => t.entity_type === et);
}

export function findConfigurablePlacementFieldTemplate(
    entityType: string,
    fieldKey: string,
): ConfigurablePlacementFieldTemplate | null {
    const et = entityType.trim().toLowerCase();
    const key = fieldKey.trim();
    return (
        CONFIGURABLE_PLACEMENT_FIELD_TEMPLATES.find((t) => t.entity_type === et && t.field_key === key) ?? null
    );
}

export function listMissingPlacementFieldTemplatesForEntity(
    entityType: string,
    existingFieldKeys: ReadonlySet<string> | readonly string[],
): ConfigurablePlacementFieldTemplate[] {
    const keys = existingFieldKeys instanceof Set ? existingFieldKeys : new Set(existingFieldKeys);
    return listConfigurablePlacementFieldTemplatesForEntity(entityType).filter((t) => !keys.has(t.field_key));
}

/** Resolve cascade metadata from catalog when field_definitions row is unavailable. */
export function placementCascadeConfigForEntityField(
    entityType: string,
    fieldKey: string,
): {
    option_source: PlacementOptionSource | null;
    depends_on_field_key: string | null;
} | null {
    const template = findConfigurablePlacementFieldTemplate(entityType, fieldKey);
    if (!template) return null;
    const optionSource = template.config.option_source;
    const dependsOn = template.config.depends_on_field_key;
    return {
        option_source: typeof optionSource === "string" ? (optionSource as PlacementOptionSource) : null,
        depends_on_field_key: typeof dependsOn === "string" ? dependsOn.trim() || null : null,
    };
}
