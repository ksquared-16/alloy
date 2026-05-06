"use client";

import { useCallback, useMemo } from "react";
import clsx from "clsx";
import type { FormField, FormSchemaV1 } from "@/lib/forms/schema";
import type { FormPayload, FormPayloadGroupRow, FormPayloadSignature } from "@/lib/forms/validateSubmission";
import { evaluateFieldVisibility } from "@/lib/forms/validateSubmission";
import { emptyPayload, ensureGroupRows, setSignature, setTopLevelValue } from "./formEnginePayload";

export type FormEngineRendererProps = {
    schema: FormSchemaV1;
    payload: FormPayload;
    onChange: (next: FormPayload) => void;
    mode: "edit" | "readonly";
    optionValuesByFieldId?: Record<string, readonly string[]>;
    variant?: "default" | "embed";
};

function fieldById(fields: FormField[], id: string): FormField | undefined {
    return fields.find((f) => f.id === id);
}

function randomInstanceKey(): string {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
    return `i_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function FormEngineRenderer({
    schema,
    payload,
    onChange,
    mode,
    optionValuesByFieldId,
    variant = "default",
}: FormEngineRendererProps) {
    const readonly = mode === "readonly";
    const loose = variant === "embed";

    const sectionModels = useMemo(() => {
        return schema.sections.map((s) => ({
            section: s,
            fields: s.field_ids.map((id) => fieldById(schema.fields, id)).filter(Boolean) as FormField[],
        }));
    }, [schema]);

    const renderScalarControl = useCallback(
        (field: FormField, cell: Record<string, unknown>, onCellChange: (fid: string, v: unknown) => void) => {
            if (field.type === "group" || field.type === "signature") return null;
            const raw = cell[field.id];
            const commonLabel = (
                <label className={clsx("block text-sm font-medium text-neutral-800", loose && "text-[13px]")}>
                    {field.label}
                    {field.required ? <span className="text-red-600"> *</span> : null}
                </label>
            );

            if (readonly) {
                const display =
                    field.type === "multiselect" && Array.isArray(raw)
                        ? raw.join(", ")
                        : raw === undefined || raw === null || raw === ""
                          ? "—"
                          : String(raw);
                return (
                    <div className="space-y-1">
                        {commonLabel}
                        <div className="rounded border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-sm">{display}</div>
                    </div>
                );
            }

            switch (field.type) {
                case "text":
                    return (
                        <div className="space-y-1">
                            {commonLabel}
                            <input
                                className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
                                value={typeof raw === "string" ? raw : raw == null ? "" : String(raw)}
                                onChange={(e) => onCellChange(field.id, e.target.value)}
                            />
                        </div>
                    );
                case "number":
                    return (
                        <div className="space-y-1">
                            {commonLabel}
                            <input
                                type="number"
                                className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
                                value={raw === undefined || raw === null || raw === "" ? "" : Number(raw)}
                                onChange={(e) => {
                                    const v = e.target.value;
                                    onCellChange(field.id, v === "" ? undefined : Number(v));
                                }}
                            />
                        </div>
                    );
                case "date":
                    return (
                        <div className="space-y-1">
                            {commonLabel}
                            <input
                                type="date"
                                className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
                                value={typeof raw === "string" ? raw : ""}
                                onChange={(e) => onCellChange(field.id, e.target.value)}
                            />
                        </div>
                    );
                case "boolean":
                    return (
                        <div className="flex items-center gap-2 pt-5">
                            <input
                                type="checkbox"
                                checked={Boolean(raw)}
                                onChange={(e) => onCellChange(field.id, e.target.checked)}
                                id={`cb_${field.id}`}
                            />
                            <label htmlFor={`cb_${field.id}`} className="text-sm font-medium text-neutral-800">
                                {field.label}
                                {field.required ? <span className="text-red-600"> *</span> : null}
                            </label>
                        </div>
                    );
                case "select": {
                    const opts = optionValuesByFieldId?.[field.id] ?? [];
                    return (
                        <div className="space-y-1">
                            {commonLabel}
                            <select
                                className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
                                value={typeof raw === "string" ? raw : ""}
                                onChange={(e) => onCellChange(field.id, e.target.value)}
                            >
                                <option value="">Select…</option>
                                {opts.map((o) => (
                                    <option key={o} value={o}>
                                        {o}
                                    </option>
                                ))}
                            </select>
                        </div>
                    );
                }
                case "multiselect": {
                    const opts = optionValuesByFieldId?.[field.id] ?? [];
                    const selected = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
                    return (
                        <div className="space-y-1">
                            {commonLabel}
                            <div className="flex flex-col gap-1 rounded border border-neutral-200 p-2">
                                {opts.map((o) => (
                                    <label key={o} className="flex items-center gap-2 text-sm">
                                        <input
                                            type="checkbox"
                                            checked={selected.includes(o)}
                                            onChange={() => {
                                                const next = selected.includes(o)
                                                    ? selected.filter((x) => x !== o)
                                                    : [...selected, o];
                                                onCellChange(field.id, next);
                                            }}
                                        />
                                        {o}
                                    </label>
                                ))}
                            </div>
                        </div>
                    );
                }
                case "file_ref":
                    return (
                        <div className="space-y-1">
                            {commonLabel}
                            <div className="rounded border border-dashed border-neutral-300 bg-neutral-50 px-2 py-3 text-sm text-neutral-600">
                                File upload ships with documents integration. UUID:{" "}
                                {typeof raw === "string" ? raw || "—" : "—"}
                            </div>
                        </div>
                    );
                default:
                    return null;
            }
        },
        [loose, optionValuesByFieldId, readonly]
    );

    const renderSignatureControl = useCallback(
        (
            field: FormField & { type: "signature" },
            sig: FormPayloadSignature | undefined,
            updateSig: (next: FormPayloadSignature) => void
        ) => {
            const commonLabel = (
                <label className={clsx("block text-sm font-medium text-neutral-800", loose && "text-[13px]")}>
                    {field.label}
                    {field.required ? <span className="text-red-600"> *</span> : null}
                </label>
            );

            if (readonly) {
                const summary =
                    sig?.kind === "typed"
                        ? `Typed: ${sig.typed_full_name ?? ""}`
                        : sig?.kind === "drawn"
                          ? `Drawn document: ${sig.drawn_document_id ?? ""}`
                          : "—";
                return (
                    <div className="space-y-1">
                        {commonLabel}
                        <div className="rounded border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-sm">{summary}</div>
                    </div>
                );
            }

            const kind = sig?.kind ?? "typed";
            return (
                <div className="space-y-2 rounded border border-neutral-200 p-3">
                    {commonLabel}
                    <div className="flex gap-3 text-sm">
                        <label className="flex items-center gap-1">
                            <input
                                type="radio"
                                checked={kind === "typed"}
                                onChange={() => updateSig({ kind: "typed", typed_full_name: sig?.typed_full_name ?? "" })}
                            />
                            Typed
                        </label>
                        <label className="flex items-center gap-1">
                            <input
                                type="radio"
                                checked={kind === "drawn"}
                                onChange={() => updateSig({ kind: "drawn", drawn_document_id: sig?.drawn_document_id })}
                            />
                            Drawn
                        </label>
                    </div>
                    {kind === "typed" ? (
                        <input
                            className="w-full rounded border border-neutral-300 px-2 py-1.5 text-sm"
                            placeholder="Full name"
                            value={sig?.typed_full_name ?? ""}
                            onChange={(e) =>
                                updateSig({ kind: "typed", typed_full_name: e.target.value, drawn_document_id: undefined })
                            }
                        />
                    ) : (
                        <div className="text-sm text-neutral-600">
                            Drawn asset UUID (stub until upload API is wired):
                            <input
                                className="mt-1 w-full rounded border border-neutral-300 px-2 py-1.5 font-mono text-xs"
                                placeholder="uuid"
                                value={sig?.drawn_document_id ?? ""}
                                onChange={(e) =>
                                    updateSig({
                                        kind: "drawn",
                                        drawn_document_id: e.target.value || undefined,
                                        typed_full_name: undefined,
                                    })
                                }
                            />
                        </div>
                    )}
                </div>
            );
        },
        [loose, readonly]
    );

    const renderGroup = useCallback(
        (field: FormField & { type: "group" }) => {
            const rep = field.repeat ?? { min: 0, max: undefined };
            const rows = payload.groups?.[field.id] ?? [];
            const vis = evaluateFieldVisibility(field.id, schema, (id) => payload.values[id]);
            if (!vis) return null;

            const updateRows = (next: FormPayloadGroupRow[]) => {
                onChange(ensureGroupRows(payload, field.id, next));
            };

            const renderNestedGroup = (
                child: FormField & { type: "group" },
                row: FormPayloadGroupRow,
                rowIdx: number,
                allRows: FormPayloadGroupRow[]
            ) => {
                const nestedRows = row.groups?.[child.id] ?? [];
                const updateNested = (nn: FormPayloadGroupRow[]) => {
                    const next = [...allRows];
                    next[rowIdx] = {
                        ...row,
                        groups: { ...(row.groups ?? {}), [child.id]: nn },
                    };
                    updateRows(next);
                };
                const nrep = child.repeat ?? { min: 0, max: undefined };
                return (
                    <div key={child.id} className="ml-2 border-l border-neutral-200 pl-3">
                        <div className="text-sm font-semibold text-neutral-700">{child.label}</div>
                        {nestedRows.map((nr, j) => (
                            <div key={nr.instance_key} className="mt-2 space-y-2 rounded bg-neutral-50 p-2">
                                {child.fields.map((nf) => {
                                    const getVal = (fid: string) =>
                                        fid in nr.values ? nr.values[fid] : payload.values[fid];
                                    if (!evaluateFieldVisibility(nf.id, schema, getVal)) return null;
                                    if (nf.type === "signature") {
                                        const sig = nr.signatures?.[nf.id];
                                        return (
                                            <div key={nf.id}>
                                                {renderSignatureControl(nf, sig, (nextSig) => {
                                                    const nrNext = [...nestedRows];
                                                    nrNext[j] = {
                                                        ...nr,
                                                        signatures: { ...(nr.signatures ?? {}), [nf.id]: nextSig },
                                                    };
                                                    updateNested(nrNext);
                                                })}
                                            </div>
                                        );
                                    }
                                    if (nf.type === "group") {
                                        return (
                                            <div key={nf.id} className="text-xs text-neutral-500">
                                                Deeply nested groups are not rendered in V1 UI.
                                            </div>
                                        );
                                    }
                                    return (
                                        <div key={nf.id}>
                                            {renderScalarControl(nf, nr.values, (fid, v) => {
                                                const nrNext = [...nestedRows];
                                                nrNext[j] = { ...nr, values: { ...nr.values, [fid]: v } };
                                                updateNested(nrNext);
                                            })}
                                        </div>
                                    );
                                })}
                                {!readonly && nestedRows.length > nrep.min ? (
                                    <button
                                        type="button"
                                        className="text-xs text-red-700 underline"
                                        onClick={() => updateNested(nestedRows.filter((_, ii) => ii !== j))}
                                    >
                                        Remove nested row
                                    </button>
                                ) : null}
                            </div>
                        ))}
                        {!readonly && (nrep.max === undefined || nestedRows.length < nrep.max) ? (
                            <button
                                type="button"
                                className="mt-2 text-xs text-blue-700 underline"
                                onClick={() =>
                                    updateNested([
                                        ...nestedRows,
                                        { instance_key: randomInstanceKey(), values: {}, signatures: {}, groups: {} },
                                    ])
                                }
                            >
                                Add {child.label}
                            </button>
                        ) : null}
                    </div>
                );
            };

            return (
                <div key={field.id} className="space-y-3">
                    <div className={clsx("text-base font-semibold text-neutral-900", loose && "text-[15px]")}>
                        {field.label}
                        {field.required ? <span className="text-red-600"> *</span> : null}
                    </div>
                    {rows.length === 0 && readonly ? (
                        <div className="text-sm text-neutral-500">No entries</div>
                    ) : null}
                    {rows.map((row, idx) => (
                        <div key={row.instance_key} className="space-y-3 rounded-lg border border-neutral-200 p-3">
                            <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                                {field.label} #{idx + 1}
                            </div>
                            {field.fields.map((child) => {
                                const getVal = (fid: string) =>
                                    fid in row.values ? row.values[fid] : payload.values[fid];
                                if (!evaluateFieldVisibility(child.id, schema, getVal)) return null;
                                if (child.type === "group") {
                                    return renderNestedGroup(child, row, idx, rows);
                                }
                                if (child.type === "signature") {
                                    const sig = row.signatures?.[child.id];
                                    return (
                                        <div key={child.id}>
                                            {renderSignatureControl(child, sig, (nextSig) => {
                                                const next = [...rows];
                                                next[idx] = {
                                                    ...row,
                                                    signatures: { ...(row.signatures ?? {}), [child.id]: nextSig },
                                                };
                                                updateRows(next);
                                            })}
                                        </div>
                                    );
                                }
                                return (
                                    <div key={child.id}>
                                        {renderScalarControl(child, row.values, (fid, v) => {
                                            const next = [...rows];
                                            next[idx] = { ...row, values: { ...row.values, [fid]: v } };
                                            updateRows(next);
                                        })}
                                    </div>
                                );
                            })}
                            {!readonly && rows.length > rep.min ? (
                                <button
                                    type="button"
                                    className="text-xs text-red-700 underline"
                                    onClick={() => updateRows(rows.filter((_, i) => i !== idx))}
                                >
                                    Remove
                                </button>
                            ) : null}
                        </div>
                    ))}
                    {!readonly &&
                    (rep.max === undefined || rows.length < rep.max) &&
                    (rep.min === 0 || rows.length >= rep.min) ? (
                        <button
                            type="button"
                            className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white"
                            onClick={() =>
                                updateRows([
                                    ...rows,
                                    {
                                        instance_key: randomInstanceKey(),
                                        values: {},
                                        groups: {},
                                        signatures: {},
                                    },
                                ])
                            }
                        >
                            Add {field.label}
                        </button>
                    ) : null}
                </div>
            );
        },
        [onChange, payload, readonly, renderScalarControl, renderSignatureControl, schema]
    );

    return (
        <div className={clsx("mx-auto max-w-xl space-y-8", loose && "max-w-full px-3 py-4")}>
            <header>
                <h1 className={clsx("text-xl font-semibold text-neutral-900", loose && "text-lg")}>{schema.title}</h1>
            </header>
            {sectionModels.map(({ section, fields }) => (
                <section key={section.id} className="space-y-4">
                    {section.title ? (
                        <h2 className={clsx("text-lg font-medium text-neutral-800", loose && "text-base")}>
                            {section.title}
                        </h2>
                    ) : null}
                    <div className="space-y-4">
                        {fields.map((field) => {
                            const vis = evaluateFieldVisibility(field.id, schema, (id) => payload.values[id]);
                            if (!vis) return null;
                            if (field.type === "group") {
                                return <div key={field.id}>{renderGroup(field)}</div>;
                            }
                            if (field.type === "signature") {
                                const sig = payload.signatures?.[field.id];
                                return (
                                    <div key={field.id}>
                                        {renderSignatureControl(field, sig, (nextSig) =>
                                            onChange(setSignature(payload, field.id, nextSig))
                                        )}
                                    </div>
                                );
                            }
                            return (
                                <div key={field.id}>
                                    {renderScalarControl(field, payload.values, (fid, v) => {
                                        onChange(setTopLevelValue(payload, fid, v));
                                    })}
                                </div>
                            );
                        })}
                    </div>
                </section>
            ))}
        </div>
    );
}

export { emptyPayload };
