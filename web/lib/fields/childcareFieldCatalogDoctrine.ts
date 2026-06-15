/**
 * Childcare canonical field catalog doctrine (Entity + Field Catalog Cleanup E1).
 *
 * Classifies field_definitions for operator trust:
 * - operator_configurable: shown by default in Fields + pickers
 * - system_workflow: hidden by default; reveal via toggle
 * - relationship_reference: FK/reference fields; hidden by default
 * - legacy_home_services: home-services / generic platform residue; hidden everywhere by default
 */

export type FieldCatalogClass =
    | "operator_configurable"
    | "system_workflow"
    | "relationship_reference"
    | "legacy_home_services";

export type ChildcareFieldsHubEntityTier = "primary" | "advanced" | "hidden";

/** Settings → Fields entity tabs for childcare MVP. */
export const CHILDCARE_FIELDS_HUB_PRIMARY_ENTITIES = [
    "person",
    "customer",
    "opportunity",
    "inquiry_child",
    "location",
] as const;

/** Unfinished operational entities — hidden from operator configuration paths (not deleted). */
export const CHILDCARE_FIELDS_HUB_ADVANCED_ENTITIES = [] as const;

export const CHILDCARE_FIELDS_HUB_HIDDEN_ENTITIES = [
    "job",
    "customer_member",
    "vendor",
    "schedule",
    "enrollment",
] as const;

export type ChildcareFieldsHubEntity =
    | (typeof CHILDCARE_FIELDS_HUB_PRIMARY_ENTITIES)[number]
    | (typeof CHILDCARE_FIELDS_HUB_ADVANCED_ENTITIES)[number]
    | (typeof CHILDCARE_FIELDS_HUB_HIDDEN_ENTITIES)[number];

export function childcareFieldsHubEntityTier(entityType: string): ChildcareFieldsHubEntityTier {
    const et = entityType.trim().toLowerCase();
    if ((CHILDCARE_FIELDS_HUB_PRIMARY_ENTITIES as readonly string[]).includes(et)) return "primary";
    if ((CHILDCARE_FIELDS_HUB_ADVANCED_ENTITIES as readonly string[]).includes(et)) return "advanced";
    return "hidden";
}

export function isChildcareFieldsHubVisibleEntity(entityType: string): boolean {
    return childcareFieldsHubEntityTier(entityType) !== "hidden";
}

/** Operator-facing entity label overrides (singular) when industry labels unavailable. */
export const CHILDCARE_FIELD_ENTITY_SINGULAR_LABELS: Readonly<Record<string, string>> = {
    person: "Person",
    customer: "Family",
    opportunity: "Lead",
    inquiry_child: "Child",
    location: "Location / Site",
    vendor: "Provider",
    schedule: "Schedule",
};

const LEGACY_HOME_SERVICES_KEYS: Readonly<Record<string, readonly string[]>> = {
    location: [
        "access_method",
        "access_method_id",
        "access_notes",
        "beds",
        "baths",
        "home_type",
        "square_footage",
        "square_footage_tier",
        "bedrooms",
        "bathrooms",
        "external_source",
        "external_id",
        "latitude",
        "longitude",
        "lat",
        "lng",
        "parent_location_id",
    ],
    opportunity: [
        "job_date",
        "job_time_window",
        "specialty_cleaning_type",
        "preferred_service_date",
        "specialty_quote_notes",
        "cleaning_frequency",
        "promo_campaign",
        "sms_consent",
        "email_consent",
        "program_type",
        "schedule_type",
        "desired_program_type",
        "desired_schedule_type",
    ],
    job: [
        "title",
        "description",
        "service_key",
        "job_type",
        "scheduled_at",
        "completed_at",
        "service_frequency_key",
        "is_recurring",
    ],
};

const SYSTEM_WORKFLOW_KEYS: Readonly<Record<string, readonly string[]>> = {
    opportunity: [
        "status_key",
        "assigned_to",
        "lost_reason",
        "quote_total",
        "quote_subtotal",
        "recurring_price_cents",
        "estimated_price_cents",
        "monetary_value_cents",
        "display_total_cents",
        "fee_schedule",
        "tuition",
        "tuition_pricing",
        "notes",
        "follow_up_notes",
        "next_follow_up_at",
    ],
    inquiry_child: ["outcome_status_key", "desired_program_type", "notes"],
    location: ["classroom_age_group", "room_schedule_type"],
};

