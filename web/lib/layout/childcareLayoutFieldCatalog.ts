/**
 * Childcare layout field catalog — operator-facing starter allowlist.
 *
 * Source of truth for storage paths:
 * docs/archive/2026-06-runtime-convergence/archive/2026-06-runtime-convergence/platform_convergence/childcare_field_catalog_source_matrix.md
 *
 * Internal refKeys (e.g. inquiry_child.*) remain; picker labels and grouping
 * are operator-facing only.
 */

import type { LayoutPickerAnchorEntity } from "./platformFieldResolutionManifest";

export type ChildcareOperatorEntity = "lead" | "child" | "parent" | "household" | "location";

export type ChildcareCatalogFieldEntry = {
    refKey: string;
    operatorEntity: ChildcareOperatorEntity;
    pickerLabel: string;
    fieldType: string;
    sortOrder: number;
    defEntityType?: string;
    defFieldKey?: string;
    /** Authoritative storage table (audit / FC-3 mapper). */
    storageTable?: string;
    storageColumn?: string;
    /** Human-readable resolution path for relationship projections. */
    storagePath?: string;
    computed?: boolean;
    /** Lead-only projection via opportunities.primary_person_id → persons (not field_definitions). */
    relationshipProjection?: boolean;
    /** Operator helper copy in layout picker. */
    pickerDescription?: string;
    layoutAnchors: LayoutPickerAnchorEntity[];
    /** inquiry_child.* enrollment fields — operator copy only. */
    enrollmentDetail?: boolean;
};

export const CHILDCARE_OPERATOR_ENTITY_LABELS: Record<ChildcareOperatorEntity, string> = {
    lead: "Lead",
    child: "Child",
    parent: "Parent / Contact",
    household: "Household",
    location: "Location",
};

export const CHILDCARE_OPERATOR_ENTITY_ORDER: ChildcareOperatorEntity[] = [
    "lead",
    "child",
    "parent",
    "household",
    "location",
];

/** Layout load group → field_definitions entity_type (null = manifest bootstrap only). */
export const CHILDCARE_DEF_ENTITY_BY_LOAD_GROUP: Record<string, string | null> = {
    opportunity: "opportunity",
    person: "person",
    child: "customer_member",
    inquiry_child: "inquiry_child",
    customer: "customer",
    location: "location",
};

function lead(
    refKey: string,
    pickerLabel: string,
    fieldType: string,
    sortOrder: number,
    defFieldKey: string,
    opts?: { computed?: boolean; anchors?: LayoutPickerAnchorEntity[]; storageTable?: string; storageColumn?: string },
): ChildcareCatalogFieldEntry {
    return {
        refKey,
        operatorEntity: "lead",
        pickerLabel,
        fieldType,
        sortOrder,
        defEntityType: "opportunity",
        defFieldKey,
        storageTable: opts?.storageTable ?? "opportunities",
        storageColumn: opts?.storageColumn ?? defFieldKey,
        computed: opts?.computed,
        layoutAnchors: opts?.anchors ?? ["opportunities"],
    };
}

function childField(
    refKey: string,
    pickerLabel: string,
    fieldType: string,
    sortOrder: number,
    def:
        | { entityType: string; fieldKey: string; storageTable?: string; storageColumn?: string; enrollmentDetail?: boolean }
        | { computed: true; storageTable?: string; storageColumn?: string },
    anchors: LayoutPickerAnchorEntity[] = ["opportunities", "person", "child"],
): ChildcareCatalogFieldEntry {
    return {
        refKey,
        operatorEntity: "child",
        pickerLabel,
        fieldType,
        sortOrder,
        defEntityType: "computed" in def ? undefined : def.entityType,
        defFieldKey: "computed" in def ? undefined : def.fieldKey,
        storageTable: def.storageTable,
        storageColumn: def.storageColumn ?? ("computed" in def ? undefined : def.fieldKey),
        computed: "computed" in def ? true : undefined,
        enrollmentDetail: "computed" in def ? undefined : def.enrollmentDetail,
        layoutAnchors: anchors,
    };
}

