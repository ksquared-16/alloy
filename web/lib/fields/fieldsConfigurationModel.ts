/**
 * Fields settings — operator-facing entity vocabulary and section grouping.
 *
 * Doctrine:
 * - Operators configure **Child fields** (not inquiry_child / customer_member / OCM).
 * - Runtime hydrates child profile from customer_member, inquiry child, and person sources.
 * - Queue Rows expose child fields only when resolver-backed (see fieldSurfaceAvailability).
 * - Fields registry ≠ surface availability; placement still required on Surfaces.
 */

import type { FieldDef } from "@/app/api/admin/field-definitions/route";
import type { FieldSectionRegistryRow } from "@/lib/admin/fieldSectionSelectOptions";
import { humanizeSnakeCaseToken } from "@/lib/admin/activityTimelineFormat";
import { CUSTOMER_MEMBER_ENTITY_TYPE } from "@/lib/fields/customerMemberFieldRegistry";
import { INQUIRY_CHILD_ENTITY_TYPE } from "@/lib/fields/inquiryChildFieldRegistry";
import {
    operatorFieldCatalogClass,
    operatorFieldDisplayLabel,
    type OperatorFieldRow,
} from "@/lib/fields/fieldSettingsOperatorUi";

export const FIELDS_ENTITY_DESCRIPTIONS: Readonly<Record<string, string>> = {
    person: "Identity and contact fields for people — parents, staff, and other contacts.",
    customer: "Household and family-level fields stored on the family record.",
    inquiry_child:
        "Child profile and enrollment participation fields. The system maps these to child member and enrollment records at runtime.",
    opportunity: "Lead and enrollment case fields for pipeline tracking and case management.",
    location: "Site, campus, and location configuration fields.",
};

/** Operator-facing section labels for grouped Fields cards. */
export const FIELDS_SECTION_OPERATOR_LABELS: Readonly<Record<string, string>> = {
    child_profile: "Child profile",
    enrollment: "Enrollment",
    inquiry_participation: "Inquiry Participation",
    medical: "Medical",
    requirements: "Requirements",
    profile: "Profile",
    runtime_signals: "Runtime Signals",
    identity: "Identity",
    custom: "Custom",
    system: "System",
};

export const FIELDS_CHILD_SECTION_ORDER = [
    "child_profile",
    "identity",
    "inquiry_participation",
    "medical",
    "custom",
    "system",
] as const;

export type FieldsDisplayRow = {
    field: FieldDef;
    /** API entity_type used for edit/delete (may differ from selected tab). */
    storageEntityType: string;
    sectionKey: string;
};

export type FieldsSectionGroup = {
    sectionKey: string;
    label: string;
    rows: FieldsDisplayRow[];
};

export function resolveFieldsSectionLabel(
    sectionKey: string,
    sectionRegistry: readonly FieldSectionRegistryRow[],
): string {
    const key = sectionKey.trim() || "custom";
    const fromRegistry = sectionRegistry.find((row) => row.section_key === key)?.label?.trim();
    if (fromRegistry) return fromRegistry;
    return FIELDS_SECTION_OPERATOR_LABELS[key] ?? humanizeSnakeCaseToken(key);
}

/** Operator registry ref — hide internal entity_type names. */
export function operatorFieldRegistryRefKey(storageEntityType: string, fieldKey: string): string {
    const et = storageEntityType.trim().toLowerCase();
    const fk = fieldKey.trim();
    if (et === INQUIRY_CHILD_ENTITY_TYPE || et === CUSTOMER_MEMBER_ENTITY_TYPE) return `child.${fk}`;
    if (et === "opportunity" || et === "job") return `enrollment.${fk}`;
    if (et === "customer") return `family.${fk}`;
    return `${et}.${fk}`;
}

function defaultSectionForEntity(entityType: string): string {
    const et = entityType.trim().toLowerCase();
    if (et === INQUIRY_CHILD_ENTITY_TYPE) return "inquiry_participation";
    if (et === CUSTOMER_MEMBER_ENTITY_TYPE) return "child_profile";
    return "custom";
}

function sectionKeyForRow(row: FieldDef, storageEntityType: string, showSystemFields: boolean): string {
    const catalogClass = operatorFieldCatalogClass(storageEntityType, {
        field_key: row.field_key,
        is_system: row.is_system,
        label: row.label,
        config: row.config,
    });
    if (!showSystemFields && catalogClass !== "operator_configurable") return "system";
    return row.section_key?.trim() || defaultSectionForEntity(storageEntityType);
}

export function buildFieldsSectionGroups(input: {
    enrollmentFields: readonly FieldDef[];
    profileFields?: readonly FieldDef[];
    sectionRegistry: readonly FieldSectionRegistryRow[];
    profileSectionRegistry?: readonly FieldSectionRegistryRow[];
    enrollmentEntityType: string;
    showSystemFields: boolean;
}): FieldsSectionGroup[] {
    const rows: FieldsDisplayRow[] = [];

    for (const field of input.profileFields ?? []) {
        rows.push({
            field,
            storageEntityType: CUSTOMER_MEMBER_ENTITY_TYPE,
            sectionKey: sectionKeyForRow(field, CUSTOMER_MEMBER_ENTITY_TYPE, input.showSystemFields),
        });
    }

    for (const field of input.enrollmentFields) {
        rows.push({
            field,
            storageEntityType: input.enrollmentEntityType,
            sectionKey: sectionKeyForRow(field, input.enrollmentEntityType, input.showSystemFields),
        });
    }

    const grouped = new Map<string, FieldsDisplayRow[]>();
    for (const row of rows) {
        const bucket = grouped.get(row.sectionKey) ?? [];
        bucket.push(row);
        grouped.set(row.sectionKey, bucket);
    }

    const registry = [...(input.sectionRegistry ?? []), ...(input.profileSectionRegistry ?? [])];
    const orderedKeys = [
        ...FIELDS_CHILD_SECTION_ORDER.filter((key) => grouped.has(key)),
        ...[...grouped.keys()].filter((key) => !(FIELDS_CHILD_SECTION_ORDER as readonly string[]).includes(key)).sort(),
    ];

    return orderedKeys.map((sectionKey) => ({
        sectionKey,
        label: resolveFieldsSectionLabel(sectionKey, registry),
        rows: (grouped.get(sectionKey) ?? []).sort((a, b) => {
            const sortDelta = (a.field.sort_order ?? 0) - (b.field.sort_order ?? 0);
            if (sortDelta !== 0) return sortDelta;
            return operatorFieldDisplayLabel(a.storageEntityType, a.field as OperatorFieldRow).localeCompare(
                operatorFieldDisplayLabel(b.storageEntityType, b.field as OperatorFieldRow),
            );
        }),
    }));
}

export function fieldsEntityDescription(entityType: string): string {
    return FIELDS_ENTITY_DESCRIPTIONS[entityType.trim().toLowerCase()] ?? "Configure labels, types, and surface visibility for this entity.";
}
