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
import { BuilderIconPicker } from "@/app/adminV2/settings/analytics/BuilderIconPicker";
import { VisualizationStylePreview } from "@/app/adminV2/settings/analytics/VisualizationStylePreview";
import {
    ACCENT_OPTIONS,
    AVAILABLE_VIZ_TYPES,
    METRIC_STATUS_LABELS,
    MULTI_METRIC_VIZ_TYPES,
    slugifyMetricKey,
    TREND_BASED_VIZ_TYPES,
    VIZ_TYPE_HINTS,
    VIZ_TYPE_LABELS,
} from "@/app/adminV2/settings/analytics/platformBuilderLabels";
import {
    fetchMetricDefinitions,
    fetchMetricPlacementsList,
    fetchMetricVisualizations,
} from "@/lib/metrics/platform/fetchMetricPlatform";
import { copyMetricToOrg, copyVisualizationToOrg } from "@/lib/metrics/platform/fetchMetricRender";
import { resolveWriteTarget } from "@/lib/metrics/platform/metricWritePlan";
import type { MetricDefinitionRow, MetricPlacementRow, MetricVisualizationRow } from "@/lib/metrics/platform/types";

type Props = { canEdit: boolean };

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
    const [placements, setPlacements] = useState<MetricPlacementRow[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [form, setForm] = useState<VizForm>(EMPTY);
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [workingId, setWorkingId] = useState<string | null>(null);
    const [draftSaved, setDraftSaved] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveAction, setSaveAction] = useState<"draft" | "active" | null>(null);

    const load = useCallback(async () => {
        const [viz, defs, pl] = await Promise.all([
            fetchMetricVisualizations(),
            fetchMetricDefinitions(),
            fetchMetricPlacementsList(),
        ]);
        setItems((viz.items ?? []) as MetricVisualizationRow[]);
        setMetrics((defs.items ?? []) as MetricDefinitionRow[]);
        setPlacements((pl.items ?? []) as MetricPlacementRow[]);
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const selected = items.find((i) => i.id === selectedId) ?? null;
    const isGlobal = selected?.org_id == null && !createModalOpen;
    const supportsMulti = MULTI_METRIC_VIZ_TYPES.has(form.visualization_type);
    const isTrendBased = TREND_BASED_VIZ_TYPES.has(form.visualization_type);

    const placementCount = useCallback(
        (vizId: string) => placements.filter((p) => p.visualization_id === vizId && p.status !== "archived").length,
        [placements],
    );

    const groupedStyles = useMemo(() => {
        const groups = new Map<string, { metricLabel: string; vizes: MetricVisualizationRow[] }>();
        for (const viz of items) {
            const metricLabel = metrics.find((m) => m.id === viz.metric_definition_id)?.label ?? "Unassigned metric";
            const existing = groups.get(viz.metric_definition_id);
            if (existing) existing.vizes.push(viz);
            else groups.set(viz.metric_definition_id, { metricLabel, vizes: [viz] });
        }
        return Array.from(groups.values()).sort((a, b) => a.metricLabel.localeCompare(b.metricLabel));
    }, [items, metrics]);
    const primaryMetric = metrics.find((m) => m.id === form.metric_definition_id);
    const extraLabels = useMemo(
        () => form.additional_metric_ids.map((id) => metrics.find((m) => m.id === id)?.label).filter(Boolean) as string[],
        [form.additional_metric_ids, metrics]
    );

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

    const save = async (status: "draft" | "active", fromModal = false) => {
        if (!canEdit || saving) return;
        setSaving(true);
        setSaveAction(status);
        try {
            let targetId = createModalOpen ? workingId : selectedId;
            if (isGlobal && selected && !createModalOpen && !workingId) {
                // Copy-on-edit: clone template metric + visualization once, then edit the copy.
                const copiedMetric = await copyMetricToOrg(selected.metric_definition_id);
                const orgMetricId = (copiedMetric?.item as MetricDefinitionRow | undefined)?.id;
                if (!orgMetricId) return;
                const copiedViz = await copyVisualizationToOrg(selected.id, orgMetricId);
                if (!copiedViz?.item) return;
                targetId = (copiedViz.item as MetricVisualizationRow).id;
                setSelectedId(targetId);
                setWorkingId(targetId);
            }

            const target = resolveWriteTarget(targetId);
            const res =
                target.method === "POST"
                    ? await fetch("/api/admin/analytics/visualizations", {
                          method: "POST",
                          credentials: "include",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify(payload(status)),
                      })
                    : await fetch(`/api/admin/analytics/visualizations/${target.id}`, {
                          method: "PATCH",
                          credentials: "include",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify(payload(status)),
                      });
            if (res.ok) {
                const data = (await res.json()) as { item: MetricVisualizationRow };
                setSelectedId(data.item.id);
                setWorkingId(data.item.id);
                await load();
                if (fromModal && status === "active") setCreateModalOpen(false);
                if (status === "draft") setDraftSaved(true);
            }
        } finally {
            setSaving(false);
            setSaveAction(null);
        }
    };

    const cardSetupFields = (disabled: boolean) => (
        <PlatformBuilderSection title="Card setup" compact hint={VIZ_TYPE_HINTS[form.visualization_type]}>
            <PlatformBuilderField label="Card title">
                <input className={PLATFORM_BUILDER_INPUT} value={form.label} disabled={disabled} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value, key: createModalOpen ? slugifyMetricKey(e.target.value) : f.key }))} />
            </PlatformBuilderField>
            <PlatformBuilderField label="Display style">
                <select className={PLATFORM_BUILDER_SELECT} value={form.visualization_type} disabled={disabled} onChange={(e) => setForm((f) => ({ ...f, visualization_type: e.target.value }))}>
                    {AVAILABLE_VIZ_TYPES.map((t) => (
                        <option key={t} value={t}>{VIZ_TYPE_LABELS[t] ?? t}</option>
                    ))}
                </select>
            </PlatformBuilderField>
            <PlatformBuilderField label="Title override">
                <input className={PLATFORM_BUILDER_INPUT} value={form.label_override} disabled={disabled} onChange={(e) => setForm((f) => ({ ...f, label_override: e.target.value }))} />
            </PlatformBuilderField>
            <PlatformBuilderField label="Subtitle">
                <input className={PLATFORM_BUILDER_INPUT} value={form.subtitle} disabled={disabled} onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))} />
            </PlatformBuilderField>
        </PlatformBuilderSection>
    );

    const metricsFields = (disabled: boolean) => (
        <PlatformBuilderSection title="Metrics shown" compact>
            <PlatformBuilderField label="Primary metric">
                <select className={PLATFORM_BUILDER_SELECT} value={form.metric_definition_id} disabled={disabled} onChange={(e) => setForm((f) => ({ ...f, metric_definition_id: e.target.value }))}>
                    <option value="">Select…</option>
                    {metrics.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
            </PlatformBuilderField>
            {supportsMulti ?
                <div className="sm:col-span-2">
                    <PlatformBuilderField label="Additional metrics">
                        <select multiple className={`${PLATFORM_BUILDER_SELECT} min-h-[72px]`} value={form.additional_metric_ids} disabled={disabled} onChange={(e) => setForm((f) => ({ ...f, additional_metric_ids: Array.from(e.target.selectedOptions).map((o) => o.value) }))}>
                            {metrics.filter((m) => m.id !== form.metric_definition_id && m.status === "active").map((m) => (
                                <option key={m.id} value={m.id}>{m.label}</option>
                            ))}
                        </select>
                    </PlatformBuilderField>
                </div>
            :   null}
        </PlatformBuilderSection>
    );

    const visualFields = (disabled: boolean) => (
        <PlatformBuilderSection title="Visual treatment" compact>
            <div className="sm:col-span-2">
                <PlatformBuilderField label="Accent color">
                    <div className="mt-1 flex flex-wrap gap-1.5">
                        {ACCENT_OPTIONS.map((accent) => (
                            <button key={accent.key} type="button" disabled={disabled} title={accent.label} onClick={() => setForm((f) => ({ ...f, accent: accent.key }))} className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs ${form.accent === accent.key ? `border-alloy-juniper/40 ring-2 ${accent.ring}` : "border-alloy-stone/25"}`}>
                                <span className={`h-3.5 w-3.5 rounded-full ${accent.swatch}`} />
                                {accent.label}
                            </button>
                        ))}
                    </div>
                </PlatformBuilderField>
            </div>
            <div className="sm:col-span-2">
                <PlatformBuilderField
                    label="Icon"
                    hint={isTrendBased ? "Trend direction is calculated automatically from metric history. The icon only represents the category." : "Represents the metric category or style."}
                >
                    <BuilderIconPicker value={form.icon} onChange={(icon) => setForm((f) => ({ ...f, icon }))} disabled={disabled} />
                </PlatformBuilderField>
            </div>
            {showAdvanced ?
                <PlatformBuilderField label="Internal key">
                    <input className={PLATFORM_BUILDER_INPUT} value={form.key} disabled={disabled && !createModalOpen} onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))} />
                </PlatformBuilderField>
            :   null}
        </PlatformBuilderSection>
    );

    const formBody = (disabled: boolean) => (
        <div className="space-y-2">
            {cardSetupFields(disabled)}
            {metricsFields(disabled)}
            {visualFields(disabled)}
        </div>
    );

    return (
        <div className={`${PLATFORM_BUILDER_SHELL} p-4`} data-visualization-builder="true">
            <div className="mb-3 flex justify-between gap-2">
                <div>
                    <h3 className="text-sm font-semibold text-alloy-midnight">Display styles</h3>
                    <p className="text-xs text-alloy-midnight/55">How a calculation looks — placement is configured separately.</p>
                </div>
                {canEdit ?
                    <PlatformBuilderButton variant="primary" onClick={() => { setForm(EMPTY); setWorkingId(null); setDraftSaved(false); setCreateModalOpen(true); setSelectedId(null); }}>+ New display style</PlatformBuilderButton>
                :   null}
            </div>

            <div className="grid gap-3 lg:grid-cols-[240px_1fr]">
                <PlatformBuilderListPanel title="Saved styles" hint="Grouped by the metric they show." emptyTitle="No styles yet" emptyHint="Create a KPI card or scorecard." loading={false} itemCount={items.length}>
                    {groupedStyles.map((group) => (
                        <li key={group.metricLabel} className="mb-1">
                            <p className="px-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">{group.metricLabel}</p>
                            <ul className="space-y-1">
                                {group.vizes.map((item) => {
                                    const count = placementCount(item.id);
                                    return (
                                        <PlatformBuilderListItem
                                            key={item.id}
                                            selected={selectedId === item.id}
                                            onClick={() => setSelectedId(item.id)}
                                            title={item.label}
                                            meta={`${VIZ_TYPE_LABELS[item.visualization_type] ?? item.visualization_type} · ${count} place${count === 1 ? "" : "s"}`}
                                            badges={<PlatformBuilderStatusBadge label={METRIC_STATUS_LABELS[item.status]?.label ?? item.status} tone={METRIC_STATUS_LABELS[item.status]?.tone ?? "neutral"} />}
                                        />
                                    );
                                })}
                            </ul>
                        </li>
                    ))}
                </PlatformBuilderListPanel>

                {selected ?
                    <div className="grid gap-3 xl:grid-cols-[1fr_220px]">
                        <div className="space-y-2">
                            {isGlobal ? <PlatformBuilderCallout>Template — saving creates an org copy.</PlatformBuilderCallout> : null}
                            <button type="button" className="text-[11px] font-semibold text-alloy-juniper" onClick={() => setShowAdvanced((v) => !v)}>{showAdvanced ? "Hide advanced" : "Advanced"}</button>
                            {formBody(isGlobal)}
                            {canEdit ?
                                <div className="flex flex-wrap items-center gap-2">
                                    <PlatformBuilderButton loading={saving && saveAction === "draft"} disabled={saving} onClick={() => void save("draft")}>Save draft</PlatformBuilderButton>
                                    <PlatformBuilderButton variant="primary" loading={saving && saveAction === "active"} disabled={saving} onClick={() => void save("active")}>Publish</PlatformBuilderButton>
                                    {draftSaved ? <span className="text-[11px] font-medium text-alloy-juniper">Saved as draft</span> : null}
                                </div>
                            :   null}
                        </div>
                        <VisualizationStylePreview form={form} primaryMetric={primaryMetric} extraMetricLabels={extraLabels} />
                    </div>
                :   <PlatformBuilderEmptyState title="Select a display style" body="Pick a saved style or create a new one." />}
            </div>

            <PlatformBuilderModal open={createModalOpen} title="New display style" subtitle="Card setup and visual treatment." onClose={() => setCreateModalOpen(false)} footer={<>{draftSaved ? <span className="mr-auto text-[11px] font-medium text-alloy-juniper">Saved as draft</span> : null}<PlatformBuilderButton disabled={saving} onClick={() => setCreateModalOpen(false)}>Cancel</PlatformBuilderButton><PlatformBuilderButton loading={saving && saveAction === "draft"} disabled={saving} onClick={() => void save("draft", true)}>Save draft</PlatformBuilderButton><PlatformBuilderButton variant="primary" loading={saving && saveAction === "active"} disabled={saving} onClick={() => void save("active", true)}>Publish</PlatformBuilderButton></>}>
                <div className="grid gap-3 lg:grid-cols-[1fr_200px]">
                    {formBody(false)}
                    <VisualizationStylePreview form={form} primaryMetric={primaryMetric} extraMetricLabels={extraLabels} />
                </div>
            </PlatformBuilderModal>
        </div>
    );
}
