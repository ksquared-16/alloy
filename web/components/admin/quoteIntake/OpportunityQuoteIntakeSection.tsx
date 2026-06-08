"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { QuoteIntakeCatalogResponse, QuoteIntakeResolvedField } from "@/lib/quoteIntake/types";
import { OPPORTUNITY_CLEANING_QUOTE_INTAKE_V1 } from "@/lib/quoteIntake/workflows/opportunityCleaningQuoteV1";

type Props = {
    opportunityId: string;
    canMutate: boolean;
    onSaved: (row: Record<string, unknown>) => void;
    onClose: () => void;
};

function initialValuesFromFields(fields: QuoteIntakeResolvedField[]): Record<string, string | string[]> {
    const out: Record<string, string | string[]> = {};
    for (const f of fields) {
        if (f.input === "multiselect") {
            out[f.quote_input_key] = [];
        } else {
            out[f.quote_input_key] = "";
        }
    }
    return out;
}

export default function OpportunityQuoteIntakeSection({ opportunityId, canMutate, onSaved, onClose }: Props) {
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [catalog, setCatalog] = useState<QuoteIntakeCatalogResponse | null>(null);
    const [values, setValues] = useState<Record<string, string | string[]>>({});
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setLoadError(null);
        fetch(`/api/admin/quote-intake/catalog?workflow_key=${encodeURIComponent(OPPORTUNITY_CLEANING_QUOTE_INTAKE_V1.workflow_key)}`)
            .then((r) => r.json())
            .then((j: QuoteIntakeCatalogResponse & { error?: string; ok?: boolean }) => {
                if (cancelled) return;
                if (!j?.ok || !j.fields?.length) {
                    throw new Error((j as { error?: string }).error ?? "Failed to load quote intake catalog");
                }
                setCatalog(j as QuoteIntakeCatalogResponse);
                setValues(initialValuesFromFields(j.fields));
            })
            .catch((e) => {
                if (!cancelled) setLoadError(e instanceof Error ? e.message : "Load failed");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const fieldsSorted = useMemo(
        () => (catalog?.fields ? [...catalog.fields].sort((a, b) => a.sort_order - b.sort_order) : []),
        [catalog?.fields]
    );

    const setField = useCallback((key: string, input: "select" | "multiselect", v: string, checked?: boolean) => {
        setValues((prev) => {
            if (input === "multiselect") {
                const cur = Array.isArray(prev[key]) ? [...(prev[key] as string[])] : [];
                if (checked) {
                    if (!cur.includes(v)) cur.push(v);
                } else {
                    const i = cur.indexOf(v);
                    if (i >= 0) cur.splice(i, 1);
                }
                return { ...prev, [key]: cur };
            }
            return { ...prev, [key]: v };
        });
    }, []);

    const onSubmit = useCallback(async () => {
        if (!catalog) return;
        setSaving(true);
        setSaveError(null);
        try {
            const quote_inputs: Record<string, unknown> = {};
            for (const f of fieldsSorted) {
                const raw = values[f.quote_input_key];
                if (f.input === "multiselect") {
                    quote_inputs[f.quote_input_key] = Array.isArray(raw) ? raw : [];
                } else {
                    const s = typeof raw === "string" ? raw.trim() : "";
                    if (f.required && !s) {
                        throw new Error(`${f.label} is required`);
                    }
                    quote_inputs[f.quote_input_key] = s || null;
                }
            }

            const sqft = quote_inputs.square_footage;
            if (sqft == null || (typeof sqft === "string" && !sqft.trim())) {
                throw new Error("Square footage is required");
            }

            const res = await fetch(`/api/admin/opportunities/${opportunityId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    status_key: "needs_a_quote",
                    quote_inputs,
                }),
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error((json as { error?: string }).error ?? "Quote save failed");
            onSaved(json as Record<string, unknown>);
        } catch (e) {
            setSaveError(e instanceof Error ? e.message : "Quote save failed");
        } finally {
            setSaving(false);
        }
    }, [catalog, fieldsSorted, onSaved, opportunityId, values]);

    if (loading) {
        return (
            <section className="rounded-lg border border-admin-border bg-white/80 p-3 text-sm text-alloy-midnight/70">
                Loading quote intake…
            </section>
        );
    }

    if (loadError || !catalog) {
        return (
            <section className="rounded-lg border border-amber-200 bg-amber-50/90 p-3 text-sm text-amber-950">
                {loadError ?? "Could not load catalog"}
            </section>
        );
    }

    return (
        <section className="rounded-lg border border-admin-border bg-white/80 p-3">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h3 className="text-sm font-medium text-alloy-midnight/90">{catalog.workflow.label}</h3>
                    <p className="mt-0.5 text-xs text-alloy-midnight/60">
                        Config-driven fields · saves to <code className="text-[11px]">metadata.quote_inputs</code> and runs pricing.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="text-xs px-2 py-1 rounded border border-alloy-stone/50 hover:bg-alloy-stone/20"
                >
                    Close
                </button>
            </div>

            {saveError ? <p className="mt-2 text-xs text-alloy-ember">{saveError}</p> : null}

            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {fieldsSorted.map((f) => {
                    const colClass = f.full_width ? "sm:col-span-2" : "";
                    if (f.input === "select") {
                        const v = typeof values[f.quote_input_key] === "string" ? (values[f.quote_input_key] as string) : "";
                        return (
                            <div key={f.id} className={colClass}>
                                <label className="block text-xs text-alloy-midnight/70 mb-0.5">
                                    {f.label}
                                    {f.required ? <span className="text-alloy-ember"> *</span> : null}
                                </label>
                                <select
                                    value={v}
                                    onChange={(e) => setField(f.quote_input_key, "select", e.target.value)}
                                    disabled={!canMutate}
                                    className="w-full rounded border border-alloy-stone/50 px-2 py-1.5 text-sm bg-white disabled:opacity-50"
                                >
                                    <option value="">{f.required ? `Select…` : "—"}</option>
                                    {f.options.map((o) => (
                                        <option key={o.value} value={o.value}>
                                            {o.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        );
                    }
                    const selected = Array.isArray(values[f.quote_input_key]) ? (values[f.quote_input_key] as string[]) : [];
                    return (
                        <div key={f.id} className={colClass}>
                            <div className="block text-xs text-alloy-midnight/70 mb-1">
                                {f.label}
                                {f.required ? <span className="text-alloy-ember"> *</span> : null}
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {f.options.length === 0 ? (
                                    <span className="text-xs text-alloy-midnight/55">No add-ons configured for this org.</span>
                                ) : (
                                    f.options.map((o) => {
                                        const checked = selected.includes(o.value);
                                        return (
                                            <label
                                                key={o.value}
                                                className="inline-flex items-center gap-1.5 text-xs rounded border border-alloy-stone/40 px-2 py-1 cursor-pointer hover:bg-alloy-stone/15"
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    disabled={!canMutate}
                                                    onChange={(e) => setField(f.quote_input_key, "multiselect", o.value, e.target.checked)}
                                                />
                                                <span>{o.label}</span>
                                            </label>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                    type="button"
                    disabled={saving || !canMutate}
                    onClick={() => void onSubmit()}
                    className="px-3 py-1.5 text-sm bg-alloy-blue text-white rounded-md hover:opacity-90 disabled:opacity-50"
                >
                    {saving ? "Saving…" : "Save + compute quote"}
                </button>
                <button
                    type="button"
                    disabled={saving}
                    onClick={onClose}
                    className="px-3 py-1.5 text-sm border border-alloy-stone/60 rounded-md hover:bg-alloy-stone/30"
                >
                    Cancel
                </button>
            </div>
        </section>
    );
}
