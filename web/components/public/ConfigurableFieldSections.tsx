"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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

    return (
        <div className={`space-y-6 ${className}`}>
            {grouped.map(([sectionKey, sectionFields]) => (
                <div key={sectionKey} className="space-y-3">
                    <h4 className="text-sm font-semibold text-alloy-midnight border-b border-alloy-stone/20 pb-1">
                        {sectionLabel(sections, sectionKey)}
                    </h4>
                    <div className="space-y-3">
                        {sectionFields.map((f) => (
                            <div key={f.field_key}>
                                <label className="block text-sm font-medium text-alloy-midnight mb-1">
                                    {f.label}
                                    {f.is_required ? <span className="text-red-500 ml-0.5">*</span> : null}
                                </label>
                                {f.description ? (
                                    <p className="text-xs text-alloy-midnight/60 mb-1">{f.description}</p>
                                ) : null}
                                <FieldInput f={f} value={values[f.field_key]} onChange={onChange} />
                                {f.help_text ? (
                                    <p className="text-xs text-alloy-midnight/50 mt-1">{f.help_text}</p>
                                ) : null}
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

function FieldInput({
    f,
    value,
    onChange,
}: {
    f: PublicFieldDef;
    value: string | boolean | string[] | undefined;
    onChange: (k: string, v: string | boolean | string[]) => void;
}) {
    const t = f.field_type.toLowerCase();

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
                className="w-full px-4 py-3 border border-alloy-stone/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-alloy-juniper/70 bg-white"
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
                className="w-full px-4 py-3 border border-alloy-stone/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-alloy-juniper/70"
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
            className="w-full px-4 py-3 border border-alloy-stone/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-alloy-juniper/70"
        />
    );
}
