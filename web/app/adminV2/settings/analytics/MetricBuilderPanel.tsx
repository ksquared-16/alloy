"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    PLATFORM_BUILDER_INPUT,
    PLATFORM_BUILDER_SELECT,
    PLATFORM_BUILDER_SHELL,
    PLATFORM_BUILDER_TEXTAREA,
    PlatformBuilderButton,
    PlatformBuilderCallout,
    PlatformBuilderEmptyState,
    PlatformBuilderField,
    PlatformBuilderListItem,
    PlatformBuilderListPanel,
    PlatformBuilderModal,
    PlatformBuilderSection,
    PlatformBuilderStatusBadge,
} from "@/app/adminV2/settings/analytics/platformBuilderUi";
import {
    METRIC_STATUS_LABELS,
    slugifyMetricKey,
} from "@/app/adminV2/settings/analytics/platformBuilderLabels";
import { fetchMetricDefinitions, previewMetricDefinition } from "@/lib/metrics/platform/fetchMetricPlatform";
import { copyMetricToOrg, runMetricSnapshots } from "@/lib/metrics/platform/fetchMetricRender";
import type { MetricDefinitionRow, MetricEvaluationResult } from "@/lib/metrics/platform/types";
import type { MetricSourceAdapter } from "@/lib/metrics/platform/metricSourceRegistry";

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

function MetricFormFields({
    form,
    patchField,
    adapters,
    disabled,
    showAdvanced,
}: {
    form: MetricForm;
    patchField: <K extends keyof MetricForm>(key: K, value: MetricForm[K]) => void;
    adapters: MetricSourceAdapter[];
    disabled: boolean;
    showAdvanced: boolean;
}) {
    const sourceLabel = adapters.find((a) => a.key === form.source_key)?.label ?? form.source_key;

    return (
        <>
            <PlatformBuilderSection title="What are you measuring?" hint="Give this calculation a clear name operators will recognize.">
                {showAdvanced ?
                    <PlatformBuilderField label="Internal key">
                        <input
                            className={PLATFORM_BUILDER_INPUT}
                            value={form.key}
                            disabled={disabled}
                            onChange={(e) => patchField("key", e.target.value)}
                        />
                    </PlatformBuilderField>
                :   null}
                <PlatformBuilderField label="Name">
                    <input
                        className={PLATFORM_BUILDER_INPUT}
                        value={form.label}
                        disabled={disabled}
                        onChange={(e) => patchField("label", e.target.value)}
                        placeholder="Tour Conversion %"
                    />
                </PlatformBuilderField>
                <PlatformBuilderField label="Category">
                    <input
                        className={PLATFORM_BUILDER_INPUT}
                        value={form.category}
                        disabled={disabled}
                        onChange={(e) => patchField("category", e.target.value)}
                    />
                </PlatformBuilderField>
                <div className="sm:col-span-2">
                    <PlatformBuilderField label="Description">
                        <textarea
                            className={PLATFORM_BUILDER_TEXTAREA}
                            value={form.description}
                            disabled={disabled}
                            onChange={(e) => patchField("description", e.target.value)}
                            placeholder="What this number means for operators."
                        />
                    </PlatformBuilderField>
                </div>
            </PlatformBuilderSection>

            <PlatformBuilderSection title="How is it calculated?" hint={`Source: ${sourceLabel} · Rolling ${form.period_days}-day window`}>
                <PlatformBuilderField label="Data source">
                    <select
                        className={PLATFORM_BUILDER_SELECT}
                        value={form.source_key}
                        onChange={(e) => patchField("source_key", e.target.value)}
                        disabled={disabled}
                    >
                        {adapters.map((a) => (
                            <option key={a.key} value={a.key} disabled={a.status !== "available"}>
                                {a.label}
                            </option>
                        ))}
                    </select>
                </PlatformBuilderField>
                <PlatformBuilderField label="Calculation type">
                    <select
                        className={PLATFORM_BUILDER_SELECT}
                        value={form.aggregation}
                        onChange={(e) => patchField("aggregation", e.target.value)}
                        disabled={disabled}
                    >
                        {["count", "rate", "avg", "sum", "median"].map((a) => (
                            <option key={a} value={a}>{a}</option>
                        ))}
                    </select>
                </PlatformBuilderField>
                <PlatformBuilderField label="Time window (days)">
                    <input
                        type="number"
                        className={PLATFORM_BUILDER_INPUT}
                        value={form.period_days}
                        onChange={(e) => patchField("period_days", parseInt(e.target.value, 10) || 30)}
                        disabled={disabled}
                    />
                </PlatformBuilderField>
                <PlatformBuilderField label="Display unit">
                    <select
                        className={PLATFORM_BUILDER_SELECT}
                        value={form.unit}
                        onChange={(e) => patchField("unit", e.target.value)}
                        disabled={disabled}
                    >
                        {["percent", "count", "rate", "duration", "currency"].map((u) => (
                            <option key={u} value={u}>{u}</option>
                        ))}
                    </select>
                </PlatformBuilderField>
            </PlatformBuilderSection>

            <PlatformBuilderSection title="Targets & health" hint="Used for green / yellow / red health states in the workspace.">
                <PlatformBuilderField label="Track as KPI">
                    <input
                        type="checkbox"
                        checked={form.is_kpi}
                        onChange={(e) => patchField("is_kpi", e.target.checked)}
                        disabled={disabled}
                        className="mt-2 h-4 w-4 rounded border-alloy-stone/40"
                    />
                </PlatformBuilderField>
                <PlatformBuilderField label="Better direction">
                    <select
                        className={PLATFORM_BUILDER_SELECT}
                        value={form.direction}
                        onChange={(e) => patchField("direction", e.target.value as MetricForm["direction"])}
                        disabled={disabled}
                    >
                        <option value="higher_is_better">Higher is better</option>
                        <option value="lower_is_better">Lower is better</option>
                    </select>
                </PlatformBuilderField>
                {form.aggregation === "rate" ?
                    <>
                        <PlatformBuilderField label="Target minimum"><input className={PLATFORM_BUILDER_INPUT} value={form.target_min_rate} onChange={(e) => patchField("target_min_rate", e.target.value)} disabled={disabled} /></PlatformBuilderField>
                        <PlatformBuilderField label="Healthy minimum"><input className={PLATFORM_BUILDER_INPUT} value={form.healthy_min_rate} onChange={(e) => patchField("healthy_min_rate", e.target.value)} disabled={disabled} /></PlatformBuilderField>
                        <PlatformBuilderField label="Warning minimum"><input className={PLATFORM_BUILDER_INPUT} value={form.warning_min_rate} onChange={(e) => patchField("warning_min_rate", e.target.value)} disabled={disabled} /></PlatformBuilderField>
                    </>
                :   <>
                        <PlatformBuilderField label="Target maximum"><input className={PLATFORM_BUILDER_INPUT} value={form.target_max_count} onChange={(e) => patchField("target_max_count", e.target.value)} disabled={disabled} /></PlatformBuilderField>
                        <PlatformBuilderField label="Healthy maximum"><input className={PLATFORM_BUILDER_INPUT} value={form.healthy_max_count} onChange={(e) => patchField("healthy_max_count", e.target.value)} disabled={disabled} /></PlatformBuilderField>
                        <PlatformBuilderField label="Warning maximum"><input className={PLATFORM_BUILDER_INPUT} value={form.warning_max_count} onChange={(e) => patchField("warning_max_count", e.target.value)} disabled={disabled} /></PlatformBuilderField>
                    </>
                }
            </PlatformBuilderSection>
        </>
    );
}