const PRIMARY_CONTACT_PICKER_DESCRIPTION = "Uses the linked primary contact on this lead";
const SECONDARY_CONTACT_PICKER_DESCRIPTION = "Uses the linked secondary contact on this lead";
const EMERGENCY_CONTACT_PICKER_DESCRIPTION = "Uses the linked emergency contact on this lead";
const BILLING_CONTACT_PICKER_DESCRIPTION = "Uses the linked billing / payer contact on this lead";

/** Lead layout: primary contact projections (opportunities.primary_person_id → persons). */
function parentPrimaryContactProjection(
    refKey: string,
    pickerLabel: string,
    fieldType: string,
    sortOrder: number,
    personsColumn: string,
): ChildcareCatalogFieldEntry {
    return {
        refKey,
        operatorEntity: "parent",
        pickerLabel,
        fieldType,
        sortOrder,
        storageTable: "opportunities",
        storageColumn: "primary_person_id",
        storagePath: `opportunities.primary_person_id → persons.${personsColumn}`,
        computed: true,
        relationshipProjection: true,
        pickerDescription: PRIMARY_CONTACT_PICKER_DESCRIPTION,
        layoutAnchors: ["opportunities"],
    };
}

/** Lead layout: role-scoped contact projections (family contacts on opportunity). */
function parentRoleContactProjection(
    role: "secondary" | "emergency" | "billing",
    refKey: string,
    pickerLabel: string,
    fieldType: string,
    sortOrder: number,
    personsColumn: string,
): ChildcareCatalogFieldEntry {
    const description =
        role === "secondary" ? SECONDARY_CONTACT_PICKER_DESCRIPTION
        : role === "emergency" ? EMERGENCY_CONTACT_PICKER_DESCRIPTION
        : BILLING_CONTACT_PICKER_DESCRIPTION;
    return {
        refKey,
        operatorEntity: "parent",
        pickerLabel,
        fieldType,
        sortOrder,
        storageTable: "opportunities",
        storageColumn: "primary_person_id",
        storagePath: `opportunity family contacts → persons.${personsColumn}`,
        computed: true,
        relationshipProjection: true,
        pickerDescription: description,
        layoutAnchors: ["opportunities"],
    };
}

function parent(
    refKey: string,
    pickerLabel: string,
    fieldType: string,
    sortOrder: number,
    defFieldKey: string,
    anchors: LayoutPickerAnchorEntity[] = ["opportunities", "person", "child"],
    opts?: { storageColumn?: string; storageTable?: string },
): ChildcareCatalogFieldEntry {
    return {
        refKey,
        operatorEntity: "parent",
        pickerLabel,
        fieldType,
        sortOrder,
        defEntityType: "person",
        defFieldKey,
        storageTable: opts?.storageTable ?? "persons",
        storageColumn: opts?.storageColumn ?? defFieldKey,
        layoutAnchors: anchors,
    };
}

function household(
    refKey: string,
    pickerLabel: string,
    fieldType: string,
    sortOrder: number,
    defFieldKey: string,
    opts?: { storageColumn?: string; anchors?: LayoutPickerAnchorEntity[] },
): ChildcareCatalogFieldEntry {
    return {
        refKey,
        operatorEntity: "household",
        pickerLabel,
        fieldType,
        sortOrder,
        defEntityType: "customer",
        defFieldKey,
        storageTable: "customers",
        storageColumn: opts?.storageColumn ?? defFieldKey,
        layoutAnchors: opts?.anchors ?? ["opportunities"],
    };
}

function locationField(
    refKey: string,
    pickerLabel: string,
    fieldType: string,
    sortOrder: number,
    opts: { defFieldKey?: string; storageTable?: string; storageColumn: string; anchors?: LayoutPickerAnchorEntity[] },
): ChildcareCatalogFieldEntry {
    return {
        refKey,
        operatorEntity: "location",
        pickerLabel,
        fieldType,
        sortOrder,
        defEntityType: opts.defFieldKey ? "location" : undefined,
        defFieldKey: opts.defFieldKey,
        storageTable: opts.storageTable ?? "locations",
        storageColumn: opts.storageColumn,
        layoutAnchors: opts.anchors ?? [],
    };
}

