"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    PLATFORM_BUILDER_BTN,
    PLATFORM_BUILDER_BTN_DANGER,
    PLATFORM_BUILDER_BTN_PRIMARY,
    PLATFORM_BUILDER_INPUT,
    PLATFORM_BUILDER_SELECT,
    PLATFORM_BUILDER_SHELL,
    PLATFORM_BUILDER_TEXTAREA,
    PlatformBuilderField,
    PlatformBuilderSection,
} from "@/app/adminV2/settings/analytics/platformBuilderUi";
import {
    fetchMetricDefinitions,
    previewMetricDefinition,
} from "@/lib/metrics/platform/fetchMetricPlatform";
import { copyMetricToOrg, runMetricSnapshots } from "@/lib/metrics/platform/fetchMetricRender";
import type { MetricDefinitionRow } from "@/lib/metrics/platform/types";
import type { MetricSourceAdapter } from "@/lib/metrics/platform/metricSourceRegistry";
import type { MetricEvaluationResult } from "@/lib/metrics/platform/types";

type Props = { canEdit: boolean };

type MetricForm = {
    key: string;
    label: string;
    description: string;
    category: string;
    source_key: string;
    aggregation: string;
    unit: string;
    precision: number;
    is_kpi: boolean;
    period_days: number;
    target_min_rate: string;
    healthy_min_rate: string;
    warning_min_rate: string;
    target_max_count: string;
    healthy_max_count: string;
    warning_max_count: string;
    direction: "higher_is_better" | "lower_is_better";
};

const EMPTY_FORM: MetricForm = {
    key: "",
    label: "",
    description: "",
    category: "general",
    source_key: "enrollment.tour_conversion_rate",
    aggregation: "rate",
    unit: "percent",
    precision: 1,
    is_kpi: true,
    period_days: 30,
    target_min_rate: "0.65",
    healthy_min_rate: "0.65",
    warning_min_rate: "0.50",
    target_max_count: "10",
    healthy_max_count: "10",
    warning_max_count: "25",
    direction: "higher_is_better",
};

function rowToForm(row: MetricDefinitionRow): MetricForm {
    const period = row.default_period_config;
    const target = row.target_config;
    const thresholds = row.threshold_config;
    return {
        key: row.key,
        label: row.label,
        description: row.description,
        category: row.category,
        source_key: row.source_key,
        aggregation: row.aggregation,
        unit: row.unit,
        precision: row.precision,
        is_kpi: row.is_kpi,
        period_days: period?.days ?? 30,
        target_min_rate: String(target?.targetMinRate ?? thresholds?.healthyMinRate ?? ""),
        healthy_min_rate: String(thresholds?.healthyMinRate ?? ""),
        warning_min_rate: String(thresholds?.warningMinRate ?? ""),
        target_max_count: String(target?.targetMaxCount ?? thresholds?.healthyMaxCount ?? ""),
        healthy_max_count: String(thresholds?.healthyMaxCount ?? ""),
        warning_max_count: String(thresholds?.warningMaxCount ?? ""),
        direction: target?.direction ?? "higher_is_better",
    };
}

function formToPayload(form: MetricForm, status: string) {
    const isRate = form.aggregation === "rate";
    return {
        key: form.key.trim(),
        label: form.label.trim(),
        description: form.description.trim(),
        category: form.category.trim() || "general",
        entity_scope: "org" as const,
        source_type: "oip_adapter" as const,
        source_key: form.source_key,
        aggregation: form.aggregation,
        filter_config: { version: 1 as const },
        dimension_config: { version: 1 as const },
        default_period_config: { version: 1 as const, kind: "rolling" as const, days: form.period_days },
        unit: form.unit,
        precision: form.precision,
        is_kpi: form.is_kpi,
        target_config: form.is_kpi
            ? isRate
                ? {
                      version: 1 as const,
                      kind: "rate_min" as const,
                      targetMinRate: parseFloat(form.target_min_rate) || 0,
                      direction: form.direction,
                  }
                : {
                      version: 1 as const,
                      kind: "count_max" as const,
                      targetMaxCount: parseInt(form.target_max_count, 10) || 0,
                      direction: form.direction,
                  }
            : null,
        threshold_config: form.is_kpi
            ? isRate
                ? {
                      version: 1 as const,
                      healthyMinRate: parseFloat(form.healthy_min_rate) || 0,
                      warningMinRate: parseFloat(form.warning_min_rate) || 0,
                  }
                : {
                      version: 1 as const,
                      healthyMaxCount: parseInt(form.healthy_max_count, 10) || 0,
                      warningMaxCount: parseInt(form.warning_max_count, 10) || 0,
                  }
            : null,
        status,
        version: 1 as const,
    };
}

