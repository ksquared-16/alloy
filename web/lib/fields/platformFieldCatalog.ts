/**
 * Platform field catalog — native DB columns and platform-owned fields.
 *
 * Source-backed from entity manifests and childcare starter catalog.
 * Settings → Fields renders these as read-only Platform Field cards.
 * Does NOT duplicate field_definitions rows that already exist for the same key.
 *
 * @see docs/sprints/archive/07_2026/field-runtime-unification.md
 */

import { PERSON_CANONICAL_IDENTITY_SELECT } from "@/lib/fields/canonicalEntitySelectColumns";
import { CUSTOMER_MEMBER_NATIVE_COLUMN_KEYS } from "@/lib/fields/customerMemberFieldRegistry";
import { INQUIRY_CHILD_NATIVE_OCM_FIELD_KEYS } from "@/lib/fields/inquiryChildFieldRegistry";
import { CHILDCARE_STARTER_FIELD_CATALOG } from "@/lib/layout/childcareLayoutFieldCatalog";
import { manifestEntryForRefKey } from "@/lib/layout/platformFieldResolutionManifest";

export type PlatformFieldOwnership = "native_column" | "computed" | "relationship" | "metadata";

export type PlatformFieldDefinition = {
    entity_type: string;
    field_key: string;
    refKey: string;
    label: string;
    field_type: string;
    section_key: string;
    sort_order: number;
    ownership: PlatformFieldOwnership;
    storage_table: string;
    storage_column: string;
    /** Operator-visible in Settings hub for this entity tab. */
    operator_visible: boolean;
};

/** Hub entities that show platform field cards in Settings → Fields. */
export const PLATFORM_FIELD_HUB_ENTITIES = [
    "person",
    "customer",
    "opportunity",
    "customer_member",
    "inquiry_child",
    "location",
] as const;

const PERSON_NATIVE_KEYS = new Set(
    PERSON_CANONICAL_IDENTITY_SELECT.split(", ")
        .map((c) => c.trim())
        .filter((c) => !["id", "org_id", "metadata", "archived_at", "full_name", "preferred_name"].includes(c)),
);

const CUSTOMER_NATIVE_SPECS: Array<{
    field_key: string;
    label: string;
    field_type: string;
    section_key: string;
    sort_order: number;
}> = [
    { field_key: "name", label: "Household name", field_type: "text", section_key: "identity", sort_order: 10 },
    { field_key: "status_key", label: "Status", field_type: "status", section_key: "lifecycle", sort_order: 20 },
    { field_key: "customer_number", label: "Family number", field_type: "text", section_key: "identity", sort_order: 30 },
    { field_key: "created_at", label: "Created date", field_type: "datetime", section_key: "system", sort_order: 900 },
];

const OPPORTUNITY_NATIVE_SPECS: Array<{
    field_key: string;
    label: string;
    field_type: string;
    section_key: string;
    sort_order: number;
}> = [
    { field_key: "name", label: "Inquiry name", field_type: "text", section_key: "identity", sort_order: 10 },
    { field_key: "status_key", label: "Status", field_type: "status", section_key: "lifecycle", sort_order: 20 },
    { field_key: "source", label: "Lead source", field_type: "text", section_key: "enrollment", sort_order: 30 },
    { field_key: "created_at", label: "Created date", field_type: "datetime", section_key: "system", sort_order: 900 },
];

const CUSTOMER_MEMBER_NATIVE_SPECS: Array<{
    field_key: string;
    label: string;
    field_type: string;
    section_key: string;
    sort_order: number;
}> = [
    { field_key: "first_name", label: "First name", field_type: "text", section_key: "child_profile", sort_order: 10 },
    { field_key: "last_name", label: "Last name", field_type: "text", section_key: "child_profile", sort_order: 20 },
    { field_key: "dob", label: "Date of birth", field_type: "date", section_key: "child_profile", sort_order: 40 },
    { field_key: "display_name", label: "Display name", field_type: "text", section_key: "child_profile", sort_order: 50 },
];

