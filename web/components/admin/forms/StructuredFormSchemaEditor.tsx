"use client";

import { useCallback, useMemo } from "react";
import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";
import PrimaryButton from "@/components/PrimaryButton";

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

function buildFieldFromUi(kind: UiScalarKind, id: string, label: string): FormField {
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
            return { ...base, type: "signature", required: true };
        default:
            return { ...base, type: "text" };
    }
}

function staticOptionsToLines(opts: ReadonlyArray<{ value: string; label: string }> | undefined): string {
    if (!opts?.length) return "a|Option A\nb|Option B";
    return opts.map((o) => `${o.value}|${o.label}`).join("\n");
}

function linesToStaticOptions(raw: string): { value: string; label: string }[] {
    const lines = raw
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
    const out: { value: string; label: string }[] = [];
    for (const line of lines) {
        const pipe = line.indexOf("|");
        if (pipe === -1) {
            const v = line;
            out.push({ value: v, label: v });
        } else {
            out.push({
                value: line.slice(0, pipe).trim(),
                label: line.slice(pipe + 1).trim() || line.slice(0, pipe).trim(),
            });
        }
    }
    return out.length ? out : [{ value: "a", label: "Option A" }];
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
        const n = schema.fields.length + 1;
        const id = `field_${n}`;
        const f = buildFieldFromUi("text", id, `Question ${n}`);
        const sec0 = schema.sections[0] ?? { id: "main", title: "Main", field_ids: [] as string[] };
        patchSchema({
            fields: [...schema.fields, f],
            sections: [{ ...sec0, field_ids: [...sec0.field_ids, id] }, ...schema.sections.slice(1)],
        });
    }, [patchSchema, schema.fields, schema.sections]);

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
            const nextSecs = [{ ...schema.sections[0]!, field_ids: ids }, ...schema.sections.slice(1)];
            onChange({ ...schema, sections: nextSecs });
        },
        [mainSection?.field_ids, onChange, schema]
    );

    return (
        <div className="space-y-4 text-sm text-[#31394d]">
            <div className="grid gap-2 sm:grid-cols-2">
                <label className="space-y-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-[#59678b]">Form title</span>
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
                <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="bg-[#fafbfd] text-xs font-semibold uppercase text-[#59678b]">
                        <tr>
                            <th className="px-2 py-2">Type</th>
                            <th className="px-2 py-2">Field id</th>
                            <th className="px-2 py-2">Label</th>
                            <th className="px-2 py-2">Help</th>
                            <th className="px-2 py-2">Req</th>
                            <th className="px-2 py-2">Placeholder / options</th>
                            <th className="px-2 py-2">Order</th>
                            <th className="px-2 py-2" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e6e8ec]">
                        {topFields.map((field, idx) => {
                            const kind = uiKindForField(field);
                            return (
                                <tr key={field.id} className="align-top">
                                    <td className="px-2 py-2">
                                        <select
                                            className="max-w-[140px] rounded border border-[#e6e8ec] px-1 py-1 text-xs"
                                            disabled={disabled}
                                            value={kind}
                                            onChange={(e) => {
                                                const nextKind = e.target.value as UiScalarKind;
                                                const nf = buildFieldFromUi(nextKind, field.id, field.label);
                                                const merged: FormField = {
                                                    ...nf,
                                                    required: field.required,
                                                    description: "description" in field ? field.description : undefined,
                                                    placeholder: "placeholder" in field ? field.placeholder : undefined,
                                                } as FormField;
                                                setFieldAt(idx, merged);
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
                                        <input
                                            className="w-full max-w-[140px] rounded border border-[#e6e8ec] px-1 py-1 font-mono text-xs"
                                            disabled={disabled}
                                            value={field.id}
                                            onChange={(e) => {
                                                const nid = e.target.value.trim();
                                                if (!nid) return;
                                                if (field.type === "group") return;
                                                setFieldAt(idx, { ...field, id: nid } as FormField);
                                            }}
                                        />
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
                                        {field.type === "select" ? (
                                            <textarea
                                                className="h-20 w-full min-w-[160px] rounded border border-[#e6e8ec] px-1 py-1 font-mono text-xs"
                                                disabled={disabled}
                                                value={staticOptionsToLines(field.static_options)}
                                                placeholder={"value|Label per line"}
                                                onChange={(e) => {
                                                    const opts = linesToStaticOptions(e.target.value);
                                                    setFieldAt(idx, {
                                                        ...field,
                                                        type: "select",
                                                        static_options: opts,
                                                    });
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
            <p className="text-xs text-[#59678b]">
                This editor updates the same <code className="rounded bg-[#f4f6f9] px-1">schema_version: 1</code> JSON the
                public embed and validators use. Select lists use inline options (no separate option set required).
            </p>
        </div>
    );
}
