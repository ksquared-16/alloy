/**
 * Document-oriented field authoring presentation (OI-4B).
 * Operator-facing labels only — no schema semantic changes.
 */

import type { FormField } from "@/lib/forms/schema";
import type { SystemFieldRegistryEntry } from "@/lib/forms/systemFieldRegistry";

export type UiScalarKind =
    | "text"
    | "textarea"
    | "email"
    | "phone"
    | "number"
    | "date"
    | "checkbox"
    | "select"
    | "signature";

const EMAIL_PATTERN = "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$";
const PHONE_PATTERN = "^[+0-9()\\-\\s]{7,}$";

export const FIELD_AUTHORING_COPY = {
    documentTitle: "Document title",
    sectionHeading: "Section",
    sectionLead: "Questions in this section appear together on the intake document.",
    question: "Question",
    helpText: "Help text",
    answerType: "Answer type",
    layout: "Layout",
    prefillSource: "Prefill source",
    required: "Required",
    optional: "Optional",
    placeholder: "Placeholder",
    options: "Answer choices",
    addQuestion: "Add question",
    moveUp: "Move up",
    moveDown: "Move down",
    remove: "Remove question",
    emptyTitle: "Start by adding the first question",
    emptyLead: "Use mapped fields when you already know family or child details.",
    customField: "Custom field",
    mappedField: "Mapped field",
    staffOnlyNote: "Internal / staff-only suggested use.",
    customNote: "Custom — not auto-linked to CRM.",
} as const;

/** Operator-facing groups for relationship role leaves. */
export const RELATIONSHIP_FIELD_PICKER_GROUP_ORDER = [
    "primary",
    "parents",
    "secondary",
    "billing",
    "emergency",
] as const;

export type RelationshipFieldPickerGroupId = (typeof RELATIONSHIP_FIELD_PICKER_GROUP_ORDER)[number];

export const RELATIONSHIP_FIELD_PICKER_GROUP_LABELS: Record<RelationshipFieldPickerGroupId, string> = {
    primary: "Primary Contact",
    parents: "Parent / Guardian",
    secondary: "Secondary Contact",
    billing: "Billing Contact",
    emergency: "Emergency Contact",
};

export function groupRelationshipFieldsForPicker(
    fields: readonly SystemFieldRegistryEntry[],
): { id: RelationshipFieldPickerGroupId; label: string; fields: SystemFieldRegistryEntry[] }[] {
    const buckets = new Map<RelationshipFieldPickerGroupId, SystemFieldRegistryEntry[]>();
    for (const id of RELATIONSHIP_FIELD_PICKER_GROUP_ORDER) buckets.set(id, []);
    for (const field of fields) {
        if (!field.id.startsWith("rel:")) continue;
        const key = field.field_key;
        let group: RelationshipFieldPickerGroupId = "primary";
        if (key.startsWith("secondary_") || key.includes("secondary")) group = "secondary";
        else if (key.startsWith("billing_") || key.includes("billing")) group = "billing";
        else if (key.startsWith("emergency_") || key.includes("emergency")) group = "emergency";
        else if (key.startsWith("secondary_contact") || key === "secondary_email" || key === "secondary_phone") group = "secondary";
        buckets.get(group)!.push(field);
    }
    return RELATIONSHIP_FIELD_PICKER_GROUP_ORDER.map((id) => ({
        id,
        label: RELATIONSHIP_FIELD_PICKER_GROUP_LABELS[id],
        fields: buckets.get(id) ?? [],
    })).filter((g) => g.fields.length > 0);
}

export function entityTypeLabel(entityType: string): string {
    const map: Record<string, string> = {
        child: "Child",
        guardian: "Guardian / Contact",
        opportunity: "Inquiry",
        customer: "Customer",
        associate: "Associate",
        enrollment: "Inquiry",
        custom: "Custom",
    };
    return map[entityType] ?? entityType;
}

/** Operator-facing groups for the mapped-field picker (OI-4B / UC1). */
export const SYSTEM_FIELD_PICKER_GROUP_ORDER = [
    "guardian",
    "child",
    "inquiry",
    "advanced",
] as const;

export type SystemFieldPickerGroupId = (typeof SYSTEM_FIELD_PICKER_GROUP_ORDER)[number];

export const SYSTEM_FIELD_PICKER_GROUP_LABELS: Record<SystemFieldPickerGroupId, string> = {
    guardian: "Guardian / Contact",
    child: "Child",
    inquiry: "Inquiry",
    advanced: "Advanced / CRM",
};

function pickerGroupForEntityType(entityType: string): SystemFieldPickerGroupId {
    if (entityType === "guardian") return "guardian";
    if (entityType === "child") return "child";
    if (entityType === "opportunity" || entityType === "enrollment") return "inquiry";
    return "advanced";
}

