"use client";

import { useCallback, useEffect, useState } from "react";
import {
    PLATFORM_BUILDER_BTN,
    PLATFORM_BUILDER_BTN_DANGER,
    PLATFORM_BUILDER_BTN_PRIMARY,
    PLATFORM_BUILDER_INPUT,
    PLATFORM_BUILDER_SELECT,
    PLATFORM_BUILDER_SHELL,
    PlatformBuilderField,
    PlatformBuilderSection,
} from "@/app/adminV2/settings/analytics/platformBuilderUi";
import { fetchMetricDefinitions, fetchMetricVisualizations } from "@/lib/metrics/platform/fetchMetricPlatform";
import { copyMetricToOrg, copyVisualizationToOrg } from "@/lib/metrics/platform/fetchMetricRender";
import type { MetricDefinitionRow, MetricVisualizationRow } from "@/lib/metrics/platform/types";

type Props = { canEdit: boolean };

const VIZ_TYPES = ["kpi_card", "trend_card", "chip", "sparkline", "line_chart", "comparison"] as const;

type VizForm = {
    metric_definition_id: string;
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
    const [isNew, setIsNew] = useState(false);

    const load = useCallback(async () => {
        const [viz, defs] = await Promise.all([fetchMetricVisualizations(), fetchMetricDefinitions()]);
        setItems((viz.items ?? []) as MetricVisualizationRow[]);
        setMetrics((defs.items ?? []) as MetricDefinitionRow[]);
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const selected = items.find((i) => i.id === selectedId) ?? null;
    const isGlobal = selected?.org_id == null && !isNew;

    useEffect(() => {
        if (!selected || isNew) return;
        const display = selected.display_config as Record<string, unknown>;
        const style = selected.style_config as Record<string, unknown>;
        setForm({
            metric_definition_id: selected.metric_definition_id,
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
    }, [selected, isNew]);

    const payload = (status: string) => ({
        metric_definition_id: form.metric_definition_id,
        key: form.key.trim(),
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
        },
        status,
        version: 1,
    });

    const save = async (status: string) => {
        if (!canEdit) return;

        let targetId = selectedId;
        if (isGlobal && selected && !isNew) {
            const metric = metrics.find((m) => m.key === items.find((i) => i.id === selected.id)?.key && m.org_id);
            let orgMetricId = metric?.id;
            if (!orgMetricId) {
                const globalMetricId = selected.metric_definition_id;
                const copied = await copyMetricToOrg(globalMetricId);
                orgMetricId = (copied?.item as MetricDefinitionRow | undefined)?.id;
            }
            if (!orgMetricId) return;
            const copiedViz = await copyVisualizationToOrg(selected.id, orgMetricId);
            if (!copiedViz?.item) return;
            targetId = (copiedViz.item as MetricVisualizationRow).id;
            setSelectedId(targetId);
            setIsNew(false);
        }

        const res =
            isNew || !targetId
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
            setIsNew(false);
            await load();
        }
    };

    const duplicate = () => {
        if (!selected || !canEdit) return;
        setIsNew(true);
        setSelectedId(null);
        setForm((f) => ({
            ...f,
            key: `${selected.key}_copy`,
            label: `${selected.label} (copy)`,
        }));
    };

    return (
        <div className={`${PLATFORM_BUILDER_SHELL} p-4`} data-visualization-builder="true">
            <div className="mb-3 flex justify-between gap-2">
                <div>
                    <h3 className="text-sm font-semibold text-alloy-midnight">Visualizations</h3>
                    <p className="text-xs text-alloy-midnight/50">How metrics appear — separate from definition and placement.</p>
                </div>
                {canEdit ?
                    <button type="button" className={PLATFORM_BUILDER_BTN_PRIMARY} onClick={() => { setIsNew(true); setSelectedId(null); setForm(EMPTY); }}>+ New</button>
                :   null}
            </div>

            <div className="grid gap-4 lg:grid-cols-[200px_1fr]">
                <ul className="space-y-0.5 rounded-lg border border-alloy-stone/12 p-2">
                    {items.map((item) => (
                        <li key={item.id}>
                            <button type="button" onClick={() => { setSelectedId(item.id); setIsNew(false); }} className={`w-full rounded-md px-2 py-1.5 text-left text-sm ${selectedId === item.id && !isNew ? "bg-alloy-midnight/8 font-semibold" : ""}`}>
                                {item.label}
                                <span className="block text-[10px] text-alloy-midnight/40">{item.visualization_type} · {item.status}</span>
                            </button>
                        </li>
                    ))}
                </ul>

                {(selected || isNew) ?
                    <div className="space-y-4">
                        <PlatformBuilderSection title="Visualization">
                            <PlatformBuilderField label="Metric">
                                <select className={PLATFORM_BUILDER_SELECT} value={form.metric_definition_id} onChange={(e) => setForm((f) => ({ ...f, metric_definition_id: e.target.value }))} disabled={isGlobal}>
                                    <option value="">Select metric…</option>
                                    {metrics.map((m) => (
                                        <option key={m.id} value={m.id}>{m.label}</option>
                                    ))}
                                </select>
                            </PlatformBuilderField>
                            <PlatformBuilderField label="Key">
                                <input className={PLATFORM_BUILDER_INPUT} value={form.key} disabled={!isNew} onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))} />
                            </PlatformBuilderField>
                            <PlatformBuilderField label="Label">
                                <input className={PLATFORM_BUILDER_INPUT} value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} disabled={isGlobal} />
                            </PlatformBuilderField>
                            <PlatformBuilderField label="Type">
                                <select className={PLATFORM_BUILDER_SELECT} value={form.visualization_type} onChange={(e) => setForm((f) => ({ ...f, visualization_type: e.target.value }))} disabled={isGlobal}>
                                    {VIZ_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
                                </select>
                            </PlatformBuilderField>
                            <PlatformBuilderField label="Title override">
                                <input className={PLATFORM_BUILDER_INPUT} value={form.label_override} onChange={(e) => setForm((f) => ({ ...f, label_override: e.target.value }))} disabled={isGlobal} />
                            </PlatformBuilderField>
                            <PlatformBuilderField label="Subtitle">
                                <input className={PLATFORM_BUILDER_INPUT} value={form.subtitle} onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))} disabled={isGlobal} />
                            </PlatformBuilderField>
                            <PlatformBuilderField label="Accent">
                                <select className={PLATFORM_BUILDER_SELECT} value={form.accent} onChange={(e) => setForm((f) => ({ ...f, accent: e.target.value }))} disabled={isGlobal}>
                                    {["enrollment", "operational", "forms", "communications"].map((a) => <option key={a} value={a}>{a}</option>)}
                                </select>
                            </PlatformBuilderField>
                            <PlatformBuilderField label="Icon">
                                <input className={PLATFORM_BUILDER_INPUT} value={form.icon} onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))} disabled={isGlobal} />
                            </PlatformBuilderField>
                        </PlatformBuilderSection>
                        {canEdit ?
                            <div className="flex flex-wrap gap-2">
                                {isGlobal ?
                                    <p className="w-full text-xs text-alloy-midnight/50">Global template — saving creates an org copy automatically.</p>
                                :   null}
                                <button type="button" className={PLATFORM_BUILDER_BTN} onClick={() => void save("draft")} disabled={isGlobal && isNew}>Save draft</button>
                                <button type="button" className={PLATFORM_BUILDER_BTN_PRIMARY} onClick={() => void save("active")}>Publish</button>
                                {selected?.status === "active" ?
                                    <button type="button" className={PLATFORM_BUILDER_BTN} onClick={() => void save("draft")}>Unpublish</button>
                                :   null}
                                {selected && !isNew ?
                                    <>
                                        <button type="button" className={PLATFORM_BUILDER_BTN} onClick={duplicate}>Duplicate</button>
                                        <button type="button" className={PLATFORM_BUILDER_BTN_DANGER} onClick={() => void save("archived")} disabled={isGlobal}>Archive</button>
                                    </>
                                :   null}
                            </div>
                        :   null}
                    </div>
                :   <p className="text-sm text-alloy-midnight/45">Select or create a visualization.</p>}
            </div>
        </div>
    );
}