export default function MetricBuilderPanel({ canEdit }: Props) {
    const [items, setItems] = useState<MetricDefinitionRow[]>([]);
    const [adapters, setAdapters] = useState<MetricSourceAdapter[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [form, setForm] = useState<MetricForm>(EMPTY_FORM);
    const [isNew, setIsNew] = useState(false);
    const [preview, setPreview] = useState<MetricEvaluationResult | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const selected = useMemo(
        () => items.find((i) => i.id === selectedId) ?? null,
        [items, selectedId]
    );
    const isGlobal = selected?.org_id == null && !isNew;

    const load = useCallback(async () => {
        setLoading(true);
        const data = await fetchMetricDefinitions();
        setItems((data.items ?? []) as MetricDefinitionRow[]);
        setAdapters((data.adapters ?? []) as MetricSourceAdapter[]);
        setLoading(false);
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        if (selected && !isNew) setForm(rowToForm(selected));
    }, [selected, isNew]);

    const patchField = <K extends keyof MetricForm>(key: K, value: MetricForm[K]) => {
        setForm((f) => ({ ...f, [key]: value }));
    };

    const ensureOrgCopy = async (): Promise<MetricDefinitionRow | null> => {
        if (!selected || selected.org_id != null) return selected;
        const copied = await copyMetricToOrg(selected.id);
        if (!copied?.item) {
            setError("Could not copy global template to your organization.");
            return null;
        }
        await load();
        const item = copied.item as MetricDefinitionRow;
        setSelectedId(item.id);
        setIsNew(false);
        return item;
    };

    const save = async (status: string) => {
        if (!canEdit) return;
        setSaving(true);
        setError(null);
        try {
            let targetId = selectedId;
            if (isGlobal && !isNew) {
                const orgCopy = await ensureOrgCopy();
                if (!orgCopy) return;
                targetId = orgCopy.id;
            }

            const payload = formToPayload(form, status);
            const res =
                isNew || !targetId
                    ? await fetch("/api/admin/analytics/metrics", {
                          method: "POST",
                          credentials: "include",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify(payload),
                      })
                    : await fetch(`/api/admin/analytics/metrics/${targetId}`, {
                          method: "PATCH",
                          credentials: "include",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify(payload),
                      });

            if (!res.ok) {
                const data = (await res.json()) as { error?: string };
                setError(data.error ?? "Save failed");
                return;
            }
            const data = (await res.json()) as { item: MetricDefinitionRow };
            setSelectedId(data.item.id);
            setIsNew(false);
            await load();
            if (status === "active") await runMetricSnapshots({ metric_definition_ids: [data.item.id] });
        } finally {
            setSaving(false);
        }
    };

    const runPreview = async () => {
        if (!selectedId) return;
        let id = selectedId;
        if (isGlobal) {
            const orgCopy = await ensureOrgCopy();
            if (!orgCopy) return;
            id = orgCopy.id;
        }
        const result = await previewMetricDefinition(id);
        setPreview(result);
    };

    const duplicate = async () => {
        if (!selected || !canEdit) return;
        setIsNew(true);
        setSelectedId(null);
        patchField("key", `${selected.key}_copy`);
        patchField("label", `${selected.label} (copy)`);
    };

    const archive = async () => {
        if (!selectedId || !canEdit || isGlobal) return;
        await save("archived");
    };

    return (
        <div data-metric-builder="true" className={`${PLATFORM_BUILDER_SHELL} p-4`}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h3 className="text-sm font-semibold text-alloy-midnight">Metrics</h3>
                    <p className="text-xs text-alloy-midnight/50">Define what to measure, how to compute it, and KPI thresholds.</p>
                </div>
                {canEdit ?
                    <button
                        type="button"
                        className={PLATFORM_BUILDER_BTN_PRIMARY}
                        onClick={() => {
                            setIsNew(true);
                            setSelectedId(null);
                            setForm(EMPTY_FORM);
                            setPreview(null);
                        }}
                    >
                        + New metric
                    </button>
                :   null}
            </div>

            {error ?
                <p className="mb-3 text-sm text-alloy-ember">{error}</p>
            :   null}

            <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
                <div className="rounded-lg border border-alloy-stone/12 p-2">
                    {loading ?
                        <p className="p-2 text-sm text-alloy-midnight/45">Loading…</p>
                    :   <ul className="max-h-[480px] space-y-0.5 overflow-y-auto">
                            {items.map((item) => (
                                <li key={item.id}>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelectedId(item.id);
                                            setIsNew(false);
                                            setPreview(null);
                                        }}
                                        className={`w-full rounded-md px-2 py-1.5 text-left text-sm ${selectedId === item.id && !isNew ? "bg-alloy-midnight/8 font-semibold" : "hover:bg-alloy-stone/8"}`}
                                    >
                                        {item.label}
                                        <span className="ml-1 block text-[10px] text-alloy-midnight/40">
                                            {item.status}{item.org_id ? "" : " · template"}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    }
                </div>

                {(selected || isNew) ?
                    <div className="space-y-4">
                        <PlatformBuilderSection title="Identity">
                            <PlatformBuilderField label="Key">
                                <input
                                    className={PLATFORM_BUILDER_INPUT}
                                    value={form.key}
                                    disabled={!isNew}
                                    onChange={(e) => patchField("key", e.target.value)}
                                />
                            </PlatformBuilderField>
                            <PlatformBuilderField label="Label">
                                <input className={PLATFORM_BUILDER_INPUT} value={form.label} onChange={(e) => patchField("label", e.target.value)} disabled={isGlobal} />
                            </PlatformBuilderField>
                            <PlatformBuilderField label="Category">
                                <input className={PLATFORM_BUILDER_INPUT} value={form.category} onChange={(e) => patchField("category", e.target.value)} disabled={isGlobal} />
                            </PlatformBuilderField>
                            <div className="sm:col-span-2">
                                <PlatformBuilderField label="Description">
                                    <textarea className={PLATFORM_BUILDER_TEXTAREA} value={form.description} onChange={(e) => patchField("description", e.target.value)} disabled={isGlobal} />
                                </PlatformBuilderField>
                            </div>
                        </PlatformBuilderSection>

                        <PlatformBuilderSection title="Computation">
                            <PlatformBuilderField label="Source adapter">
                                <select className={PLATFORM_BUILDER_SELECT} value={form.source_key} onChange={(e) => patchField("source_key", e.target.value)} disabled={isGlobal}>
                                    {adapters.map((a) => (
                                        <option key={a.key} value={a.key} disabled={a.status !== "available"}>
                                            {a.label} ({a.status})
                                        </option>
                                    ))}
                                </select>
                            </PlatformBuilderField>
                            <PlatformBuilderField label="Aggregation">
                                <select className={PLATFORM_BUILDER_SELECT} value={form.aggregation} onChange={(e) => patchField("aggregation", e.target.value)} disabled={isGlobal}>
                                    {["count", "rate", "avg", "sum", "median"].map((a) => (
                                        <option key={a} value={a}>{a}</option>
                                    ))}
                                </select>
                            </PlatformBuilderField>
                            <PlatformBuilderField label="Period (days)">
                                <input type="number" className={PLATFORM_BUILDER_INPUT} value={form.period_days} onChange={(e) => patchField("period_days", parseInt(e.target.value, 10) || 30)} disabled={isGlobal} />
                            </PlatformBuilderField>
                            <PlatformBuilderField label="Unit">
                                <select className={PLATFORM_BUILDER_SELECT} value={form.unit} onChange={(e) => patchField("unit", e.target.value)} disabled={isGlobal}>
                                    {["percent", "count", "rate", "duration", "currency"].map((u) => (
                                        <option key={u} value={u}>{u}</option>
                                    ))}
                                </select>
                            </PlatformBuilderField>
                        </PlatformBuilderSection>

                        <PlatformBuilderSection title="Thresholds">
                            <PlatformBuilderField label="Is KPI">
                                <input type="checkbox" checked={form.is_kpi} onChange={(e) => patchField("is_kpi", e.target.checked)} disabled={isGlobal} className="mt-2" />
                            </PlatformBuilderField>
                            <PlatformBuilderField label="Direction">
                                <select className={PLATFORM_BUILDER_SELECT} value={form.direction} onChange={(e) => patchField("direction", e.target.value as MetricForm["direction"])} disabled={isGlobal}>
                                    <option value="higher_is_better">Higher is better</option>
                                    <option value="lower_is_better">Lower is better</option>
                                </select>
                            </PlatformBuilderField>
                            {form.aggregation === "rate" ?
                                <>
                                    <PlatformBuilderField label="Target min rate"><input className={PLATFORM_BUILDER_INPUT} value={form.target_min_rate} onChange={(e) => patchField("target_min_rate", e.target.value)} disabled={isGlobal} /></PlatformBuilderField>
                                    <PlatformBuilderField label="Healthy min"><input className={PLATFORM_BUILDER_INPUT} value={form.healthy_min_rate} onChange={(e) => patchField("healthy_min_rate", e.target.value)} disabled={isGlobal} /></PlatformBuilderField>
                                    <PlatformBuilderField label="Warning min"><input className={PLATFORM_BUILDER_INPUT} value={form.warning_min_rate} onChange={(e) => patchField("warning_min_rate", e.target.value)} disabled={isGlobal} /></PlatformBuilderField>
                                </>
                            :   <>
                                    <PlatformBuilderField label="Target max count"><input className={PLATFORM_BUILDER_INPUT} value={form.target_max_count} onChange={(e) => patchField("target_max_count", e.target.value)} disabled={isGlobal} /></PlatformBuilderField>
                                    <PlatformBuilderField label="Healthy max"><input className={PLATFORM_BUILDER_INPUT} value={form.healthy_max_count} onChange={(e) => patchField("healthy_max_count", e.target.value)} disabled={isGlobal} /></PlatformBuilderField>
                                    <PlatformBuilderField label="Warning max"><input className={PLATFORM_BUILDER_INPUT} value={form.warning_max_count} onChange={(e) => patchField("warning_max_count", e.target.value)} disabled={isGlobal} /></PlatformBuilderField>
                                </>
                            }
                        </PlatformBuilderSection>

                        {isGlobal ?
                            <p className="text-xs text-alloy-midnight/50">Global template — editing creates an org copy automatically.</p>
                        :   null}

                        <div className="flex flex-wrap gap-2">
                            <button type="button" className={PLATFORM_BUILDER_BTN} onClick={() => void runPreview()} disabled={!selectedId && !isNew}>Preview live</button>
                            {canEdit ?
                                <>
                                    <button type="button" className={PLATFORM_BUILDER_BTN} onClick={() => void save("draft")} disabled={saving}>Save draft</button>
                                    <button type="button" className={PLATFORM_BUILDER_BTN_PRIMARY} onClick={() => void save("active")} disabled={saving}>Publish</button>
                                    {selected?.status === "active" ?
                                        <button type="button" className={PLATFORM_BUILDER_BTN} onClick={() => void save("draft")} disabled={saving || isGlobal}>Unpublish</button>
                                    :   null}
                                    {selected && !isNew ?
                                        <>
                                            <button type="button" className={PLATFORM_BUILDER_BTN} onClick={() => void duplicate()}>Duplicate</button>
                                            {!isGlobal ?
                                                <button type="button" className={PLATFORM_BUILDER_BTN_DANGER} onClick={() => void archive()}>Archive</button>
                                            :   null}
                                        </>
                                    :   null}
                                </>
                            :   null}
                        </div>

                        {preview ?
                            <div className="rounded-lg border border-alloy-juniper/20 bg-alloy-juniper/5 p-3">
                                <p className="text-xs font-semibold uppercase text-alloy-juniper">Preview (builder only)</p>
                                <p className="mt-1 text-2xl font-semibold tabular-nums">{preview.formattedValue}</p>
                                <p className="text-xs text-alloy-midnight/50">Health: {preview.healthState}</p>
                            </div>
                        :   null}
                    </div>
                :   <p className="text-sm text-alloy-midnight/45">Select a metric or create a new one.</p>}
            </div>
        </div>
    );
}
