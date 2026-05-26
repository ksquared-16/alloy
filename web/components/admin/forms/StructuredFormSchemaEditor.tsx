"use client";

import clsx from "clsx";
import { useCallback, useMemo } from "react";
import PrimaryButton from "@/components/PrimaryButton";
import { FormFieldAuthoringCard } from "@/components/admin/forms/FormFieldAuthoringCard";
import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";
import {
    FIELD_AUTHORING_COPY,
    isCustomUnmappedField,
    uiKindForField,
    type UiScalarKind,
} from "@/lib/forms/formFieldAuthoringPresentation";
import {
    OPERATIONAL_FORM_SYSTEM_FIELDS,
    SYSTEM_FIELD_BY_ID,
    type SystemFieldRegistryEntry,
} from "@/lib/forms/systemFieldRegistry";
import { customUnmappedTextField, formFieldFromRegistryEntry } from "@/lib/forms/systemFieldToFormField";
import {
    opGroupedSurface,
    opMetadata,
    opMutedMeta,
    opTechnicalSurface,
} from "@/lib/operational/ui/operationalVisualTokens";

const EMAIL_PATTERN = "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$";
const PHONE_PATTERN = "^[+0-9()\\-\\s]{7,}$";

function registryEntryForField(f: FormField): SystemFieldRegistryEntry | null {
    if (f.field_source?.entity_type === "custom") return null;
    return OPERATIONAL_FORM_SYSTEM_FIELDS.find((e) => e.field_key === f.id) ?? null;
}

function pickerValueForField(f: FormField): string {
    if (f.field_source?.entity_type === "custom" && f.field_source.field_key === "unmapped") return "__custom";
    const hit = OPERATIONAL_FORM_SYSTEM_FIELDS.find((e) => e.field_key === f.id);
    return hit ? `sys:${hit.id}` : "__custom";
}

function isTypeLocked(entry: SystemFieldRegistryEntry | null, custom: boolean): boolean {
    if (custom || !entry) return false;
    const k = entry.suggested_kind;
    return k === "date" || k === "number" || k === "checkbox" || k === "signature" || k === "select";
}

function layoutPassThrough(field: FormField): { layout_width?: "full" | "half" } {
    if ("layout_width" in field && (field.layout_width === "half" || field.layout_width === "full")) {
        return { layout_width: field.layout_width };
    }
    return {};
}

function applyTextLikeKind(field: FormField, kind: UiScalarKind, preserveId: string): FormField {
    const label = field.label;
    const required = field.required;
    const description = field.description;
    const placeholder = field.placeholder;
    const src = field.field_source;
    const base = { id: preserveId, label, required, description, placeholder, field_source: src, ...layoutPassThrough(field) };
    switch (kind) {
        case "text":
            return { ...base, type: "text" };
        case "textarea":
            return { ...base, type: "text", multiline: true };
        case "email":
            return { ...base, type: "text", validate: { pattern: EMAIL_PATTERN } };
        case "phone":
            return { ...base, type: "text", validate: { pattern: PHONE_PATTERN } };
        default:
            return { ...base, type: "text" };
    }
}

function buildFieldFromUiCustom(kind: UiScalarKind, id: string, label: string): FormField {
    const base = { id, label, required: false };
    switch (kind) {
        case "text":
            return { ...base, type: "text" };
        case "textarea":
            return { ...base, type: "text", multiline: true };
        case "email":
            return { ...base, type: "text", validate: { pattern: EMAIL_PATTERN } };
        case "phone":
            return { ...base, type: "text", validate: { pattern: PHONE_PATTERN } };
        case "number":
            return { ...base, type: "number" };
        case "date":
            return { ...base, type: "date" };
        case "checkbox":
            return { ...base, type: "boolean" };
        case "select":
            return {
                ...base,
                type: "select",
                static_options: [
                    { value: "a", label: "Option A" },
                    { value: "b", label: "Option B" },
                ],
            };
        case "signature":
            return { ...base, type: "signature", signature: {} };
        default:
            return { ...base, type: "text" };
    }
}

export type StructuredFormSchemaEditorProps = {
    schema: FormSchemaV1;
    onChange: (next: FormSchemaV1) => void;
    disabled?: boolean;
};

