"use client";

import { useCallback, useMemo } from "react";
import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";
import PrimaryButton from "@/components/PrimaryButton";
import {
    OPERATIONAL_FORM_SYSTEM_FIELDS,
    SYSTEM_FIELD_BY_ID,
    linesToStaticOptions,
    type SystemFieldRegistryEntry,
} from "@/lib/forms/systemFieldRegistry";
import { customUnmappedTextField, formFieldFromRegistryEntry } from "@/lib/forms/systemFieldToFormField";

type UiScalarKind =
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

function staticOptionsToLines(opts: ReadonlyArray<{ value: string; label: string }> | undefined): string {
    if (!opts?.length) return "a|Option A\nb|Option B";
    return opts.map((o) => `${o.value}|${o.label}`).join("\n");
}

function uiKindForField(f: FormField): UiScalarKind {
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

function registryEntryForField(f: FormField): SystemFieldRegistryEntry | null {
    if (f.field_source?.entity_type === "custom") return null;
    return OPERATIONAL_FORM_SYSTEM_FIELDS.find((e) => e.field_key === f.id) ?? null;
}

function pickerValueForField(f: FormField): string {
    if (f.field_source?.entity_type === "custom" && f.field_source.field_key === "unmapped") return "__custom";
    const hit = OPERATIONAL_FORM_SYSTEM_FIELDS.find((e) => e.field_key === f.id);
    return hit ? `sys:${hit.id}` : "__custom";
}

function isCustomUnmappedField(f: FormField): boolean {
    return f.field_source?.entity_type === "custom" && f.field_source.field_key === "unmapped";
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

    const entityLabel = (t: string) => {
        const map: Record<string, string> = {
            child: "Child",
            guardian: "Guardian",
            opportunity: "Opportunity",
            customer: "Customer / household",
            associate: "Associate",
            enrollment: "Enrollment",
            custom: "Custom",
        };
        return map[t] ?? t;
    };

    return (
        <div className="space-y-4 text-sm text-[#31394d]">
            <div className="grid gap-2 sm:grid-cols-2">
                <label className="space-y-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-[#59678b]">Form name</span>
                    <input
                        className="w-full rounded border border-[#e6e8ec] px-2 py-1.5"
                        value={schema.title}
                        disabled={disabled}
                        onChange={(e) => patchSchema({ title: e.target.value })}
                    />
                </label>
                <label className="space-y-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-[#59678b]">Section heading</span>
                    <input
                        className="w-full rounded border border-[#e6e8ec] px-2 py-1.5"
                        value={schema.sections[0]?.title ?? ""}
                        disabled={disabled}
                        onChange={(e) => {
                            const s0 = schema.sections[0];
                            if (!s0) return;
                            const nextSecs = [{ ...s0, title: e.target.value }, ...schema.sections.slice(1)];
                            patchSchema({ sections: nextSecs });
                        }}
                    />
                </label>
            </div>

            <div className="overflow-x-auto rounded-lg border border-[#e6e8ec]">
                <table className="w-full min-w-[900px] text-left text-sm">
                    <thead className="bg-[#fafbfd] text-xs font-semibold uppercase text-[#59678b]">
                        <tr>
                            <th className="px-2 py-2">Data field</th>
                            <th className="px-2 py-2">Label</th>
                            <th className="px-2 py-2">Help</th>
                            <th className="px-2 py-2">Req</th>
                            <th className="px-2 py-2">Width</th>
                            <th className="px-2 py-2">Input type</th>
                            <th className="px-2 py-2">Placeholder / options</th>
                            <th className="px-2 py-2">Order</th>
                            <th className="px-2 py-2" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e6e8ec]">
                        {topFields.map((field, idx) => {
                            const entry = registryEntryForField(field);
                            const custom = isCustomUnmappedField(field);
                            const locked = isTypeLocked(entry, custom);
                            const kind = uiKindForField(field);
                            const intakeNote =
                                entry && !entry.public_intake_safe ? (
                                    <p className="mt-1 text-[11px] text-amber-900">Internal / staff-only suggested use.</p>
                                ) : null;
                            const customWarn = custom ? (
                                <p className="mt-1 text-[11px] text-amber-900">Custom / unmapped — not auto-linked to CRM.</p>
                            ) : null;

                            return (
                                <tr key={field.id} className="align-top">
                                    <td className="px-2 py-2">
                                        <select
                                            className="max-w-[220px] rounded border border-[#e6e8ec] px-1 py-1 text-xs"
                                            disabled={disabled}
                                            value={pickerValueForField(field)}
                                            onChange={(e) => {
                                                const v = e.target.value;
                                                if (v === "__custom") {
                                                    setFieldAt(idx, customUnmappedTextField());
                                                    return;
                                                }
                                                if (v.startsWith("sys:")) {
                                                    const rid = v.slice(4);
                                                    const ent = SYSTEM_FIELD_BY_ID.get(rid);
                                                    if (ent) setFieldAt(idx, formFieldFromRegistryEntry(ent, {}));
                                                }
                                            }}
                                        >
                                            <optgroup label="System fields">
                                                {OPERATIONAL_FORM_SYSTEM_FIELDS.map((e) => {
                                                    const takenElsewhere = topFields.some((f, i) => i !== idx && f.id === e.field_key);
                                                    return (
                                                        <option key={e.id} value={`sys:${e.id}`} disabled={takenElsewhere}>
                                                            {entityLabel(e.entity_type)} — {e.default_label}
                                                        </option>
                                                    );
                                                })}
                                            </optgroup>
                                            <option value="__custom">Custom / unmapped (text)</option>
                                        </select>
                                        {intakeNote}
                                        {customWarn}
                                    </td>
                                    <td className="px-2 py-2">
                                        <input
                                            className="w-full min-w-[120px] rounded border border-[#e6e8ec] px-1 py-1"
                                            disabled={disabled}
                                            value={field.label}
                                            onChange={(e) => {
                                                if (field.type === "group") return;
                                                setFieldAt(idx, { ...field, label: e.target.value } as FormField);
                                            }}
                                        />
                                    </td>
                                    <td className="px-2 py-2">
                                        <input
                                            className="w-full min-w-[120px] rounded border border-[#e6e8ec] px-1 py-1 text-xs"
                                            disabled={disabled}
                                            value={"description" in field ? field.description ?? "" : ""}
                                            placeholder="Help text"
                                            onChange={(e) => {
                                                if (field.type === "group") return;
                                                const v = e.target.value.trim();
                                                setFieldAt(idx, {
                                                    ...field,
                                                    ...(v ? { description: v } : { description: undefined }),
                                                } as FormField);
                                            }}
                                        />
                                    </td>
                                    <td className="px-2 py-2">
                                        <input
                                            type="checkbox"
                                            disabled={disabled}
                                            checked={field.required}
                                            onChange={(e) => {
                                                if (field.type === "group") return;
                                                setFieldAt(idx, { ...field, required: e.target.checked } as FormField);
                                            }}
                                        />
                                    </td>
                                    <td className="px-2 py-2">
                                        {field.type === "group" ? (
                                            <span className="text-xs text-[#59678b]">—</span>
                                        ) : (
                                            <select
                                                className="max-w-[100px] rounded border border-[#e6e8ec] px-1 py-1 text-xs"
                                                disabled={disabled}
                                                value={field.layout_width === "half" ? "half" : "full"}
                                                onChange={(e) => {
                                                    const v = e.target.value === "half" ? "half" : "full";
                                                    setFieldAt(idx, {
                                                        ...field,
                                                        ...(v === "full" ? { layout_width: undefined } : { layout_width: "half" }),
                                                    } as FormField);
                                                }}
                                            >
                                                <option value="full">Full</option>
                                                <option value="half">Half</option>
                                            </select>
                                        )}
                                    </td>
                                    <td className="px-2 py-2">
                                        <select
                                            className="max-w-[130px] rounded border border-[#e6e8ec] px-1 py-1 text-xs"
                                            disabled={disabled || locked}
                                            value={kind}
                                            title={locked ? "Type is fixed for this system field." : undefined}
                                            onChange={(e) => {
                                                const nextKind = e.target.value as UiScalarKind;
                                                if (locked) return;
                                                const textKinds: UiScalarKind[] = ["text", "textarea", "email", "phone"];
                                                if (custom) {
                                                    const nf = buildFieldFromUiCustom(nextKind, field.id, field.label);
                                                    setFieldAt(idx, {
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
                                                    setFieldAt(idx, applyTextLikeKind(field, nextKind, field.id));
                                                }
                                            }}
                                        >
                                            <option value="text">Text</option>
                                            <option value="textarea">Text area</option>
                                            <option value="email">Email</option>
                                            <option value="phone">Phone</option>
                                            <option value="number">Number</option>
                                            <option value="date">Date</option>
                                            <option value="checkbox">Checkbox</option>
                                            <option value="select">Select</option>
                                            <option value="signature">Signature</option>
                                        </select>
                                    </td>
                                    <td className="px-2 py-2">
                                        {field.type === "select" ? (
                                            <textarea
                                                className="h-20 w-full min-w-[160px] rounded border border-[#e6e8ec] px-1 py-1 font-mono text-xs"
                                                disabled={disabled}
                                                value={staticOptionsToLines(field.static_options)}
                                                placeholder={"value|Label per line"}
                                                onChange={(e) => {
                                                    const raw = e.target.value;
                                                    if (entry) {
                                                        setFieldAt(
                                                            idx,
                                                            {
                                                                ...formFieldFromRegistryEntry(entry, { static_options_lines: raw }),
                                                                ...layoutPassThrough(field),
                                                            } as FormField
                                                        );
                                                    } else {
                                                        setFieldAt(idx, {
                                                            ...field,
                                                            type: "select",
                                                            static_options: linesToStaticOptions(raw),
                                                        } as FormField);
                                                    }
                                                }}
                                            />
                                        ) : field.type === "text" ? (
                                            <input
                                                className="w-full min-w-[120px] rounded border border-[#e6e8ec] px-1 py-1 text-xs"
                                                disabled={disabled}
                                                value={field.placeholder ?? ""}
                                                onChange={(e) => {
                                                    const v = e.target.value;
                                                    setFieldAt(idx, {
                                                        ...field,
                                                        ...(v.trim() ? { placeholder: v } : { placeholder: undefined }),
                                                    } as FormField);
                                                }}
                                            />
                                        ) : (
                                            <span className="text-xs text-[#59678b]">—</span>
                                        )}
                                    </td>
                                    <td className="px-2 py-2 whitespace-nowrap">
                                        <button
                                            type="button"
                                            className="mr-1 text-[#00458C] disabled:opacity-40"
                                            disabled={disabled || idx === 0}
                                            onClick={() => move(idx, -1)}
                                        >
                                            Up
                                        </button>
                                        <button
                                            type="button"
                                            className="text-[#00458C] disabled:opacity-40"
                                            disabled={disabled || idx >= topFields.length - 1}
                                            onClick={() => move(idx, 1)}
                                        >
                                            Down
                                        </button>
                                    </td>
                                    <td className="px-2 py-2">
                                        <button
                                            type="button"
                                            className="text-red-700 disabled:opacity-40"
                                            disabled={disabled || topFields.length <= 1}
                                            onClick={() => removeFieldAt(idx)}
                                        >
                                            Remove
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <PrimaryButton type="button" className="!px-3 !py-2 text-sm" disabled={disabled} onClick={addField}>
                Add field
            </PrimaryButton>

            <details className="rounded border border-[#e6e8ec] bg-[#fafbfd] px-3 py-2 text-xs text-[#59678b]">
                <summary className="cursor-pointer font-medium text-[#31394d]">Technical details (IDs)</summary>
                <p className="mt-2 leading-relaxed">
                    Internal keys are assigned from the system field you pick (or from a custom row). You normally do not need
                    these values — they keep submissions, shared values, and future CRM mapping aligned.
                </p>
                <ul className="mt-2 list-disc pl-5 font-mono text-[11px]">
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