export const CHILDCARE_STARTER_FIELD_CATALOG: ChildcareCatalogFieldEntry[] = [
    // Lead — case-level only (no per-child enrollment duplicates)
    lead("opportunity.status_key", "Lead status", "status", 10, "status_key"),
    lead("opportunity.source", "Lead source", "text", 20, "source"),
    lead("opportunity.location_id", "Location", "select", 25, "location_id"),
    lead("opportunity.created_at", "Lead created date", "date", 30, "created_at", { computed: true }),
    lead("opportunity.tour_date", "Tour date", "date", 40, "tour_date"),
    lead("opportunity.tour_time", "Tour time", "text", 50, "tour_time"),
    lead("opportunity.tour_status", "Tour status", "status", 60, "tour_status"),
    lead("opportunity.customer_notes", "Lead notes", "text", 70, "customer_notes"),

    // Child profile — customer_members (not person bridge)
    childField("child.first_name", "First name", "text", 10, {
        entityType: "child",
        fieldKey: "first_name",
        storageTable: "customer_members",
        storageColumn: "first_name",
    }),
    childField("child.last_name", "Last name", "text", 20, {
        entityType: "child",
        fieldKey: "last_name",
        storageTable: "customer_members",
        storageColumn: "last_name",
    }),
    childField("child.full_name", "Full name", "text", 25, {
        computed: true,
        storageTable: "customer_members",
        storageColumn: "first_name",
    }),
    childField("child.preferred_name", "Preferred name", "text", 30, {
        entityType: "customer_member",
        fieldKey: "preferred_name",
        storageTable: "customer_members",
        storageColumn: "field_values",
    }),
    childField("child.date_of_birth", "Date of birth", "date", 40, {
        entityType: "child",
        fieldKey: "date_of_birth",
        storageTable: "customer_members",
        storageColumn: "dob",
    }),
    childField("child.age", "Age", "text", 50, { computed: true, storageTable: "customer_members", storageColumn: "dob" }),
    childField("child.gender", "Gender", "select", 60, {
        entityType: "customer_member",
        fieldKey: "gender",
        storageTable: "customer_members",
        storageColumn: "field_values",
    }),
    childField("child.allergies", "Allergies", "text", 70, {
        entityType: "customer_member",
        fieldKey: "allergies",
        storageTable: "customer_members",
        storageColumn: "field_values",
    }),
    childField("child.medical_notes", "Medical notes", "text", 80, {
        entityType: "customer_member",
        fieldKey: "medical_notes",
        storageTable: "customer_members",
        storageColumn: "field_values",
    }),
    childField("child.special_instructions", "Special instructions", "text", 90, {
        entityType: "customer_member",
        fieldKey: "special_instructions",
        storageTable: "customer_members",
        storageColumn: "field_values",
    }),

    // Child enrollment — inquiry_child.* / OCM
    childField("inquiry_child.program_category_id", "Program", "select", 110, {
        entityType: "inquiry_child",
        fieldKey: "program_category_id",
        storageTable: "opportunity_customer_members",
        storageColumn: "program_category_id",
        enrollmentDetail: true,
    }),
    childField("inquiry_child.schedule_type", "Schedule", "select", 120, {
        entityType: "inquiry_child",
        fieldKey: "schedule_type",
        storageTable: "opportunity_customer_members",
        storageColumn: "schedule_type",
        enrollmentDetail: true,
    }),
    childField("inquiry_child.start_date", "Requested Start", "date", 130, {
        entityType: "inquiry_child",
        fieldKey: "start_date",
        storageTable: "opportunity_customer_members",
        storageColumn: "start_date",
        enrollmentDetail: true,
    }),
    childField("inquiry_child.requested_days_per_week", "Requested Days per Week", "number", 132, {
        entityType: "inquiry_child",
        fieldKey: "requested_days_per_week",
        storageTable: "opportunity_customer_members",
        storageColumn: "field_values",
        enrollmentDetail: true,
    }),
    childField("inquiry_child.weekdays", "Preferred Weekdays", "multiselect", 134, {
        entityType: "inquiry_child",
        fieldKey: "weekdays",
        storageTable: "opportunity_customer_members",
        storageColumn: "field_values",
        enrollmentDetail: true,
    }),
    childField("inquiry_child.program_room_cohort_key", "Room / cohort", "select", 140, {
        entityType: "inquiry_child",
        fieldKey: "program_room_cohort_key",
        storageTable: "opportunity_customer_members",
        storageColumn: "program_room_cohort_key",
        enrollmentDetail: true,
    }),
    childField("inquiry_child.location_id", "Location / school", "select", 145, {
        entityType: "inquiry_child",
        fieldKey: "location_id",
        storageTable: "opportunity_customer_members",
        storageColumn: "location_id",
        enrollmentDetail: true,
    }),
    childField("inquiry_child.outcome_status_key", "Enrollment status", "status", 150, {
        entityType: "inquiry_child",
        fieldKey: "outcome_status_key",
        storageTable: "opportunity_customer_members",
        storageColumn: "outcome_status_key",
        enrollmentDetail: true,
    }),
    childField("inquiry_child.notes", "Notes", "text", 190, {
        entityType: "inquiry_child",
        fieldKey: "notes",
        storageTable: "opportunity_customer_members",
        storageColumn: "notes",
        enrollmentDetail: true,
    }),

    // Parent / Contact — lead primary contact projections (opportunity anchor only)
    parentPrimaryContactProjection("person.primary_contact_name", "Primary contact name", "text", 5, "display_name"),
    parentPrimaryContactProjection("person.primary_email", "Primary contact email", "text", 6, "email"),
    parentPrimaryContactProjection("person.primary_phone", "Primary contact phone", "phone", 7, "phone"),
    parentPrimaryContactProjection("person.primary_address_line1", "Primary contact address line 1", "text", 7.1, "field_values.address_line1"),
    parentPrimaryContactProjection("person.primary_address_line2", "Primary contact address line 2", "text", 7.2, "field_values.address_line2"),
    parentPrimaryContactProjection("person.primary_address_city", "Primary contact city", "text", 7.3, "field_values.city"),
    parentPrimaryContactProjection("person.primary_address_state", "Primary contact state", "text", 7.4, "field_values.state"),
    parentPrimaryContactProjection("person.primary_address_postal_code", "Primary contact ZIP code", "text", 7.5, "field_values.postal_code"),
    parentRoleContactProjection("secondary", "person.secondary_contact_name", "Secondary contact name", "text", 8, "display_name"),
    parentRoleContactProjection("secondary", "person.secondary_email", "Secondary contact email", "text", 9, "email"),
    parentRoleContactProjection("secondary", "person.secondary_phone", "Secondary contact phone", "phone", 10, "phone"),
    parentRoleContactProjection("secondary", "person.secondary_address_line1", "Secondary contact address line 1", "text", 10.1, "field_values.address_line1"),
    parentRoleContactProjection("secondary", "person.secondary_address_line2", "Secondary contact address line 2", "text", 10.2, "field_values.address_line2"),
    parentRoleContactProjection("secondary", "person.secondary_address_city", "Secondary contact city", "text", 10.3, "field_values.city"),
    parentRoleContactProjection("secondary", "person.secondary_address_state", "Secondary contact state", "text", 10.4, "field_values.state"),
    parentRoleContactProjection("secondary", "person.secondary_address_postal_code", "Secondary contact ZIP code", "text", 10.5, "field_values.postal_code"),
    parentRoleContactProjection("emergency", "person.emergency_contact_name", "Emergency contact name", "text", 11, "display_name"),
    parentRoleContactProjection("emergency", "person.emergency_contact_email", "Emergency contact email", "text", 12, "email"),
    parentRoleContactProjection("emergency", "person.emergency_contact_phone", "Emergency contact phone", "phone", 13, "phone"),
    parentRoleContactProjection("emergency", "person.emergency_address_line1", "Emergency contact address line 1", "text", 13.1, "field_values.address_line1"),
    parentRoleContactProjection("emergency", "person.emergency_address_line2", "Emergency contact address line 2", "text", 13.2, "field_values.address_line2"),
    parentRoleContactProjection("emergency", "person.emergency_address_city", "Emergency contact city", "text", 13.3, "field_values.city"),
    parentRoleContactProjection("emergency", "person.emergency_address_state", "Emergency contact state", "text", 13.4, "field_values.state"),
    parentRoleContactProjection("emergency", "person.emergency_address_postal_code", "Emergency contact ZIP code", "text", 13.5, "field_values.postal_code"),
    parentRoleContactProjection("billing", "person.billing_contact_name", "Billing contact name", "text", 14, "display_name"),
    parentRoleContactProjection("billing", "person.billing_contact_email", "Billing contact email", "text", 15, "email"),
    parentRoleContactProjection("billing", "person.billing_contact_phone", "Billing contact phone", "phone", 16, "phone"),
    parentRoleContactProjection("billing", "person.billing_address_line1", "Billing contact address line 1", "text", 16.1, "field_values.address_line1"),
    parentRoleContactProjection("billing", "person.billing_address_line2", "Billing contact address line 2", "text", 16.2, "field_values.address_line2"),
    parentRoleContactProjection("billing", "person.billing_address_city", "Billing contact city", "text", 16.3, "field_values.city"),
    parentRoleContactProjection("billing", "person.billing_address_state", "Billing contact state", "text", 16.4, "field_values.state"),
    parentRoleContactProjection("billing", "person.billing_address_postal_code", "Billing contact ZIP code", "text", 16.5, "field_values.postal_code"),

    // Parent / Contact — persons native + config
    parent("person.first_name", "First name", "text", 10, "first_name"),
    parent("person.last_name", "Last name", "text", 20, "last_name"),
    parent("person.email", "Email", "text", 30, "email"),
    parent("person.phone", "Phone", "phone", 40, "phone"),
    {
        refKey: "person.is_primary_contact",
        operatorEntity: "parent",
        pickerLabel: "Is primary contact",
        fieldType: "text",
        sortOrder: 42,
        computed: true,
        layoutAnchors: ["opportunities", "person", "child"],
    },
    parent("person.is_employee", "Employee", "boolean", 45, "is_employee"),
    parent("person.employee_id", "Employee ID", "text", 48, "employee_id"),
    parent("person.communication_preference", "Communication preference", "select", 80, "communication_preference"),
    parent("person.communication_opt_out", "Communication opt-out", "boolean", 82, "communication_opt_out"),
    parent("person.sms_opt_in", "SMS opt-in", "boolean", 90, "sms_opt_in"),
    parent("person.email_opt_in", "Email opt-in", "boolean", 100, "email_opt_in"),
    parent("person.employer", "Employer", "text", 110, "employer"),
    parent("person.contact_notes", "Notes", "text", 120, "contact_notes"),
    parent("person.address_line1", "Person address line 1", "text", 130, "address_line1", ["person"], {
        storageTable: "field_values",
        storageColumn: "address_line1",
    }),
    parent("person.address_line2", "Person address line 2", "text", 131, "address_line2", ["person"], {
        storageTable: "field_values",
        storageColumn: "address_line2",
    }),
    parent("person.city", "Person city", "text", 132, "city", ["person"], {
        storageTable: "field_values",
        storageColumn: "city",
    }),
    parent("person.state", "Person state", "text", 133, "state", ["person"], {
        storageTable: "field_values",
        storageColumn: "state",
    }),
    parent("person.postal_code", "Person ZIP code", "text", 134, "postal_code", ["person"], {
        storageTable: "field_values",
        storageColumn: "postal_code",
    }),

    // Household — customers native + config (no relationship duplicates)
    household("customer.name", "Household name", "text", 10, "name"),
    household("customer.family_notes", "Family notes", "text", 50, "family_notes"),
    household("customer.customer_number", "Family number", "text", 70, "customer_number"),
    household("customer.status_key", "Household status", "status", 75, "status_key"),
    household("location.household_address", "Shared household mailing address", "text", 80, "formatted_address", {
        anchors: ["opportunities", "person", "child"],
    }),
    household("location.household_address_line1", "Shared mailing address line 1", "text", 81, "address_line1", {
        anchors: ["opportunities", "person", "child"],
    }),
    household("location.household_address_line2", "Shared mailing address line 2", "text", 82, "address_line2", {
        anchors: ["opportunities", "person", "child"],
    }),
    household("location.household_address_city", "Shared mailing city", "text", 83, "city", {
        anchors: ["opportunities", "person", "child"],
    }),
    household("location.household_address_state", "Shared mailing state", "text", 84, "state", {
        anchors: ["opportunities", "person", "child"],
    }),
    household("location.household_address_postal_code", "Shared mailing ZIP code", "text", 85, "postal_code", {
        anchors: ["opportunities", "person", "child"],
    }),

    // Site / campus — native location columns (not contact or household address)
    locationField("location.label", "Site name", "text", 10, { storageColumn: "label" }),
    locationField("location.address1", "Site address line 1", "text", 20, { storageColumn: "address1" }),
    locationField("location.city", "Site city", "text", 25, { storageColumn: "city" }),
    locationField("location.state", "Site state", "text", 28, { storageColumn: "state" }),
    locationField("location.postal_code", "Site ZIP code", "text", 30, { storageColumn: "postal_code" }),
    locationField("location.site_phone", "Phone", "phone", 40, { defFieldKey: "site_phone", storageColumn: "site_phone" }),
    locationField("location.director_name", "Director", "text", 50, { defFieldKey: "director_name", storageColumn: "director_name" }),
    locationField("location.capacity", "Capacity", "number", 60, { defFieldKey: "capacity", storageColumn: "capacity" }),
    locationField("location.category", "Programs offered", "select", 70, { defFieldKey: "category", storageColumn: "category" }),
    locationField("location.status_key", "Status", "status", 80, { storageColumn: "status_key" }),
];