const PERSON_LABELS: Record<string, { label: string; field_type: string; section_key: string; sort_order: number }> = {
    first_name: { label: "First name", field_type: "text", section_key: "identity", sort_order: 10 },
    last_name: { label: "Last name", field_type: "text", section_key: "identity", sort_order: 20 },
    email: { label: "Email", field_type: "email", section_key: "contact", sort_order: 30 },
    phone: { label: "Phone", field_type: "phone", section_key: "contact", sort_order: 40 },
    date_of_birth: { label: "Date of birth", field_type: "date", section_key: "identity", sort_order: 50 },
    status_key: { label: "Status", field_type: "status", section_key: "lifecycle", sort_order: 60 },
    created_at: { label: "Created date", field_type: "datetime", section_key: "system", sort_order: 900 },
    updated_at: { label: "Updated date", field_type: "datetime", section_key: "system", sort_order: 910 },
};

function layoutRefKey(entityType: string, fieldKey: string): string {
    const et = entityType.trim().toLowerCase();
    if (et === "customer_member") return `child.${fieldKey === "dob" ? "date_of_birth" : fieldKey}`;
    return `${et}.${fieldKey}`;
}

function starterEntryForRef(refKey: string) {
    return CHILDCARE_STARTER_FIELD_CATALOG.find((e) => e.refKey === refKey);
}

function buildPersonPlatformFields(): PlatformFieldDefinition[] {
    return [...PERSON_NATIVE_KEYS].map((fieldKey) => {
        const meta = PERSON_LABELS[fieldKey] ?? {
            label: fieldKey.replace(/_/g, " "),
            field_type: "text",
            section_key: "identity",
            sort_order: 100,
        };
        const refKey = `person.${fieldKey}`;
        const starter = starterEntryForRef(refKey);
        return {
            entity_type: "person",
            field_key: fieldKey,
            refKey,
            label: starter?.pickerLabel ?? meta.label,
            field_type: starter?.fieldType ?? meta.field_type,
            section_key: meta.section_key,
            sort_order: meta.sort_order,
            ownership: starter?.computed ? "computed" : starter?.relationshipProjection ? "relationship" : "native_column",
            storage_table: starter?.storageTable ?? "persons",
            storage_column: starter?.storageColumn ?? fieldKey,
            operator_visible: true,
        };
    });
}

function buildCustomerPlatformFields(): PlatformFieldDefinition[] {
    return CUSTOMER_NATIVE_SPECS.map((spec) => ({
        entity_type: "customer",
        field_key: spec.field_key,
        refKey: layoutRefKey("customer", spec.field_key),
        label: spec.label,
        field_type: spec.field_type,
        section_key: spec.section_key,
        sort_order: spec.sort_order,
        ownership: "native_column" as const,
        storage_table: "customers",
        storage_column: spec.field_key,
        operator_visible: true,
    }));
}

function buildOpportunityPlatformFields(): PlatformFieldDefinition[] {
    return OPPORTUNITY_NATIVE_SPECS.map((spec) => ({
        entity_type: "opportunity",
        field_key: spec.field_key,
        refKey: layoutRefKey("opportunity", spec.field_key),
        label: spec.label,
        field_type: spec.field_type,
        section_key: spec.section_key,
        sort_order: spec.sort_order,
        ownership: "native_column" as const,
        storage_table: "opportunities",
        storage_column: spec.field_key,
        operator_visible: true,
    }));
}

function buildCustomerMemberPlatformFields(): PlatformFieldDefinition[] {
    return CUSTOMER_MEMBER_NATIVE_SPECS.filter((spec) =>
        (CUSTOMER_MEMBER_NATIVE_COLUMN_KEYS as readonly string[]).includes(spec.field_key),
    ).map((spec) => ({
        entity_type: "customer_member",
        field_key: spec.field_key,
        refKey: layoutRefKey("customer_member", spec.field_key),
        label: spec.label,
        field_type: spec.field_type,
        section_key: spec.section_key,
        sort_order: spec.sort_order,
        ownership: "native_column" as const,
        storage_table: "customer_members",
        storage_column: spec.field_key === "dob" ? "dob" : spec.field_key,
        operator_visible: true,
    }));
}

