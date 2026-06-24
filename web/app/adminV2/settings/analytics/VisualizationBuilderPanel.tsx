"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    PLATFORM_BUILDER_INPUT,
    PLATFORM_BUILDER_SELECT,
    PLATFORM_BUILDER_SHELL,
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
    ACCENT_OPTIONS,
    METRIC_STATUS_LABELS,
    MULTI_METRIC_VIZ_TYPES,
    slugifyMetricKey,
    VIZ_TYPE_HINTS,
    VIZ_TYPE_LABELS,
} from "@/app/adminV2/settings/analytics/platformBuilderLabels";
import { fetchMetricDefinitions, fetchMetricVisualizations } from "@/lib/metrics/platform/fetchMetricPlatform";
import { copyMetricToOrg, copyVisualizationToOrg } from "@/lib/metrics/platform/fetchMetricRender";
import { MetricKpiCard } from "@/components/admin/metrics/MetricKpiCard";
import type { MetricDefinitionRow, MetricVisualizationRow } from "@/lib/metrics/platform/types";

type Props = { canEdit: boolean };

const VIZ_TYPES = ["kpi_card", "trend_card", "chip", "sparkline", "line_chart", "comparison", "scorecard"] as const;

type VizForm = {
    metric_definition_id: string;
    additional_metric_ids: string[];
    key: string;
    label: string;
    visualization_type: string;
    label_override: string;
    subtitle: string;
    accent: string;
    icon: string;
    compact: boolean;
    show_threshold: boolean;
    show_trend: boolean;
};

const EMPTY: VizForm = {
    metric_definition_id: "",
    additional_metric_ids: [],
    key: "",
    label: "",
    visualization_type: "kpi_card",
    label_override: "",
    subtitle: "",
    accent: "enrollment",
    icon: "",
    compact: false,
    show_threshold: true,
    show_trend: false,
};