/** RefKeys removed from picker — wrong storage, legacy person-bridge, or deferred to FC-3. */
export const CHILDCARE_REMOVED_FROM_PICKER_REF_KEYS = [
    "person.relationship_to_child",
    "person.secondary_phone",
    "person.special_instructions",
    "person.gender",
    "person.allergies",
    "person.medical_notes",
    "person.preferred_name",
    "customer.primary_contact",
    "customer.secondary_contact",
    "customer.address_line1",
    "customer.household_status",
    "location.name",
    "location.address_line1",
    "location.operating_hours",
    "location.status",
    // Opportunity-level legacy field (metadata storage) — NOT the OCM participation
    // field renamed in the 20260711 S2 migration; keeps its stored legacy key.
    "opportunity.desired_start_date",
    "opportunity.program_type",
    "opportunity.schedule_type",
    "opportunity.campaign",
    "opportunity.channel",
] as const;

/**
 * Child profile config fields on customer_member — seeded by FC-CM-1 migration.
 * Layout picker refKeys remain child.*; field_definitions entity_type = customer_member.
 */
export const CHILDCARE_REQUIRES_CUSTOMER_MEMBER_FIELD_DEF_REF_KEYS = [
    "child.preferred_name",
    "child.gender",
    "child.allergies",
    "child.medical_notes",
    "child.special_instructions",
] as const;