function buildInquiryChildPlatformFields(): PlatformFieldDefinition[] {
    return (INQUIRY_CHILD_NATIVE_OCM_FIELD_KEYS as readonly string[]).map((fieldKey, index) => {
        const refKey = `inquiry_child.${fieldKey}`;
        const starter = starterEntryForRef(refKey);
        const manifest = manifestEntryForRefKey(refKey);
        return {
            entity_type: "inquiry_child",
            field_key: fieldKey,
            refKey,
            label: starter?.pickerLabel ?? manifest?.label ?? fieldKey.replace(/_/g, " "),
            field_type: starter?.fieldType ?? manifest?.fieldType ?? "text",
            // Match inquiryChildFieldRegistry / Settings → Fields Child categories.
            section_key: "inquiry_participation",
            sort_order: starter?.sortOrder ?? (index + 1) * 10,
            ownership: "native_column" as const,
            storage_table: "opportunity_customer_members",
            storage_column: fieldKey,
            operator_visible: fieldKey !== "outcome_status_key",
        };
    });
}

function buildLocationPlatformFields(): PlatformFieldDefinition[] {
    return CHILDCARE_STARTER_FIELD_CATALOG.filter(
        (e) => e.operatorEntity === "location" && e.storageColumn && !e.computed && !e.relationshipProjection,
    ).map((entry) => ({
        entity_type: "location",
        field_key: entry.defFieldKey ?? entry.refKey.split(".").slice(1).join("."),
        refKey: entry.refKey,
        label: entry.pickerLabel,
        field_type: entry.fieldType,
        section_key: "site",
        sort_order: entry.sortOrder,
        ownership: "native_column" as const,
        storage_table: entry.storageTable ?? "locations",
        storage_column: entry.storageColumn ?? entry.defFieldKey ?? "",
        operator_visible: true,
    }));
}

const PLATFORM_FIELDS_BY_ENTITY: Record<string, PlatformFieldDefinition[]> = {
    person: buildPersonPlatformFields(),
    customer: buildCustomerPlatformFields(),
    opportunity: buildOpportunityPlatformFields(),
    customer_member: buildCustomerMemberPlatformFields(),
    inquiry_child: buildInquiryChildPlatformFields(),
    location: buildLocationPlatformFields(),
};

/** All platform-owned field definitions for an entity type. */
export function platformFieldsForEntity(entityType: string): PlatformFieldDefinition[] {
    const et = entityType.trim().toLowerCase();
    return [...(PLATFORM_FIELDS_BY_ENTITY[et] ?? [])].sort((a, b) => a.sort_order - b.sort_order);
}

/** Platform fields not shadowed by an existing field_definitions row. */
export function platformFieldsForEntityExcludingRegistry(
    entityType: string,
    existingFieldKeys: ReadonlySet<string>,
): PlatformFieldDefinition[] {
    return platformFieldsForEntity(entityType).filter(
        (row) => row.operator_visible && !existingFieldKeys.has(row.field_key.trim().toLowerCase()),
    );
}

export function platformFieldByRefKey(refKey: string): PlatformFieldDefinition | undefined {
    const normalized = refKey.trim();
    for (const rows of Object.values(PLATFORM_FIELDS_BY_ENTITY)) {
        const hit = rows.find((r) => r.refKey === normalized);
        if (hit) return hit;
    }
    return undefined;
}

export function isPlatformNativeField(entityType: string, fieldKey: string): boolean {
    const et = entityType.trim().toLowerCase();
    const key = fieldKey.trim().toLowerCase();
    return (PLATFORM_FIELDS_BY_ENTITY[et] ?? []).some((r) => r.field_key.toLowerCase() === key);
}
