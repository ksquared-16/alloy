"use client";

import { useCallback, useEffect, useState } from "react";
import {
    PLATFORM_BUILDER_BTN,
    PLATFORM_BUILDER_BTN_PRIMARY,
    PLATFORM_BUILDER_INPUT,
    PLATFORM_BUILDER_SELECT,
    PLATFORM_BUILDER_SHELL,
    PlatformBuilderField,
    PlatformBuilderSection,
} from "@/app/adminV2/settings/analytics/platformBuilderUi";
import { fetchMetricDefinitions } from "@/lib/metrics/platform/fetchMetricPlatform";
import type { MetricDefinitionRow, MetricRollupRow } from "@/lib/metrics/platform/types";

type Props = { canEdit: boolean };

type RollupForm = {
    key: string;
    label: string;
    rollup_type: string;
    metric_ids: string[];
    weights: string;
};

const EMPTY: RollupForm = { key: "", label: "", rollup_type: "health_score", metric_ids: [], weights: "" };

export default function RollupBuilderPanel({ canEdit }: Props) {
    const [items, setItems] = useState<MetricRollupRow[]>([]);
    const [metrics, setMetrics] = useState<MetricDefinitionRow[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [form, setForm] = useState<RollupForm>(EMPTY);
    const [isNew, setIsNew] = useState(false);

    const load = useCallback(async () => {
        const [rollups, defs] = await Promise.all([
            fetch("/api/admin/analytics/rollups", { credentials: "include" }).then((r) => r.json()),
            fetchMetricDefinitions(),
        ]);
        setItems((rollups.items ?? []) as MetricRollupRow[]);
        setMetrics((defs.items ?? []) as MetricDefinitionRow[]);
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const selected = items.find((i) => i.id === selectedId) ?? null;

    useEffect(() => {
        if (!selected || isNew) return;
        const cfg = selected.child_metric_config as { metrics?: { metricDefinitionId: string; weight?: number }[] };
        setForm({
            key: selected.key,
            label: selected.label,
            rollup_type: selected.rollup_type,
            metric_ids: (cfg.metrics ?? []).map((m) => m.metricDefinitionId),
            weights: (cfg.metrics ?? []).map((m) => String(m.weight ?? 1)).join(", "),
        });
    }, [selected, isNew]);

    const payload = (status: string) => {
        const weights = form.weights.split(",").map((w) => parseFloat(w.trim()) || 1);
        return {
            key: form.key.trim(),
            label: form.label.trim(),
            rollup_type: form.rollup_type,
            child_metric_config: {
                version: 1,
                metrics: form.metric_ids.map((id, i) => ({
                    metricDefinitionId: id,
                    weight: weights[i] ?? 1,
                })),
            },
            context_scope: "org",
            status,
            version: 1,
        };
    };

    const save = async (status: string) => {
        if (!canEdit) return;
        const res =
            isNew || !selectedId
                ? await fetch("/api/admin/analytics/rollups", {
                      method: "POST",
                      credentials: "include",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(payload(status)),
                  })
                : await fetch(`/api/admin/analytics/rollups/${selectedId}`, {
                      method: "PATCH",
                      credentials: "include",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(payload(status)),
                  });
        if (res.ok) {
            const data = (await res.json()) as { item: MetricRollupRow };
            setSelectedId(data.item.id);
            setIsNew(false);
            await load();
        }
    };

    return (
        <div className={`${PLATFORM_BUILDER_SHELL} p-4`} data-rollup-builder="true">
            <div className="mb-3 flex justify-between">
                <div>
                    <h3 className="text-sm font-semibold text-alloy-midnight">Rollups</h3>
                    <p className="text-xs text-alloy-midnight/50">Combine child metrics into composite scores.</p>
                </div>
                {canEdit ?
                    <button type="button" className={PLATFORM_BUILDER_BTN_PRIMARY} onClick={() => { setIsNew(true); setSelectedId(null); setForm(EMPTY); }}>+ New</button>
                :   null}
            </div>
            <div className="grid gap-4 lg:grid-cols-[200px_1fr]">
                <ul className="rounded-lg border border-alloy-stone/12 p-2">
                    {items.map((item) => (
                        <li key={item.id}>
                            <button type="button" onClick={() => { setSelectedId(item.id); setIsNew(false); }} className={`w-full rounded-md px-2 py-1.5 text-left text-sm ${selectedId === item.id && !isNew ? "bg-alloy-midnight/8 font-semibold" : ""}`}>
                                {item.label}
                            </button>
                        </li>
                    ))}
                </ul>
                {(selected || isNew) ?
                    <div className="space-y-4">
                        <PlatformBuilderSection title="Rollup">
                            <PlatformBuilderField label="Key"><input className={PLATFORM_BUILDER_INPUT} value={form.key} disabled={!isNew} onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))} /></PlatformBuilderField>
                            <PlatformBuilderField label="Label"><input className={PLATFORM_BUILDER_INPUT} value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} /></PlatformBuilderField>
                            <PlatformBuilderField label="Type">
                                <select className={PLATFORM_BUILDER_SELECT} value={form.rollup_type} onChange={(e) => setForm((f) => ({ ...f, rollup_type: e.target.value }))}>
                                    {["sum", "avg", "weighted_avg", "health_score", "composite_score"].map((t) => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </PlatformBuilderField>
                            <div className="sm:col-span-2">
                                <PlatformBuilderField label="Child metrics">
                                    <select multiple className={`${PLATFORM_BUILDER_SELECT} min-h-[100px]`} value={form.metric_ids} onChange={(e) => setForm((f) => ({ ...f, metric_ids: Array.from(e.target.selectedOptions).map((o) => o.value) }))}>
                                        {metrics.filter((m) => m.status === "active").map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                                    </select>
                                </PlatformBuilderField>
                            </div>
                            <PlatformBuilderField label="Weights (comma-separated)"><input className={PLATFORM_BUILDER_INPUT} value={form.weights} onChange={(e) => setForm((f) => ({ ...f, weights: e.target.value }))} /></PlatformBuilderField>
                        </PlatformBuilderSection>
                        {canEdit ?
                            <div className="flex gap-2">
                                <button type="button" className={PLATFORM_BUILDER_BTN} onClick={() => void save("draft")}>Save draft</button>
                                <button type="button" className={PLATFORM_BUILDER_BTN_PRIMARY} onClick={() => void save("active")}>Publish</button>
                            </div>
                        :   null}
                    </div>
                :   null}
            </div>
        </div>
    );
}