/** Lead-only primary contact projections (not field_definitions; opportunity anchor). */
export const CHILDCARE_PRIMARY_CONTACT_PROJECTION_REF_KEYS = [
    "person.primary_contact_name",
    "person.primary_email",
    "person.primary_phone",
] as const;

/** FC-3 relationship projections — documented but not picker-eligible yet. */
export const CHILDCARE_FC3_DEFERRED_REF_KEYS = [
    "customer.household_address",
    "customer.primary_contact_name",
] as const;

export const CHILDCARE_CATALOG_BY_REFKEY: ReadonlyMap<string, ChildcareCatalogFieldEntry> = new Map(
    CHILDCARE_STARTER_FIELD_CATALOG.map((e) => [e.refKey, e]),
);

export const CHILDCARE_HIDDEN_REF_KEYS = new Set<string>([
    ...CHILDCARE_REMOVED_FROM_PICKER_REF_KEYS,
    ...CHILDCARE_FC3_DEFERRED_REF_KEYS,
    "opportunity.opportunity_number",
    "opportunity.job_date",
    "opportunity.location",
    "person.person_number",
    "location.location_number",
    "child.program",
    "child.start_date",
    "child.status",
    "child.location",
    "child.room",
    "child.schedule",
    "child.name",
    "child.age_band",
]);

