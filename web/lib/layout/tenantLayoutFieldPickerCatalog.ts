/**
 * Tenant field_definitions → layout/queue picker catalog merge.
 *
 * Org-scoped custom fields appear in drawer and queue row Add Field pickers
 * without code changes when tenants create new field_definitions rows.
 */

import { ADMIN_FIELD_TYPES } from "@/lib/fields/adminFieldTypeList";
import { isEnrollmentOperatorFieldVisible } from "@/lib/fields/childcareFieldCatalogDoctrine";
import { isReservedCustomerMemberFieldKey } from "@/lib/fields/customerMemberFieldRegistry";
import { isReservedInquiryChildFieldKey } from "@/lib/fields/inquiryChildFieldRegistry";
import type { LayoutCatalogField, LayoutCatalogGroup, LayoutEntityGroupKey } from "@/lib/layout/fieldCatalog";
import { fieldDefToCatalog } from "@/lib/layout/fieldCatalog";
import {
    classifyFieldPickerContext,
    isFieldPickerBackendOnlyRef,
    type FieldPickerSurface,
} from "@/lib/layout/fieldPickerContextCatalog";
import { isChildcareCatalogRefKey } from "@/lib/layout/childcareLayoutFieldCatalog";
import { isBlockedLayoutPickerRefKey } from "@/lib/layout/platformFieldResolutionManifest";
import type { LayoutPickerAnchorEntity } from "@/lib/layout/platformFieldResolutionManifest";

export type TenantFieldDefinitionRow = {
    field_key: string;
    label: string | null;
    entity_type: string;
    field_type: string;
    config?: Record<string, unknown> | null;
    is_system: boolean;
    is_active: boolean;
    is_visible_in_drawer?: boolean;
    org_id?: string;
};

/** Entity types loaded for layout/queue tenant field pickers. */
export const LAYOUT_TENANT_FIELD_ENTITY_TYPES = [
    "opportunity",
    "person",
    "inquiry_child",
    "customer",
    "customer_member",
] as const;

const RENDERABLE_FIELD_TYPES = new Set<string>(ADMIN_FIELD_TYPES);

export function fieldDefinitionEntityToLayoutGroupKey(entityType: string): LayoutEntityGroupKey | null {
    switch (entityType.trim().toLowerCase()) {
        case "opportunity":
            return "opportunity";
        case "person":
            return "person";
        case "inquiry_child":
            return "inquiry_child";
        case "customer":
            return "customer";
        case "customer_member":
            return "child";
        default:
            return null;
    }
}

/** Canonical layout refKey for a tenant field_definitions row. */
export function tenantFieldDefinitionRefKey(
    def: Pick<TenantFieldDefinitionRow, "entity_type" | "field_key">,
): string | null {
    const entityType = def.entity_type.trim().toLowerCase();
    const fieldKey = def.field_key.trim();
    if (!entityType || !fieldKey) return null;
    if (entityType === "customer_member") return `child.${fieldKey}`;
    if (entityType === "inquiry_child") return `inquiry_child.${fieldKey}`;
    return `${entityType}.${fieldKey}`;
}

export function isTenantLayoutFieldRenderable(def: TenantFieldDefinitionRow): boolean {
    const fieldKey = def.field_key.trim();
    const entityType = def.entity_type.trim().toLowerCase();
    if (!fieldKey || !entityType) return false;
    if (def.is_active === false) return false;
    if (def.is_visible_in_drawer === false) return false;

    const fieldType = (def.field_type ?? "text").trim().toLowerCase();
    if (!RENDERABLE_FIELD_TYPES.has(fieldType)) return false;

    if (entityType === "inquiry_child" && isReservedInquiryChildFieldKey(fieldKey)) return false;
    if (entityType === "customer_member" && isReservedCustomerMemberFieldKey(fieldKey)) return false;

    const refKey = tenantFieldDefinitionRefKey(def);
    if (!refKey || isFieldPickerBackendOnlyRef(refKey)) return false;

    return isEnrollmentOperatorFieldVisible(entityType, fieldKey, def);
}

export type TenantLayoutFieldSurface =
    | "opportunity_drawer"
    | "person_drawer"
    | "child_drawer"
    | "pipeline_queue_row"
    | "waitlist_queue_row";

function queuePickerSurface(isWaitlist: boolean): FieldPickerSurface {
    return isWaitlist ? "waitlist_queue_row" : "pipeline_queue_row";
}

/** Whether a tenant field is allowed on a drawer or queue picker surface. */
export function isTenantLayoutFieldAllowedOnSurface(
    def: TenantFieldDefinitionRow,
    surface: TenantLayoutFieldSurface,
): boolean {
    if (!isTenantLayoutFieldRenderable(def)) return false;
    const refKey = tenantFieldDefinitionRefKey(def);
    if (!refKey) return false;

    const context = classifyFieldPickerContext(refKey, {
        surface:
            surface === "waitlist_queue_row" ? "waitlist_queue_row"
            : surface === "pipeline_queue_row" ? "pipeline_queue_row"
            : surface,
        isWaitlist: surface === "waitlist_queue_row",
    });
    if (!context) return false;

    switch (surface) {
        case "opportunity_drawer":
            return [
                "lead_enrollment",
                "candidate_child",
                "primary_contact",
                "secondary_contact",
                "billing_contact",
                "emergency_contact",
                "household_shared",
                "status_lifecycle",
            ].includes(context);
        case "person_drawer":
            return [
                "primary_contact",
                "secondary_contact",
                "billing_contact",
                "emergency_contact",
                "candidate_child",
                "household_shared",
                "lead_enrollment",
            ].includes(context);
        case "child_drawer":
            return [
                "candidate_child",
                "household_shared",
                "primary_contact",
                "secondary_contact",
                "billing_contact",
                "emergency_contact",
            ].includes(context);
        case "pipeline_queue_row":
        case "waitlist_queue_row":
            return (
                classifyFieldPickerContext(refKey, {
                    surface: queuePickerSurface(surface === "waitlist_queue_row"),
                    isWaitlist: surface === "waitlist_queue_row",
                }) != null
            );
        default:
            return false;
    }
}

