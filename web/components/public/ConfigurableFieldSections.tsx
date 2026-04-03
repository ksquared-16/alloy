"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

export type PublicFieldDef = {
    id: string;
    field_key: string;
    field_type: string;
    label: string;
    description: string | null;
    section_key: string;
    sort_order: number;
    placeholder: string | null;
    help_text: string | null;
    is_required: boolean;
    options: { value: string; label: string }[];
};

export type PublicSectionDef = {
    section_key: string;
    label: string;
    description: string | null;
    sort_order: number;
};

type ApiResponse = {
    ok?: boolean;
    fields?: PublicFieldDef[];
    sections?: PublicSectionDef[];
};

export type ConfigurableFieldSectionsProps = {
    entityType: string;
    verticalSlug?: string;
    values: Record<string, string | boolean | string[]>;
    onChange: (fieldKey: string, value: string | boolean | string[]) => void;
    className?: string;
    /** Tighter spacing and inputs (e.g. book-v2 service step). */
    dense?: boolean;
    /** When adjacent in the same section, render as one row (e.g. bedrooms + bathrooms). */
    sameRowAdjacentKeys?: readonly [string, string] | null;
    /** When set, skips internal fetch (e.g. parent loaded once for summary + form). */
    prefetched?: { fields: PublicFieldDef[]; sections: PublicSectionDef[] } | null;
};

function sectionSortOrder(sections: PublicSectionDef[], key: string): number {
    const row = sections.find((s) => s.section_key === key);
    return row?.sort_order ?? 999;
}

function sectionLabel(sections: PublicSectionDef[], key: string): string {
    const row = sections.find((s) => s.section_key === key);
    if (row?.label) return row.label;
    return key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " ");
}