export function isChildcareHiddenRefKey(refKey: string): boolean {
    const key = refKey.trim();
    if (!key) return true;
    if (CHILDCARE_CATALOG_BY_REFKEY.has(key)) return false;
    if (key.startsWith("child_inquiry.")) return true;
    if (CHILDCARE_HIDDEN_REF_KEYS.has(key)) return true;
    const fieldKey = key.includes(".") ? key.slice(key.indexOf(".") + 1) : key;
    if (fieldKey.endsWith("_id") || fieldKey.endsWith("_uuid")) return true;
    if (fieldKey === "id" || fieldKey === "org_id") return true;
    return false;
}

export function isChildcareCatalogRefKey(refKey: string, anchor: LayoutPickerAnchorEntity = "opportunities"): boolean {
    const trimmed = refKey.trim();
    if (isChildcareHiddenRefKey(trimmed)) return false;
    if ((CHILDCARE_REMOVED_FROM_PICKER_REF_KEYS as readonly string[]).includes(trimmed)) return false;
    const entry = CHILDCARE_CATALOG_BY_REFKEY.get(trimmed);
    if (!entry) return false;
    return entry.layoutAnchors.includes(anchor);
}

export function childcareCatalogRefKeysForOperatorEntity(
    operatorEntity: ChildcareOperatorEntity,
    anchor: LayoutPickerAnchorEntity = "opportunities",
): string[] {
    return CHILDCARE_STARTER_FIELD_CATALOG.filter(
        (e) => e.operatorEntity === operatorEntity && e.layoutAnchors.includes(anchor),
    )
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((e) => e.refKey);
}