function PreviewPanel({
    preview,
    previewLoading,
    previewError,
    form,
    adapters,
}: {
    preview: MetricEvaluationResult | null;
    previewLoading: boolean;
    previewError: string | null;
    form: MetricForm;
    adapters: MetricSourceAdapter[];
}) {
    const sourceLabel = adapters.find((a) => a.key === form.source_key)?.label ?? form.source_key;
    const noData = preview && preview.value == null;

    if (previewLoading) {
        return (
            <div className="rounded-lg border border-alloy-stone/20 bg-white p-4">
                <p className="text-sm text-alloy-midnight/55">Running live preview…</p>
            </div>
        );
    }

    if (previewError) {
        return (
            <PlatformBuilderCallout tone="warning">
                {previewError}
            </PlatformBuilderCallout>
        );
    }

    if (!preview) return null;

    return (
        <div className="rounded-lg border border-alloy-juniper/25 bg-alloy-juniper/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-alloy-juniper">Live preview</p>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-alloy-midnight">
                {noData ? "No data" : preview.formattedValue}
            </p>
            <p className="mt-1 text-sm text-alloy-midnight/60">
                Health: {preview.healthState === "unknown" && noData ? "Not enough data" : preview.healthState}
            </p>
            {noData ?
                <p className="mt-2 text-xs text-alloy-midnight/55">
                    No matching records found for the last {form.period_days} days. Check your data source or widen the time window.
                </p>
            :   null}
            <dl className="mt-3 grid gap-1 text-[11px] text-alloy-midnight/50">
                <div><dt className="inline font-semibold">Source: </dt><dd className="inline">{sourceLabel}</dd></div>
                <div><dt className="inline font-semibold">Period: </dt><dd className="inline">Rolling {form.period_days} days</dd></div>
                <div><dt className="inline font-semibold">Mode: </dt><dd className="inline">Live preview (builder only — publish then update live values for workspace display)</dd></div>
            </dl>
        </div>
    );
}