export function tenantFieldDefinitionToLayoutCatalogField(def: TenantFieldDefinitionRow): LayoutCatalogField | null {
    const groupKey = fieldDefinitionEntityToLayoutGroupKey(def.entity_type);
    const refKey = tenantFieldDefinitionRefKey(def);
    if (!groupKey || !refKey) return null;
    if (!isTenantLayoutFieldRenderable(def)) return null;
    const label = (def.label ?? def.field_key).trim() || def.field_key;
    return fieldDefToCatalog(groupKey, {
        field_key: def.field_key,
        label,
        field_type: def.field_type,
    });
}

/** Build tenant-only catalog fields for a surface. */
export function buildTenantLayoutCatalogFields(
    defs: readonly TenantFieldDefinitionRow[],
    surface: TenantLayoutFieldSurface,
): LayoutCatalogField[] {
    const seen = new Set<string>();
    const fields: LayoutCatalogField[] = [];
    for (const def of defs) {
        if (!isTenantLayoutFieldAllowedOnSurface(def, surface)) continue;
        const field = tenantFieldDefinitionToLayoutCatalogField(def);
        if (!field || seen.has(field.refKey)) continue;
        seen.add(field.refKey);
        fields.push(field);
    }
    return fields.sort((a, b) => a.fieldLabel.localeCompare(b.fieldLabel));
}

/** Merge tenant custom fields into existing picker groups (dedupe by refKey). */
export function mergeTenantFieldsIntoPickerGroups(
    baseGroups: LayoutCatalogGroup[],
    tenantFields: readonly LayoutCatalogField[],
): LayoutCatalogGroup[] {
    if (tenantFields.length === 0) return baseGroups;
    const byEntity = new Map<string, LayoutCatalogGroup>();
    for (const group of baseGroups) {
        byEntity.set(group.entityKey, {
            ...group,
            fields: [...group.fields],
        });
    }
    for (const field of tenantFields) {
        const existing = byEntity.get(field.entityKey);
        if (existing) {
            if (existing.fields.some((f) => f.refKey === field.refKey)) continue;
            existing.fields.push(field);
            existing.fields.sort((a, b) => a.fieldLabel.localeCompare(b.fieldLabel));
            continue;
        }
        byEntity.set(field.entityKey, {
            entityKey: field.entityKey,
            entityLabel: field.entityLabel,
            fields: [field],
        });
    }
    return [...byEntity.values()];
}

export function buildTenantLayoutFieldRefKeySet(
    defs: readonly TenantFieldDefinitionRow[],
    surface: TenantLayoutFieldSurface,
): ReadonlySet<string> {
    return new Set(buildTenantLayoutCatalogFields(defs, surface).map((f) => f.refKey));
}

export function isTenantLayoutFieldRefKeyAllowed(
    refKey: string,
    defs: readonly TenantFieldDefinitionRow[],
    surface: TenantLayoutFieldSurface,
): boolean {
    const trimmed = refKey.trim();
    if (!trimmed) return false;
    return buildTenantLayoutFieldRefKeySet(defs, surface).has(trimmed);
}

/** Loaded field row eligible for layout catalog — platform starter or tenant custom. */
export function isLayoutCatalogFieldEligible(
    field: LayoutCatalogField,
    def: TenantFieldDefinitionRow | null,
    anchor: LayoutPickerAnchorEntity,
): boolean {
    if (isBlockedLayoutPickerRefKey(field.refKey)) return false;
    if (def?.is_system === false && isTenantLayoutFieldRenderable(def)) return true;
    return isChildcareCatalogRefKey(field.refKey, anchor);
}

/** Index tenant field_definitions rows by layout refKey. */
export function indexTenantFieldDefinitionsByRefKey(
    defs: readonly TenantFieldDefinitionRow[],
): Map<string, TenantFieldDefinitionRow> {
    const out = new Map<string, TenantFieldDefinitionRow>();
    for (const def of defs) {
        const refKey = tenantFieldDefinitionRefKey(def);
        if (!refKey) continue;
        out.set(refKey, def);
    }
    return out;
}

export function filterLoadedLayoutCatalogFields(
    fields: LayoutCatalogField[],
    anchor: LayoutPickerAnchorEntity,
    tenantDefsByRef: ReadonlyMap<string, TenantFieldDefinitionRow>,
): LayoutCatalogField[] {
    return fields.filter((field) => {
        const def = tenantDefsByRef.get(field.refKey) ?? null;
        return isLayoutCatalogFieldEligible(field, def, anchor);
    });
}