/** True when durable child profile fields source customer_members (not person bridge). */
export function isCustomerMemberSourcedChildRefKey(refKey: string): boolean {
    const entry = CHILDCARE_CATALOG_BY_REFKEY.get(refKey);
    return (
        entry?.operatorEntity === "child" &&
        entry.storageTable === "customer_members" &&
        entry.storageColumn !== "field_values"
    );
}

/** True when field uses customer_member field_values (not legacy person bridge). */
export function isCustomerMemberConfigChildRefKey(refKey: string): boolean {
    return (CHILDCARE_REQUIRES_CUSTOMER_MEMBER_FIELD_DEF_REF_KEYS as readonly string[]).includes(refKey);
}

export function isPrimaryContactProjectionRefKey(refKey: string): boolean {
    return (CHILDCARE_PRIMARY_CONTACT_PROJECTION_REF_KEYS as readonly string[]).includes(refKey);
}

export function isChildcareFieldDefBackedRefKey(refKey: string): boolean {
    const entry = CHILDCARE_CATALOG_BY_REFKEY.get(refKey);
    return Boolean(entry?.defEntityType && entry.defFieldKey);
}

export type CatalogFieldLike = {
    refKey: string;
    fieldKey?: string;
    fieldLabel?: string;
    fieldType?: string;
    entityKey?: string;
    entityLabel?: string;
};

export function applyChildcareCatalogLabel<T extends CatalogFieldLike>(field: T): T {
    const entry = CHILDCARE_CATALOG_BY_REFKEY.get(field.refKey);
    if (!entry) return field;
    return { ...field, fieldLabel: entry.pickerLabel, fieldType: entry.fieldType };
}

export type CatalogGroupLike = {
    entityKey: string;
    entityLabel: string;
    groupSubtitle?: string;
    groupDescription?: string;
    fields: CatalogFieldLike[];
};