export default function MetricBuilderPanel({ canEdit }: Props) {
    const [items, setItems] = useState<MetricDefinitionRow[]>([]);
    const [adapters, setAdapters] = useState<MetricSourceAdapter[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [form, setForm] = useState<MetricForm>(EMPTY_FORM);
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [preview, setPreview] = useState<MetricEvaluationResult | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [action, setAction] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const selected = useMemo(() => items.find((i) => i.id === selectedId) ?? null, [items, selectedId]);
    const isGlobal = selected?.org_id == null;

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
        if (selected) setForm(rowToForm(selected));
    }, [selected]);

    const patchField = <K extends keyof MetricForm>(key: K, value: MetricForm[K]) => {
        setForm((f) => {
            const next = { ...f, [key]: value };
            if (createModalOpen && key === "label" && !showAdvanced) {
                next.key = slugifyMetricKey(String(value));
            }
            return next;
        });
    };

    const ensureOrgCopy = async (): Promise<MetricDefinitionRow | null> => {
        if (!selected || selected.org_id != null) return selected;
        const copied = await copyMetricToOrg(selected.id);
        if (!copied?.item) {
            setError("Could not copy template metric to your organization.");
            return null;
        }
        await load();
        const item = copied.item as MetricDefinitionRow;
        setSelectedId(item.id);
        return item;
    };

    const save = async (status: string, fromModal = false) => {
        if (!canEdit) return;
        setSaving(true);
        setAction(status === "active" ? "publish" : status === "archived" ? "archive" : "save");
        setError(null);
        try {
            let targetId = selectedId;
            if (isGlobal && selected) {
                const orgCopy = await ensureOrgCopy();
                if (!orgCopy) return;
                targetId = orgCopy.id;
            }

            const payload = formToPayload(form, status);
            const res =
                createModalOpen || !targetId
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
            setCreateModalOpen(false);
            await load();
            if (status === "active") await runMetricSnapshots({ metric_definition_ids: [data.item.id] });
            if (fromModal) setPreview(null);
        } finally {
            setSaving(false);
            setAction(null);
        }
    };

    const runPreview = async () => {
        if (!selectedId && !createModalOpen) return;
        setPreviewLoading(true);
        setPreviewError(null);
        setPreview(null);
        try {
            let id = selectedId;
            if (isGlobal && selected) {
                const orgCopy = await ensureOrgCopy();
                if (!orgCopy) return;
                id = orgCopy.id;
            }
            if (!id) {
                setPreviewError("Save this calculation first, then preview the result.");
                return;
            }
            const result = await previewMetricDefinition(id);
            if (!result) {
                setPreviewError("Preview could not run. Check the data source and try again.");
                return;
            }
            setPreview(result);
        } finally {
            setPreviewLoading(false);
        }
    };

    const openCreateModal = () => {
        setForm(EMPTY_FORM);
        setPreview(null);
        setPreviewError(null);
        setCreateModalOpen(true);
        setSelectedId(null);
    };

    const duplicate = () => {
        if (!selected || !canEdit) return;
        setForm({ ...rowToForm(selected), key: `${selected.key}_copy`, label: `${selected.label} (copy)` });
        setCreateModalOpen(true);
        setSelectedId(null);
    };

    return (
        <div data-metric-builder="true" className={`${PLATFORM_BUILDER_SHELL} p-4`}>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                <div>
                    <h3 className="text-sm font-semibold text-alloy-midnight">Calculations</h3>
                    <p className="text-xs text-alloy-midnight/55">Define what to measure, then choose how and where it appears.</p>
                </div>
                {canEdit ?
                    <PlatformBuilderButton variant="primary" onClick={openCreateModal}>
                        + New calculation
                    </PlatformBuilderButton>
                :   null}
            </div>

            {error ?
                <PlatformBuilderCallout tone="warning">{error}</PlatformBuilderCallout>
            :   null}

            <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
                <PlatformBuilderListPanel
                    title="Saved metrics"
                    hint="Select a metric to edit or preview."
                    emptyTitle="No calculations yet"
                    emptyHint="Create your first metric to start building Operational Intelligence."
                    loading={loading}
                    itemCount={items.length}
                >
                    {items.map((item) => {
                        const status = METRIC_STATUS_LABELS[item.status] ?? { label: item.status, tone: "neutral" as const };
                        return (
                            <PlatformBuilderListItem
                                key={item.id}
                                selected={selectedId === item.id}
                                onClick={() => {
                                    setSelectedId(item.id);
                                    setPreview(null);
                                    setPreviewError(null);
                                }}
                                title={item.label}
                                meta={item.category}
                                badges={
                                    <>
                                        <PlatformBuilderStatusBadge label={status.label} tone={status.tone} />
                                        {item.org_id == null ?
                                            <PlatformBuilderStatusBadge label="Template" tone="template" />
                                        :   null}
                                    </>
                                }
                            />
                        );
                    })}
                </PlatformBuilderListPanel>

                {selected ?
                    <div className="space-y-4">
                        {isGlobal ?
                            <PlatformBuilderCallout>
                                Template metric — saving creates a copy for your organization automatically.
                            </PlatformBuilderCallout>
                        :   null}

                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                className="text-xs font-semibold text-alloy-juniper underline-offset-2 hover:underline"
                                onClick={() => setShowAdvanced((v) => !v)}
                            >
                                {showAdvanced ? "Hide advanced settings" : "Show advanced settings"}
                            </button>
                        </div>

                        <MetricFormFields
                            form={form}
                            patchField={patchField}
                            adapters={adapters}
                            disabled={isGlobal}
                            showAdvanced={showAdvanced}
                        />

                        <div className="flex flex-wrap gap-2">
                            <PlatformBuilderButton loading={previewLoading} loadingLabel="Previewing…" onClick={() => void runPreview()}>
                                Preview live result
                            </PlatformBuilderButton>
                            {canEdit ?
                                <>
                                    <PlatformBuilderButton loading={saving && action === "save"} onClick={() => void save("draft")}>Save draft</PlatformBuilderButton>
                                    <PlatformBuilderButton variant="primary" loading={saving && action === "publish"} onClick={() => void save("active")}>Publish</PlatformBuilderButton>
                                    {selected.status === "active" ?
                                        <PlatformBuilderButton onClick={() => void save("draft")}>Unpublish</PlatformBuilderButton>
                                    :   null}
                                    <PlatformBuilderButton onClick={duplicate}>Duplicate</PlatformBuilderButton>
                                    {!isGlobal ?
                                        <PlatformBuilderButton variant="danger" loading={saving && action === "archive"} onClick={() => void save("archived")}>Archive</PlatformBuilderButton>
                                    :   null}
                                </>
                            :   null}
                        </div>

                        <PreviewPanel preview={preview} previewLoading={previewLoading} previewError={previewError} form={form} adapters={adapters} />
                    </div>
                :   !loading ?
                    <PlatformBuilderEmptyState
                        title="Select a calculation"
                        body="Choose a saved metric from the list, or create a new calculation to get started."
                        action={
                            canEdit ?
                                <PlatformBuilderButton variant="primary" onClick={openCreateModal}>+ New calculation</PlatformBuilderButton>
                            :   null
                        }
                    />
                :   null}
            </div>

            <PlatformBuilderModal
                open={createModalOpen}
                title="New calculation"
                subtitle="Start with a clear name and data source. You can choose how it appears after saving."
                onClose={() => setCreateModalOpen(false)}
                footer={
                    <>
                        <PlatformBuilderButton onClick={() => setCreateModalOpen(false)}>Cancel</PlatformBuilderButton>
                        <PlatformBuilderButton loading={saving && action === "save"} onClick={() => void save("draft", true)}>Save draft</PlatformBuilderButton>
                        <PlatformBuilderButton variant="primary" loading={saving && action === "publish"} onClick={() => void save("active", true)}>Publish</PlatformBuilderButton>
                    </>
                }
            >
                <div className="space-y-4">
                    <MetricFormFields form={form} patchField={patchField} adapters={adapters} disabled={false} showAdvanced={showAdvanced} />
                    <button type="button" className="text-xs font-semibold text-alloy-juniper" onClick={() => setShowAdvanced((v) => !v)}>
                        {showAdvanced ? "Hide internal key" : "Show internal key"}
                    </button>
                </div>
            </PlatformBuilderModal>
        </div>
    );
}
