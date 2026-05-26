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

export function entityTypeLabel(entityType: string): string {
    const map: Record<string, string> = {
        child: "Child",
        guardian: "Guardian",
        opportunity: "Opportunity",
        customer: "Customer / household",
        associate: "Associate",
        enrollment: "Enrollment",
        custom: "Custom",
    };
    return map[entityType] ?? entityType;
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