export default function ConfigurableFieldSections({
    entityType,
    verticalSlug,
    values,
    onChange,
    className = "",
    dense = false,
    sameRowAdjacentKeys = null,
    prefetched = null,
}: ConfigurableFieldSectionsProps) {
    const [fields, setFields] = useState<PublicFieldDef[]>(prefetched?.fields ?? []);
    const [sections, setSections] = useState<PublicSectionDef[]>(prefetched?.sections ?? []);
    const [loading, setLoading] = useState(!prefetched);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const q = new URLSearchParams({ entity_type: entityType });
            if (verticalSlug?.trim()) q.set("vertical_slug", verticalSlug.trim());
            const res = await fetch(`/api/public/field-definitions?${q.toString()}`);
            const data = (await res.json()) as ApiResponse;
            if (!res.ok || !data.ok) {
                throw new Error((data as { error?: string }).error ?? "Failed to load fields");
            }
            setFields(data.fields ?? []);
            setSections(data.sections ?? []);
        } catch (e) {
            setError((e as Error).message);
            setFields([]);
            setSections([]);
        } finally {
            setLoading(false);
        }
    }, [entityType, verticalSlug]);

    useEffect(() => {
        if (prefetched) {
            setFields(prefetched.fields);
            setSections(prefetched.sections);
            setLoading(false);
            setError(null);
            return;
        }
        void load();
    }, [load, prefetched]);

    const grouped = useMemo(() => {
        const map = new Map<string, PublicFieldDef[]>();
        for (const f of fields) {
            const sk = f.section_key || "custom";
            if (!map.has(sk)) map.set(sk, []);
            map.get(sk)!.push(f);
        }
        for (const arr of map.values()) {
            arr.sort((a, b) => a.sort_order - b.sort_order);
        }
        return [...map.entries()].sort(
            (a, b) => sectionSortOrder(sections, a[0]) - sectionSortOrder(sections, b[0])
        );
    }, [fields, sections]);

    if (loading) {
        return <p className={`text-sm text-alloy-midnight/60 ${className}`}>Loading fields…</p>;
    }
    if (error) {
        return <p className={`text-sm text-red-600 ${className}`}>{error}</p>;
    }
    if (fields.length === 0) {
        return null;
    }

    const sectionGap = dense ? "space-y-4" : "space-y-6";
    const fieldGap = dense ? "space-y-2" : "space-y-3";
    const labelMb = dense ? "mb-0.5" : "mb-1";

    return (
        <div className={`${sectionGap} ${className}`}>
            {grouped.map(([sectionKey, sectionFields]) => (
                <div key={sectionKey} className={fieldGap}>
                    <h4
                        className={`text-sm font-semibold text-alloy-midnight border-b border-alloy-stone/20 ${
                            dense ? "pb-0.5" : "pb-1"
                        }`}
                    >
                        {sectionLabel(sections, sectionKey)}
                    </h4>
                    <div className={fieldGap}>
                        {renderSectionFieldList({
                            sectionFields,
                            values,
                            onChange,
                            dense,
                            sameRowAdjacentKeys,
                            labelMb,
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}

function renderSectionFieldList(params: {
    sectionFields: PublicFieldDef[];
    values: Record<string, string | boolean | string[]>;
    onChange: (fieldKey: string, value: string | boolean | string[]) => void;
    dense: boolean;
    sameRowAdjacentKeys: readonly [string, string] | null;
    labelMb: string;
}): ReactNode[] {
    const { sectionFields, values, onChange, dense, sameRowAdjacentKeys, labelMb } = params;
    const [pairA, pairB] = sameRowAdjacentKeys ?? [null, null];
    const out: React.ReactNode[] = [];
    for (let i = 0; i < sectionFields.length; i++) {
        const f = sectionFields[i]!;
        const next = sectionFields[i + 1];
        if (pairA && pairB && f.field_key === pairA && next?.field_key === pairB) {
            out.push(
                <div key={`${pairA}-${pairB}`} className="grid grid-cols-2 gap-3">
                    <div>
                        <label className={`block text-sm font-medium text-alloy-midnight ${labelMb}`}>
                            {f.label}
                            {f.is_required ? <span className="text-red-500 ml-0.5">*</span> : null}
                        </label>
                        {f.description ? (
                            <p className="text-xs text-alloy-midnight/60 mb-0.5">{f.description}</p>
                        ) : null}
                        <PublicFieldControl f={f} value={values[f.field_key]} onChange={onChange} dense={dense} />
                    </div>
                    <div>
                        <label className={`block text-sm font-medium text-alloy-midnight ${labelMb}`}>
                            {next.label}
                            {next.is_required ? <span className="text-red-500 ml-0.5">*</span> : null}
                        </label>
                        {next.description ? (
                            <p className="text-xs text-alloy-midnight/60 mb-0.5">{next.description}</p>
                        ) : null}
                        <PublicFieldControl f={next} value={values[next.field_key]} onChange={onChange} dense={dense} />
                    </div>
                </div>
            );
            i++;
            continue;
        }
        out.push(
            <div key={f.field_key}>
                <label className={`block text-sm font-medium text-alloy-midnight ${labelMb}`}>
                    {f.label}
                    {f.is_required ? <span className="text-red-500 ml-0.5">*</span> : null}
                </label>
                {f.description ? <p className="text-xs text-alloy-midnight/60 mb-0.5">{f.description}</p> : null}
                <PublicFieldControl f={f} value={values[f.field_key]} onChange={onChange} dense={dense} />
                {f.help_text ? <p className="text-xs text-alloy-midnight/50 mt-0.5">{f.help_text}</p> : null}
            </div>
        );
    }
    return out;
}

/** Single public field control (select, text, boolean, etc.) — exported for custom layouts. */
export function PublicFieldControl({
    f,
    value,
    onChange,
    dense = false,
}: {
    f: PublicFieldDef;
    value: string | boolean | string[] | undefined;
    onChange: (k: string, v: string | boolean | string[]) => void;
    dense?: boolean;
}) {
    const t = f.field_type.toLowerCase();
    const pad = dense ? "px-3 py-2" : "px-4 py-3";
    const focus = "focus:outline-none focus:ring-2 focus:ring-alloy-juniper/70";

    if (t === "boolean") {
        const checked = value === true || value === "true";
        return (
            <label className="flex items-center gap-2 cursor-pointer">
                <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => onChange(f.field_key, e.target.checked)}
                    className="h-4 w-4 rounded border-alloy-stone/40 text-alloy-juniper focus:ring-alloy-juniper/70"
                />
                <span className="text-sm text-alloy-midnight">Yes</span>
            </label>
        );
    }

    if (t === "select" && f.options.length > 0) {
        const v = typeof value === "string" ? value : "";
        return (
            <select
                value={v}
                onChange={(e) => onChange(f.field_key, e.target.value)}
                className={`w-full ${pad} border border-alloy-stone/30 rounded-lg ${focus} bg-white text-sm`}
            >
                <option value="">{f.placeholder || "Select…"}</option>
                {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                        {o.label}
                    </option>
                ))}
            </select>
        );
    }

    if (t === "multiselect" && f.options.length > 0) {
        const selected = Array.isArray(value) ? value : typeof value === "string" && value ? value.split(",") : [];
        const set = new Set(selected.map((x) => x.trim()).filter(Boolean));
        return (
            <div className="space-y-2">
                {f.options.map((o) => (
                    <label key={o.value} className="flex items-center gap-2 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={set.has(o.value)}
                            onChange={(e) => {
                                const next = new Set(set);
                                if (e.target.checked) next.add(o.value);
                                else next.delete(o.value);
                                onChange(f.field_key, [...next]);
                            }}
                            className="h-4 w-4 rounded border-alloy-stone/40 text-alloy-juniper"
                        />
                        <span className="text-sm text-alloy-midnight">{o.label}</span>
                    </label>
                ))}
            </div>
        );
    }

    if (t === "number") {
        const v = value != null ? String(value) : "";
        return (
            <input
                type="number"
                value={v}
                placeholder={f.placeholder ?? undefined}
                onChange={(e) => onChange(f.field_key, e.target.value)}
                className={`w-full ${pad} border border-alloy-stone/30 rounded-lg ${focus} text-sm`}
            />
        );
    }

    const v = value != null && typeof value !== "boolean" ? String(value) : "";
    const inputType =
        t === "email" ? "email" : t === "phone" ? "tel" : t === "date" ? "date" : t === "datetime" ? "datetime-local" : "text";

    return (
        <input
            type={inputType}
            value={v}
            placeholder={f.placeholder ?? undefined}
            onChange={(e) => onChange(f.field_key, e.target.value)}
            className={`w-full ${pad} border border-alloy-stone/30 rounded-lg ${focus} text-sm`}
        />
    );
}