const RELATIONSHIP_REFERENCE_KEYS: Readonly<Record<string, readonly string[]>> = {
    opportunity: ["customer_id", "location_id", "primary_person_id", "primary_contact_id", "assigned_vendor_id"],
    location: ["customer_id", "vendor_id"],
    person: ["customer_id"],
    customer: ["primary_person_id"],
};

/** Canonical childcare fields that should be operator-visible when present. */
export const CHILDCARE_CANONICAL_OPERATOR_FIELDS: Readonly<Record<string, readonly string[]>> = {
    location: [
        "license_capacity",
        "director_name",
        "director_email",
        "site_phone",
        "category",
        "capacity",
        "age_range_from",
        "age_range_to",
        "age_range_unit",
        "student_teacher_ratio",
    ],
    opportunity: [
        "name",
        "source",
        "inquiry_source",
        "tour_date",
        "desired_start_date",
    ],
    inquiry_child: [
        "desired_start_date",
        "location_id",
        "desired_program_category_id",
        "program_room_cohort_key",
        "desired_schedule_type",
    ],
    person: ["first_name", "last_name", "email", "phone"],
    customer: ["name", "family_notes", "subsidy_status", "billing_notes"],
};

const CLASS_LOOKUP = new Map<string, FieldCatalogClass>();

function registerClass(entityType: string, keys: readonly string[], catalogClass: FieldCatalogClass) {
    for (const key of keys) {
        CLASS_LOOKUP.set(`${entityType}:${key}`, catalogClass);
    }
}

for (const [entity, keys] of Object.entries(LEGACY_HOME_SERVICES_KEYS)) {
    registerClass(entity, keys, "legacy_home_services");
}
for (const [entity, keys] of Object.entries(SYSTEM_WORKFLOW_KEYS)) {
    registerClass(entity, keys, "system_workflow");
}
for (const [entity, keys] of Object.entries(RELATIONSHIP_REFERENCE_KEYS)) {
    registerClass(entity, keys, "relationship_reference");
}

export function childcareFieldCatalogClass(
    entityType: string,
    fieldKey: string,
    config?: Record<string, unknown> | null
): FieldCatalogClass {
    const fromConfig = config?.operator_catalog_class;
    if (
        fromConfig === "operator_configurable" ||
        fromConfig === "system_workflow" ||
        fromConfig === "relationship_reference" ||
        fromConfig === "legacy_home_services"
    ) {
        return fromConfig;
    }
    const key = `${entityType.trim().toLowerCase()}:${fieldKey.trim()}`;
    return CLASS_LOOKUP.get(key) ?? "operator_configurable";
}

/** Hidden from default Fields list and operator pickers. */
export function isChildcareLegacyOrSystemField(
    entityType: string,
    fieldKey: string,
    config?: Record<string, unknown> | null
): boolean {
    const catalogClass = childcareFieldCatalogClass(entityType, fieldKey, config);
    return catalogClass !== "operator_configurable";
}

/** Visible in Fields default list and Layouts/Forms/BP pickers. */
export function isChildcareOperatorPickerVisible(
    entityType: string,
    fieldKey: string,
    row?: { is_system?: boolean; config?: Record<string, unknown> | null }
): boolean {
    if (isChildcareLegacyOrSystemField(entityType, fieldKey, row?.config)) return false;
    return true;
}

export function isChildcareCanonicalField(entityType: string, fieldKey: string): boolean {
    const keys = CHILDCARE_CANONICAL_OPERATOR_FIELDS[entityType.trim().toLowerCase()];
    return keys?.includes(fieldKey.trim()) ?? false;
}

/** Program MVP — canonical storage for desired program on inquiry child. */
export const CHILDCARE_PROGRAM_FIELD_MODEL = {
    canonical_field_key: "desired_program_category_id",
    legacy_alias_field_key: "desired_program_type",
    entity_type: "inquiry_child",
    storage_table: "opportunity_customer_members",
    storage_column: "desired_program_category_id",
    option_source: "programs_for_location" as const,
    depends_on_field_key: "location_id" as const,
    operator_label: "Program",
    legacy_label: "Program",
} as const;