export default function StructuredFormSchemaEditor({ schema, onChange, disabled }: StructuredFormSchemaEditorProps) {
    const mainSection = schema.sections[0];
    const topFields = useMemo(
        () => mainSection?.field_ids.map((id) => schema.fields.find((f) => f.id === id)).filter(Boolean) as FormField[],
        [mainSection?.field_ids, schema.fields]
    );

    const patchSchema = useCallback(
        (patch: Partial<FormSchemaV1>) => {
            onChange({ ...schema, ...patch });
        },
        [onChange, schema]
    );

    const setFieldAt = useCallback(
        (index: number, nextField: FormField) => {
            const ids = [...(mainSection?.field_ids ?? [])];
            const oldId = ids[index];
            const nextFields = schema.fields.map((f) => (f.id === oldId ? nextField : f));
            if (oldId !== nextField.id) {
                ids[index] = nextField.id;
                for (let s = 0; s < schema.sections.length; s++) {
                    const sec = schema.sections[s];
                    const fi = sec.field_ids.indexOf(oldId);
                    if (fi >= 0) {
                        const nf = [...sec.field_ids];
                        nf[fi] = nextField.id;
                        const nextSecs = [...schema.sections];
                        nextSecs[s] = { ...sec, field_ids: nf };
                        onChange({ ...schema, fields: nextFields, sections: nextSecs });
                        return;
                    }
                }
            }
            onChange({ ...schema, fields: nextFields });
        },
        [mainSection?.field_ids, onChange, schema]
    );

    const addField = useCallback(() => {
        const used = new Set(topFields.map((f) => f.id));
        const nextSys = OPERATIONAL_FORM_SYSTEM_FIELDS.find((e) => !used.has(e.field_key));
        const f = nextSys ? formFieldFromRegistryEntry(nextSys, {}) : customUnmappedTextField();
        const sec0 = schema.sections[0] ?? { id: "main", title: "Questions", field_ids: [] as string[] };
        patchSchema({
            fields: [...schema.fields, f],
            sections: [{ ...sec0, field_ids: [...sec0.field_ids, f.id] }, ...schema.sections.slice(1)],
        });
    }, [patchSchema, schema.fields, schema.sections, topFields]);

    const removeFieldAt = useCallback(
        (index: number) => {
            const ids = [...(mainSection?.field_ids ?? [])];
            const rid = ids[index];
            if (!rid) return;
            ids.splice(index, 1);
            const nextFields = schema.fields.filter((x) => x.id !== rid);
            const nextSecs = schema.sections.map((s, i) =>
                i === 0 ? { ...s, field_ids: ids.filter((fid) => nextFields.some((f) => f.id === fid)) } : s
            );
            onChange({ ...schema, fields: nextFields, sections: nextSecs });
        },
        [mainSection?.field_ids, onChange, schema]
    );

    const move = useCallback(
        (index: number, dir: -1 | 1) => {
            const ids = [...(mainSection?.field_ids ?? [])];
            const j = index + dir;
            if (j < 0 || j >= ids.length) return;
            const tmp = ids[index];
            ids[index] = ids[j]!;
            ids[j] = tmp!;
            const s0 = schema.sections[0];
            if (!s0) return;
            const nextSecs = [{ ...s0, field_ids: ids }, ...schema.sections.slice(1)];
            onChange({ ...schema, sections: nextSecs });
        },
        [mainSection?.field_ids, onChange, schema]
    );

    const handlePickerChange = useCallback(
        (index: number, value: string) => {
            const field = topFields[index];
            if (!field) return;

            if (value.startsWith("kind:")) {
                const nextKind = value.slice(5) as UiScalarKind;
                const entry = registryEntryForField(field);
                const custom = isCustomUnmappedField(field);
                const locked = isTypeLocked(entry, custom);
                if (locked) return;
                const textKinds: UiScalarKind[] = ["text", "textarea", "email", "phone"];
                if (custom) {
                    const nf = buildFieldFromUiCustom(nextKind, field.id, field.label);
                    setFieldAt(index, {
                        ...nf,
                        ...layoutPassThrough(field),
                        required: field.required,
                        description: field.description,
                        placeholder: field.placeholder,
                        field_source: { entity_type: "custom", field_key: "unmapped" },
                    } as FormField);
                    return;
                }
                if (entry && textKinds.includes(entry.suggested_kind) && textKinds.includes(nextKind)) {
                    setFieldAt(index, applyTextLikeKind(field, nextKind, field.id));
                }
                return;
            }

            if (value === "__custom") {
                setFieldAt(index, customUnmappedTextField());
                return;
            }
            if (value.startsWith("sys:")) {
                const rid = value.slice(4);
                const ent = SYSTEM_FIELD_BY_ID.get(rid);
                if (ent) setFieldAt(index, formFieldFromRegistryEntry(ent, {}));
            }
        },
        [setFieldAt, topFields]
    );

    const takenIdsForIndex = useCallback(
        (index: number) => new Set(topFields.filter((_, i) => i !== index).map((f) => f.id)),
        [topFields]
    );

    const inputClass =
        "w-full rounded-lg border border-alloy-midnight/10 bg-white px-2.5 py-1.5 text-sm text-alloy-midnight shadow-sm";

    return (
        <div className="space-y-4" data-testid="structured-form-schema-editor">
            <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1">
                    <span className={opMetadata}>{FIELD_AUTHORING_COPY.documentTitle}</span>
                    <input
                        className={inputClass}
                        value={schema.title}
                        disabled={disabled}
                        onChange={(e) => patchSchema({ title: e.target.value })}
                        data-testid="form-document-title"
                    />
                </label>
                <label className="space-y-1">
                    <span className={opMetadata}>{FIELD_AUTHORING_COPY.sectionHeading}</span>
                    <input
                        className={inputClass}
                        value={schema.sections[0]?.title ?? ""}
                        disabled={disabled}
                        onChange={(e) => {
                            const s0 = schema.sections[0];
                            if (!s0) return;
                            const nextSecs = [{ ...s0, title: e.target.value }, ...schema.sections.slice(1)];
                            patchSchema({ sections: nextSecs });
                        }}
                        data-testid="form-section-heading"
                    />
                </label>
            </div>

            <div data-testid="form-field-authoring-section">
                <p className={opMutedMeta}>{FIELD_AUTHORING_COPY.sectionLead}</p>

                {topFields.length === 0 ?
                    <div className={clsx("mt-3 rounded-xl px-4 py-5 text-center", opTechnicalSurface)} data-testid="form-field-authoring-empty">
                        <p className="text-sm font-medium text-alloy-midnight">{FIELD_AUTHORING_COPY.emptyTitle}</p>
                        <p className={clsx("mt-1", opMetadata)}>{FIELD_AUTHORING_COPY.emptyLead}</p>
                    </div>
                :   <ul className={clsx(opGroupedSurface, "mt-3")} data-testid="form-field-authoring-list">
                        {topFields.map((field, idx) => {
                            const entry = registryEntryForField(field);
                            const custom = isCustomUnmappedField(field);
                            return (
                                <FormFieldAuthoringCard
                                    key={field.id}
                                    field={field}
                                    index={idx}
                                    total={topFields.length}
                                    disabled={disabled}
                                    entry={entry}
                                    custom={custom}
                                    locked={isTypeLocked(entry, custom)}
                                    kind={uiKindForField(field)}
                                    pickerValue={pickerValueForField(field)}
                                    systemFields={OPERATIONAL_FORM_SYSTEM_FIELDS}
                                    takenFieldIds={takenIdsForIndex(idx)}
                                    onPickerChange={handlePickerChange}
                                    onFieldChange={setFieldAt}
                                    onMove={move}
                                    onRemove={removeFieldAt}
                                />
                            );
                        })}
                    </ul>
                }
            </div>

            <PrimaryButton
                type="button"
                className="!px-3 !py-2 text-sm"
                disabled={disabled}
                onClick={addField}
                data-testid="form-add-question"
            >
                {FIELD_AUTHORING_COPY.addQuestion}
            </PrimaryButton>

            <details className={clsx("rounded-lg px-3 py-2", opTechnicalSurface)} data-testid="form-field-authoring-technical">
                <summary className={clsx("cursor-pointer text-sm font-medium text-alloy-midnight/80")}>
                    Technical details (internal keys)
                </summary>
                <p className={clsx("mt-2 leading-relaxed", opMetadata)}>
                    Internal keys align submissions with CRM mapping — you normally do not need to edit these.
                </p>
                <ul className="mt-2 list-disc pl-5 font-mono text-[11px] text-alloy-midnight/75">
                    {topFields.map((f) => (
                        <li key={f.id}>
                            {f.id}
                            {f.field_source ? ` · ${f.field_source.entity_type}.${f.field_source.field_key}` : ""}
                        </li>
                    ))}
                </ul>
            </details>
        </div>
    );
}

export { StructuredFormSchemaEditor };
