/**
 * Childcare canonical field catalog doctrine (Entity + Field Catalog Cleanup E1/E3).
 *
 * Classifies field_definitions for operator trust:
 * - operator_configurable: shown by default in Fields + pickers
 * - system_workflow: status keys, pipeline keys, derived values, workflow metadata
 * - relationship_reference: FK/reference fields; hidden by default
 * - integration: Stripe, external IDs, provider IDs, vertical IDs
 * - legacy_home_services: home-services / generic platform residue
 * - legacy_compatibility: old aliases kept for runtime only
 */

import type { LifecycleRequirementEntityKey } from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";

export type FieldCatalogClass =
    | "operator_configurable"
    | "system_workflow"
    | "relationship_reference"
    | "integration"
    | "legacy_home_services"
    | "legacy_compatibility";

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
        "appointment_id",
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
        "discount_amount",
        "discount_code",
        "discount_validated_at",
        "estimated_price",
        "estimated_price_cents",
        "quote_subtotal",
        "quote_total",
        "recurring_price",
        "recurring_price_cents",
        "display_total_cents",
        "monetary_value",
        "monetary_value_cents",
        "fee_schedule",
        "tuition",
        "tuition_pricing",
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
        "status",
        "status_key",
        "status_group",
        "assigned_to",
        "lost_reason",
        "notes",
        "follow_up_notes",
        "next_follow_up_at",
        "customer_notes",
    ],
    inquiry_child: ["outcome_status_key", "notes"],
    location: ["classroom_age_group", "room_schedule_type"],
    customer: ["status", "status_key"],
    person: ["status", "status_key"],
};

const INTEGRATION_KEYS: Readonly<Record<string, readonly string[]>> = {
    opportunity: ["external_id", "external_source", "vertical"],
    customer: [
        "stripe_customer_id",
        "external_id",
        "external_source",
        "vertical",
        "customer_type",
        "customer_number",
    ],
    location: ["external_id", "external_source"],
    person: ["external_id", "external_source"],
    inquiry_child: ["external_id", "external_source"],
};

const LEGACY_COMPATIBILITY_KEYS: Readonly<Record<string, readonly string[]>> = {
    inquiry_child: ["desired_program_type"],
};

const RELATIONSHIP_REFERENCE_KEYS: Readonly<Record<string, readonly string[]>> = {
    opportunity: [
        "customer_id",
        "primary_person_id",
        "primary_contact_id",
        "contact_id",
        "assigned_vendor_id",
    ],
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
        "location_id",
        "tour_date",
        "tour_time",
        "tour_status",
        "desired_start_date",
    ],
    inquiry_child: [
        "desired_start_date",
        "location_id",
        "desired_program_category_id",
        "program_room_cohort_key",
        "desired_schedule_type",
        "first_name",
        "last_name",
        "date_of_birth",
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
for (const [entity, keys] of Object.entries(INTEGRATION_KEYS)) {
    registerClass(entity, keys, "integration");
}
for (const [entity, keys] of Object.entries(LEGACY_COMPATIBILITY_KEYS)) {
    registerClass(entity, keys, "legacy_compatibility");
}
for (const [entity, keys] of Object.entries(RELATIONSHIP_REFERENCE_KEYS)) {
    registerClass(entity, keys, "relationship_reference");
}

function classifyByPattern(entityType: string, fieldKey: string): FieldCatalogClass | null {
    const et = entityType.trim().toLowerCase();
    const key = fieldKey.trim().toLowerCase();
    if (!key) return null;

    if (/^(status_key|status_group|status)$/.test(key)) return "system_workflow";
    if (key === "stripe_customer_id" || /^stripe_/.test(key)) return "integration";
    if (key === "vertical" || key.endsWith("_vertical_id")) return "integration";
    if (key === "external_id" || key === "external_source") return "integration";
    if (key === "appointment_id" || /^quote_|^discount_|^recurring_price/.test(key)) {
        return "legacy_home_services";
    }
    if (/^estimated_price|^monetary_value|^job_date|^job_time/.test(key)) return "legacy_home_services";
    if (key === "desired_program_type") return "legacy_compatibility";
    if (key === "outcome_status_key") return "system_workflow";
    if (key === "customer_type" || key === "customer_number") return "integration";
    if (et === "opportunity" && /^tour_/.test(key) && key !== "tour_date" && key !== "tour_time" && key !== "tour_status") {
        return "system_workflow";
    }
    return null;
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
        fromConfig === "integration" ||
        fromConfig === "legacy_home_services" ||
        fromConfig === "legacy_compatibility"
    ) {
        return fromConfig;
    }
    const et = entityType.trim().toLowerCase();
    const key = fieldKey.trim();
    const lookup = CLASS_LOOKUP.get(`${et}:${key}`);
    if (lookup) return lookup;
    const pattern = classifyByPattern(et, key);
    if (pattern) return pattern;
    return "operator_configurable";
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

export type EnrollmentOperatorFieldRow = {
    is_system?: boolean;
    config?: Record<string, unknown> | null;
};

export type EnrollmentOperatorFieldVisibilityOptions = {
    /** Reveal system/integration/legacy fields (Fields advanced toggle). */
    include_advanced?: boolean;
};

/** DB / lifecycle entity_type for a lifecycle requirement entity key. */
export function lifecycleRequirementEntityToFieldDefinitionEntity(entity: LifecycleRequirementEntityKey): string {
    switch (entity) {
        case "child":
            return "inquiry_child";
        case "opportunity":
            return "opportunity";
        case "customer":
            return "customer";
        case "person":
            return "person";
    }
}

/**
 * Unified enrollment operator field visibility — BP Stage Requirements, Fields, Forms, Layouts.
 * Custom (non-system) org fields are always visible unless explicitly tagged hidden in config.
 */
export function isEnrollmentOperatorFieldVisible(
    entityType: string,
    fieldKey: string,
    row?: EnrollmentOperatorFieldRow | null,
    options?: EnrollmentOperatorFieldVisibilityOptions
): boolean {
    const key = fieldKey.trim();
    if (!key) return false;

    if (options?.include_advanced) {
        return true;
    }

    if (row?.is_system === false) {
        const forced = row.config?.operator_catalog_class;
        if (
            forced === "legacy_home_services" ||
            forced === "legacy_compatibility" ||
            forced === "system_workflow" ||
            forced === "relationship_reference" ||
            forced === "integration"
        ) {
            return false;
        }
        return true;
    }

    return isChildcareOperatorPickerVisible(entityType, key, row ?? undefined);
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

/** Whether a child program field key is the legacy alias (not operator-selectable). */
export function isLegacyChildProgramFieldKey(fieldKey: string): boolean {
    return fieldKey.trim() === CHILDCARE_PROGRAM_FIELD_MODEL.legacy_alias_field_key;
}