export default function VisualizationBuilderPanel({ canEdit }: Props) {
    const [items, setItems] = useState<MetricVisualizationRow[]>([]);
    const [metrics, setMetrics] = useState<MetricDefinitionRow[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [form, setForm] = useState<VizForm>(EMPTY);
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        const [viz, defs] = await Promise.all([fetchMetricVisualizations(), fetchMetricDefinitions()]);
        setItems((viz.items ?? []) as MetricVisualizationRow[]);
        setMetrics((defs.items ?? []) as MetricDefinitionRow[]);
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const selected = items.find((i) => i.id === selectedId) ?? null;
    const isGlobal = selected?.org_id == null && !createModalOpen;
    const supportsMulti = MULTI_METRIC_VIZ_TYPES.has(form.visualization_type);
    const primaryMetric = metrics.find((m) => m.id === form.metric_definition_id);

    useEffect(() => {
        if (!selected || createModalOpen) return;
        const display = selected.display_config as Record<string, unknown>;
        const style = selected.style_config as Record<string, unknown>;
        setForm({
            metric_definition_id: selected.metric_definition_id,
            additional_metric_ids: Array.isArray(display.additionalMetricDefinitionIds)
                ? (display.additionalMetricDefinitionIds as string[])
                : [],
            key: selected.key,
            label: selected.label,
            visualization_type: selected.visualization_type,
            label_override: String(display.labelOverride ?? ""),
            subtitle: String(display.subtitle ?? ""),
            accent: String(style.accent ?? "enrollment"),
            icon: String(style.icon ?? ""),
            compact: Boolean(display.compact),
            show_threshold: display.showThreshold !== false,
            show_trend: Boolean(display.showSparkline ?? display.showTrend),
        });
    }, [selected, createModalOpen]);

    const payload = (status: string) => ({
        metric_definition_id: form.metric_definition_id,
        key: form.key.trim() || slugifyMetricKey(form.label),
        label: form.label.trim(),
        visualization_type: form.visualization_type,
        style_config: { version: 1, accent: form.accent, icon: form.icon || undefined },
        display_config: {
            version: 1,
            labelOverride: form.label_override || undefined,
            subtitle: form.subtitle || undefined,
            compact: form.compact,
            showThreshold: form.show_threshold,
            showSparkline: form.show_trend,
            showTrend: form.show_trend,
            additionalMetricDefinitionIds:
                supportsMulti && form.additional_metric_ids.length ? form.additional_metric_ids : undefined,
        },
        status,
        version: 1,
    });

    const save = async (status: string, fromModal = false) => {
        if (!canEdit) return;
        setSaving(true);
        let targetId = selectedId;
        if (isGlobal && selected && !createModalOpen) {
            const metric = metrics.find((m) => m.key === items.find((i) => i.id === selected.id)?.key && m.org_id);
            let orgMetricId = metric?.id;
            if (!orgMetricId) {
                const copied = await copyMetricToOrg(selected.metric_definition_id);
                orgMetricId = (copied?.item as MetricDefinitionRow | undefined)?.id;
            }
            if (!orgMetricId) return;
            const copiedViz = await copyVisualizationToOrg(selected.id, orgMetricId);
            if (!copiedViz?.item) return;
            targetId = (copiedViz.item as MetricVisualizationRow).id;
            setSelectedId(targetId);
        }

        const res =
            createModalOpen || !targetId
                ? await fetch("/api/admin/analytics/visualizations", {
                      method: "POST",
                      credentials: "include",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(payload(status)),
                  })
                : await fetch(`/api/admin/analytics/visualizations/${targetId}`, {
                      method: "PATCH",
                      credentials: "include",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(payload(status)),
                  });
        if (res.ok) {
            const data = (await res.json()) as { item: MetricVisualizationRow };
            setSelectedId(data.item.id);
            setCreateModalOpen(false);
            await load();
        }
        setSaving(false);
        if (fromModal) setCreateModalOpen(false);
    };

    const formFields = (disabled: boolean) => (
        <>
            <PlatformBuilderSection
                title="Display style"
                hint={VIZ_TYPE_HINTS[form.visualization_type] ?? "How this metric appears to operators."}
            >
                <PlatformBuilderField label="Card title">
                    <input
                        className={PLATFORM_BUILDER_INPUT}
                        value={form.label}
                        onChange={(e) =>
                            setForm((f) => ({
                                ...f,
                                label: e.target.value,
                                key: createModalOpen ? slugifyMetricKey(e.target.value) : f.key,
                            }))
                        }
                        disabled={disabled}
                        placeholder="Tour Conversion KPI"
                    />
                </PlatformBuilderField>
                <PlatformBuilderField label="Style">
                    <select
                        className={PLATFORM_BUILDER_SELECT}
                        value={form.visualization_type}
                        onChange={(e) => setForm((f) => ({ ...f, visualization_type: e.target.value }))}
                        disabled={disabled}
                    >
                        {VIZ_TYPES.map((t) => (
                            <option key={t} value={t}>{VIZ_TYPE_LABELS[t] ?? t}</option>
                        ))}
                    </select>
                </PlatformBuilderField>
                <PlatformBuilderField label="Primary metric" hint="The main calculation this card shows.">
                    <select
                        className={PLATFORM_BUILDER_SELECT}
                        value={form.metric_definition_id}
                        onChange={(e) => setForm((f) => ({ ...f, metric_definition_id: e.target.value }))}
                        disabled={disabled}
                    >
                        <option value="">Select a calculation…</option>
                        {metrics.map((m) => (
                            <option key={m.id} value={m.id}>{m.label}</option>
                        ))}
                    </select>
                </PlatformBuilderField>
                {supportsMulti ?
                    <div className="sm:col-span-2">
                        <PlatformBuilderField label="Additional metrics" hint="Optional — show related metrics in the same scorecard.">
                            <select
                                multiple
                                className={`${PLATFORM_BUILDER_SELECT} min-h-[88px]`}
                                value={form.additional_metric_ids}
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        additional_metric_ids: Array.from(e.target.selectedOptions).map((o) => o.value),
                                    }))
                                }
                                disabled={disabled}
                            >
                                {metrics
                                    .filter((m) => m.id !== form.metric_definition_id && m.status === "active")
                                    .map((m) => (
                                        <option key={m.id} value={m.id}>{m.label}</option>
                                    ))}
                            </select>
                        </PlatformBuilderField>
                    </div>
                :   null}
                <PlatformBuilderField label="Card title override">
                    <input className={PLATFORM_BUILDER_INPUT} value={form.label_override} onChange={(e) => setForm((f) => ({ ...f, label_override: e.target.value }))} disabled={disabled} />
                </PlatformBuilderField>
                <PlatformBuilderField label="Subtitle">
                    <input className={PLATFORM_BUILDER_INPUT} value={form.subtitle} onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))} disabled={disabled} />
                </PlatformBuilderField>
                <PlatformBuilderField label="Accent color">
                    <div className="mt-1 flex flex-wrap gap-2">
                        {ACCENT_OPTIONS.map((accent) => (
                            <button
                                key={accent.key}
                                type="button"
                                disabled={disabled}
                                title={accent.label}
                                onClick={() => setForm((f) => ({ ...f, accent: accent.key }))}
                                className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs ${
                                    form.accent === accent.key
                                        ? `border-alloy-juniper/40 ring-2 ${accent.ring}`
                                        : "border-alloy-stone/25"
                                }`}
                            >
                                <span className={`h-4 w-4 rounded-full ${accent.swatch}`} />
                                {accent.label}
                            </button>
                        ))}
                    </div>
                </PlatformBuilderField>
                <PlatformBuilderField label="Icon (optional)">
                    <input className={PLATFORM_BUILDER_INPUT} value={form.icon} onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))} disabled={disabled} placeholder="trending_up" />
                </PlatformBuilderField>
                {showAdvanced ?
                    <PlatformBuilderField label="Internal key">
                        <input className={PLATFORM_BUILDER_INPUT} value={form.key} onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))} disabled={disabled && !createModalOpen} />
                    </PlatformBuilderField>
                :   null}
            </PlatformBuilderSection>

            <PlatformBuilderCallout>
                After publishing, open <strong>Where it appears</strong> to place this card on Operational Intelligence, workspace headers, or work unit headers.
            </PlatformBuilderCallout>
        </>
    );

    const previewTitle = form.label_override || form.label || primaryMetric?.label || "Preview";
    const extraLabels = form.additional_metric_ids
        .map((id) => metrics.find((m) => m.id === id)?.label)
        .filter(Boolean);

    return (
        <div className={`${PLATFORM_BUILDER_SHELL} p-4`} data-visualization-builder="true">
            <div className="mb-4 flex justify-between gap-2">
                <div>
                    <h3 className="text-sm font-semibold text-alloy-midnight">Display styles</h3>
                    <p className="text-xs text-alloy-midnight/55">Choose how a calculation appears — separate from where it is placed.</p>
                </div>
                {canEdit ?
                    <PlatformBuilderButton variant="primary" onClick={() => { setForm(EMPTY); setCreateModalOpen(true); setSelectedId(null); }}>
                        + New display style
                    </PlatformBuilderButton>
                :   null}
            </div>

            <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
                <PlatformBuilderListPanel
                    title="Saved display styles"
                    hint="Select a style to edit or preview."
                    emptyTitle="No display styles yet"
                    emptyHint="Create a KPI card or scorecard for one of your calculations."
                    loading={false}
                    itemCount={items.length}
                >
                    {items.map((item) => (
                        <PlatformBuilderListItem
                            key={item.id}
                            selected={selectedId === item.id}
                            onClick={() => setSelectedId(item.id)}
                            title={item.label}
                            meta={VIZ_TYPE_LABELS[item.visualization_type] ?? item.visualization_type}
                            badges={
                                <PlatformBuilderStatusBadge
                                    label={METRIC_STATUS_LABELS[item.status]?.label ?? item.status}
                                    tone={METRIC_STATUS_LABELS[item.status]?.tone ?? "neutral"}
                                />
                            }
                        />
                    ))}
                </PlatformBuilderListPanel>

                {selected ?
                    <div className="space-y-4">
                        {isGlobal ?
                            <PlatformBuilderCallout>Template display style — saving creates an org copy automatically.</PlatformBuilderCallout>
                        :   null}
                        <button type="button" className="text-xs font-semibold text-alloy-juniper" onClick={() => setShowAdvanced((v) => !v)}>
                            {showAdvanced ? "Hide advanced settings" : "Show advanced settings"}
                        </button>
                        {formFields(isGlobal)}
                        <div className="rounded-lg border border-alloy-stone/15 bg-alloy-stone/[0.02] p-3">
                            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-alloy-midnight/50">Preview</p>
                            <MetricKpiCard label={previewTitle} value="—" status="unknown" accent={form.accent} />
                            {extraLabels.length ?
                                <ul className="mt-2 space-y-1 text-xs text-alloy-midnight/55">
                                    {extraLabels.map((label) => (
                                        <li key={label}>+ {label}</li>
                                    ))}
                                </ul>
                            :   null}
                        </div>
                        {canEdit ?
                            <div className="flex flex-wrap gap-2">
                                <PlatformBuilderButton loading={saving} onClick={() => void save("draft")}>Save draft</PlatformBuilderButton>
                                <PlatformBuilderButton variant="primary" loading={saving} onClick={() => void save("active")}>Publish</PlatformBuilderButton>
                            </div>
                        :   null}
                    </div>
                :   <PlatformBuilderEmptyState title="Select a display style" body="Pick a saved style or create a new one." />}
            </div>

            <PlatformBuilderModal
                open={createModalOpen}
                title="New display style"
                subtitle="Choose the calculation and card style operators will see."
                onClose={() => setCreateModalOpen(false)}
                footer={
                    <>
                        <PlatformBuilderButton onClick={() => setCreateModalOpen(false)}>Cancel</PlatformBuilderButton>
                        <PlatformBuilderButton variant="primary" loading={saving} onClick={() => void save("active", true)}>Publish</PlatformBuilderButton>
                    </>
                }
            >
                {formFields(false)}
            </PlatformBuilderModal>
        </div>
    );
}