export function organizeChildcarePickerGroups(
    fields: CatalogFieldLike[],
    anchor: LayoutPickerAnchorEntity = "opportunities",
    options?: { supplementFromStarterCatalog?: boolean },
): CatalogGroupLike[] {
    const supplementFromStarterCatalog = options?.supplementFromStarterCatalog ?? true;
    const byEntity = new Map<ChildcareOperatorEntity, CatalogFieldLike[]>();
    for (const entity of CHILDCARE_OPERATOR_ENTITY_ORDER) {
        byEntity.set(entity, []);
    }

    const present = new Set<string>();
    for (const f of fields) {
        if (!isChildcareCatalogRefKey(f.refKey, anchor)) continue;
        const entry = CHILDCARE_CATALOG_BY_REFKEY.get(f.refKey)!;
        byEntity.get(entry.operatorEntity)!.push(applyChildcareCatalogLabel(f));
        present.add(f.refKey);
    }

    if (supplementFromStarterCatalog) {
        for (const entry of CHILDCARE_STARTER_FIELD_CATALOG) {
            if (!entry.layoutAnchors.includes(anchor)) continue;
            if (!isChildcareCatalogRefKey(entry.refKey, anchor)) continue;
            if (present.has(entry.refKey)) continue;
            const dot = entry.refKey.indexOf(".");
            const namespace = dot === -1 ? entry.refKey : entry.refKey.slice(0, dot);
            const fieldKey = dot === -1 ? entry.refKey : entry.refKey.slice(dot + 1);
            byEntity.get(entry.operatorEntity)!.push({
                entityKey: namespace,
                entityLabel: CHILDCARE_OPERATOR_ENTITY_LABELS[entry.operatorEntity],
                fieldKey,
                fieldLabel: entry.pickerLabel,
                fieldType: entry.fieldType,
                refKey: entry.refKey,
            });
        }
    }

    const entityKeyForOperator: Record<ChildcareOperatorEntity, string> = {
        lead: "opportunity",
        child: "child",
        parent: "person",
        household: "customer",
        location: "location",
    };

    const groups: CatalogGroupLike[] = [];
    for (const operatorEntity of CHILDCARE_OPERATOR_ENTITY_ORDER) {
        const entityFields = byEntity.get(operatorEntity)!;
        entityFields.sort((a, b) => {
            const ao = CHILDCARE_CATALOG_BY_REFKEY.get(a.refKey)?.sortOrder ?? 999;
            const bo = CHILDCARE_CATALOG_BY_REFKEY.get(b.refKey)?.sortOrder ?? 999;
            return ao - bo;
        });
        if (entityFields.length === 0) continue;
        groups.push({
            entityKey: entityKeyForOperator[operatorEntity],
            entityLabel: CHILDCARE_OPERATOR_ENTITY_LABELS[operatorEntity],
            groupSubtitle: operatorEntity === "child" ? "Enrollment details" : undefined,
            groupDescription:
                operatorEntity === "child"
                    ? "Child profile and enrollment fields used on leads and child records"
                    : operatorEntity === "parent" && anchor === "opportunities"
                      ? PRIMARY_CONTACT_PICKER_DESCRIPTION
                      : undefined,
            fields: entityFields.map((f) => ({
                ...f,
                entityLabel: CHILDCARE_OPERATOR_ENTITY_LABELS[operatorEntity],
            })),
        });
    }
    return groups;
}

export function collectChildcareUserFacingCopy(groups: CatalogGroupLike[]): string[] {
    const out: string[] = [];
    for (const g of groups) {
        out.push(g.entityLabel);
        if (g.groupSubtitle) out.push(g.groupSubtitle);
        if (g.groupDescription) out.push(g.groupDescription);
        for (const f of g.fields) {
            if (f.fieldLabel) out.push(f.fieldLabel);
            if (f.entityLabel) out.push(f.entityLabel);
        }
    }
    return out;
}

export const BANNED_CHILDCARE_OPERATOR_COPY = [
    /child\s*inquiry/i,
    /inquiry\s*child/i,
    /children\s*inquiry/i,
    /child_inquiry/i,
    /\binquiry_child\b/i,
    /\bOCM\b/,
    /opportunity_customer_members/i,
] as const;

export function childcareCopyContainsBannedPhrase(text: string): boolean {
    return BANNED_CHILDCARE_OPERATOR_COPY.some((re) => re.test(text));
}