export function groupSystemFieldsForPicker(
    fields: readonly SystemFieldRegistryEntry[]
): { id: SystemFieldPickerGroupId; label: string; fields: SystemFieldRegistryEntry[] }[] {
    const buckets = new Map<SystemFieldPickerGroupId, SystemFieldRegistryEntry[]>();
    for (const id of SYSTEM_FIELD_PICKER_GROUP_ORDER) buckets.set(id, []);
    for (const field of fields) {
        const group = pickerGroupForEntityType(field.entity_type);
        buckets.get(group)!.push(field);
    }
    return SYSTEM_FIELD_PICKER_GROUP_ORDER.map((id) => ({
        id,
        label: SYSTEM_FIELD_PICKER_GROUP_LABELS[id],
        fields: buckets.get(id) ?? [],
    })).filter((g) => g.fields.length > 0);
}

export function isCustomUnmappedField(f: FormField): boolean {
    return f.field_source?.entity_type === "custom" && f.field_source.field_key === "unmapped";
}

export function uiKindForField(f: FormField): UiScalarKind {
    if (f.type === "signature") return "signature";
    if (f.type === "boolean") return "checkbox";
    if (f.type === "number") return "number";
    if (f.type === "date") return "date";
    if (f.type === "select") return "select";
    if (f.type === "text") {
        if (f.multiline) return "textarea";
        if (f.validate?.pattern === EMAIL_PATTERN) return "email";
        if (f.validate?.pattern === PHONE_PATTERN) return "phone";
        return "text";
    }
    return "text";
}

export function answerTypeLabel(kind: UiScalarKind): string {
    const map: Record<UiScalarKind, string> = {
        text: "Short text",
        textarea: "Long text",
        email: "Email",
        phone: "Phone",
        number: "Number",
        date: "Date",
        checkbox: "Yes / no",
        select: "Single choice",
        signature: "Signature",
    };
    return map[kind];
}

export type PrefillSourcePresentation = {
    kind: "mapped" | "custom";
    label: string;
    detail: string | null;
};

/** Operator-facing prefill behavior — no schema semantic changes (FD-5). */
export type PrefillModeKey = "context_prefill" | "manual_only" | "locked_crm" | "editable_prefill";

export type PrefillModePresentation = {
    key: PrefillModeKey;
    label: string;
    detail: string | null;
};

export const PREFILL_MODE_COPY: Record<PrefillModeKey, string> = {
    context_prefill: "Prefills when context exists",
    manual_only: "Always completed manually",
    locked_crm: "Locked from CRM",
    editable_prefill: "Editable after prefill",
};

export function describePrefillMode(field: FormField, entry: SystemFieldRegistryEntry | null): PrefillModePresentation {
    if (isCustomUnmappedField(field) || !entry) {
        return {
            key: "manual_only",
            label: PREFILL_MODE_COPY.manual_only,
            detail: "No CRM mapping — family or operator enters each time.",
        };
    }
    if (field.read_only) {
        return {
            key: "locked_crm",
            label: PREFILL_MODE_COPY.locked_crm,
            detail: "Value hydrates from CRM and cannot be changed on intake.",
        };
    }
    return {
        key: "editable_prefill",
        label: PREFILL_MODE_COPY.editable_prefill,
        detail: "Hydrates when launch context or entity binding exists; recipient may edit.",
    };
}

export function describePrefillSource(
    field: FormField,
    entry: SystemFieldRegistryEntry | null
): PrefillSourcePresentation {
    if (isCustomUnmappedField(field) || !entry) {
        return {
            kind: "custom",
            label: FIELD_AUTHORING_COPY.customField,
            detail: "Answers stay on this submission unless you map a system field.",
        };
    }
    return {
        kind: "mapped",
        label: `Prefills from: ${entry.default_label}`,
        detail: `${entityTypeLabel(entry.entity_type)} · ${FIELD_AUTHORING_COPY.mappedField}`,
    };
}

export const ANSWER_TYPE_OPTIONS: { value: UiScalarKind; label: string }[] = [
    { value: "text", label: "Short text" },
    { value: "textarea", label: "Long text" },
    { value: "email", label: "Email" },
    { value: "phone", label: "Phone" },
    { value: "number", label: "Number" },
    { value: "date", label: "Date" },
    { value: "checkbox", label: "Yes / no" },
    { value: "select", label: "Single choice" },
    { value: "signature", label: "Signature" },
];

export const LAYOUT_OPTIONS = [
    { value: "full", label: "Full width" },
    { value: "half", label: "Half width" },
] as const;
