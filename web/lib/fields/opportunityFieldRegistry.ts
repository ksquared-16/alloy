/**
 * Opportunity — native reference fields exposed for operator configuration.
 * Operator-facing entity_type: `opportunity` (Lead).
 */

export const OPPORTUNITY_ENTITY_TYPE = "opportunity" as const;

export type OpportunityNativeReferenceFieldKey = "location_id";

export type OpportunityNativeReferenceFieldConfig = {
    option_source?: "locations";
    field_kind?: "entity_reference";
    target_entity_type?: "location";
    storage_class?: "native_column";
    storage_table?: "opportunities";
    storage_column?: string;
    operator_catalog_class?: "operator_configurable";
};

export type OpportunityNativeReferenceFieldManifestRow = {
    field_key: OpportunityNativeReferenceFieldKey;
    field_type: "select";
    label: string;
    section_key: string;
    sort_order: number;
    is_visible_in_drawer: boolean;
    is_visible_in_form: boolean;
    is_visible_in_table: boolean;
    config: OpportunityNativeReferenceFieldConfig;
};

/** Native opportunity columns exposed as operator-configurable reference fields. */
export const OPPORTUNITY_NATIVE_REFERENCE_FIELD_MANIFEST: readonly OpportunityNativeReferenceFieldManifestRow[] = [
    {
        field_key: "location_id",
        field_type: "select",
        label: "School",
        section_key: "inquiry_context",
        sort_order: 25,
        is_visible_in_drawer: true,
        is_visible_in_form: true,
        is_visible_in_table: false,
        config: {
            operator_catalog_class: "operator_configurable",
            option_source: "locations",
            field_kind: "entity_reference",
            target_entity_type: "location",
            storage_class: "native_column",
            storage_table: "opportunities",
            storage_column: "location_id",
        },
    },
] as const;
