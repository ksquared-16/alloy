"use client";

import { useCallback, useEffect, useState } from "react";
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
    METRIC_STATUS_LABELS,
    slugifyMetricKey,
} from "@/app/adminV2/settings/analytics/platformBuilderLabels";
import { fetchMetricDefinitions } from "@/lib/metrics/platform/fetchMetricPlatform";
import type { MetricDefinitionRow, MetricRollupRow } from "@/lib/metrics/platform/types";

type Props = { canEdit: boolean };

const ROLLUP_TYPE_LABELS: Record<string, string> = {
    health_score: "Health score",
    composite_score: "Combined score",
    weighted_avg: "Weighted average",
    avg: "Simple average",
    sum: "Sum total",
};

const ROLLUP_EXAMPLES = [
    "Enrollment Health — combines tour conversion, forms completion, and needs-attention count.",
    "Communications Health — blends response time, backlog, and SLA breach rate.",
    "Operations Pulse — averages queue depth and completion rate across work units.",
];

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
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [saving, setSaving] = useState(false);

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
    const activeMetrics = metrics.filter((m) => m.status === "active");

    useEffect(() => {
        if (!selected || createModalOpen) return;
        const cfg = selected.child_metric_config as { metrics?: { metricDefinitionId: string; weight?: number }[] };
        setForm({
            key: selected.key,
            label: selected.label,
            rollup_type: selected.rollup_type,
            metric_ids: (cfg.metrics ?? []).map((m) => m.metricDefinitionId),
            weights: (cfg.metrics ?? []).map((m) => String(m.weight ?? 1)).join(", "),
        });
    }, [selected, createModalOpen]);

    const payload = (status: string) => {
        const weights = form.weights.split(",").map((w) => parseFloat(w.trim()) || 1);
        return {
            key: form.key.trim() || slugifyMetricKey(form.label),
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

    const save = async (status: string, fromModal = false) => {
        if (!canEdit || !form.label.trim() || form.metric_ids.length < 2) return;
        setSaving(true);
        const res =
            createModalOpen || !selectedId
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
            setCreateModalOpen(false);
            await load();
        }
        setSaving(false);
        if (fromModal) setCreateModalOpen(false);
    };

    const formFields = (disabled: boolean) => (
        <>
            <PlatformBuilderCallout>
                Combine multiple metrics into one score, such as <strong>Enrollment Health</strong>. Pick at least two published calculations.
            </PlatformBuilderCallout>
            <PlatformBuilderSection title="Combined score">
                <PlatformBuilderField label="Score name">
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
                        placeholder="Enrollment Health"
                    />
                </PlatformBuilderField>
                <PlatformBuilderField label="Combination method">
                    <select
                        className={PLATFORM_BUILDER_SELECT}
                        value={form.rollup_type}
                        onChange={(e) => setForm((f) => ({ ...f, rollup_type: e.target.value }))}
                        disabled={disabled}
                    >
                        {Object.entries(ROLLUP_TYPE_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                        ))}
                    </select>
                </PlatformBuilderField>
                <div className="sm:col-span-2">
                    <PlatformBuilderField label="Included calculations" hint="Hold ⌘/Ctrl to select multiple.">
                        <select
                            multiple
                            className={`${PLATFORM_BUILDER_SELECT} min-h-[100px]`}
                            value={form.metric_ids}
                            onChange={(e) =>
                                setForm((f) => ({
                                    ...f,
                                    metric_ids: Array.from(e.target.selectedOptions).map((o) => o.value),
                                }))
                            }
                            disabled={disabled}
                        >
                            {activeMetrics.map((m) => (
                                <option key={m.id} value={m.id}>{m.label}</option>
                            ))}
                        </select>
                    </PlatformBuilderField>
                </div>
                <PlatformBuilderField label="Weights (optional)" hint="Comma-separated — defaults to equal weight.">
                    <input
                        className={PLATFORM_BUILDER_INPUT}
                        value={form.weights}
                        onChange={(e) => setForm((f) => ({ ...f, weights: e.target.value }))}
                        disabled={disabled}
                        placeholder="1, 1, 2"
                    />
                </PlatformBuilderField>
                {showAdvanced ?
                    <PlatformBuilderField label="Internal key">
                        <input className={PLATFORM_BUILDER_INPUT} value={form.key} onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))} disabled={disabled && !createModalOpen} />
                    </PlatformBuilderField>
                :   null}
            </PlatformBuilderSection>
        </>
    );

    return (
        <div className={`${PLATFORM_BUILDER_SHELL} p-4`} data-rollup-builder="true">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                <div>
                    <h3 className="text-sm font-semibold text-alloy-midnight">Combined scores</h3>
                    <p className="text-xs text-alloy-midnight/55">
                        Roll up multiple calculations into a single health or composite score operators can scan at a glance.
                    </p>
                </div>
                {canEdit ?
                    <PlatformBuilderButton variant="primary" onClick={() => { setForm(EMPTY); setCreateModalOpen(true); setSelectedId(null); }}>
                        + New combined score
                    </PlatformBuilderButton>
                :   null}
            </div>

            <div className="mb-4 rounded-lg border border-alloy-stone/15 bg-alloy-stone/[0.03] p-3">
                <p className="text-xs font-semibold text-alloy-midnight">Examples</p>
                <ul className="mt-2 space-y-1 text-xs text-alloy-midnight/55">
                    {ROLLUP_EXAMPLES.map((ex) => (
                        <li key={ex}>• {ex}</li>
                    ))}
                </ul>
            </div>

            <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
                <PlatformBuilderListPanel
                    title="Saved combined scores"
                    hint="Select a score to edit."
                    emptyTitle="No combined scores yet"
                    emptyHint="Create one when you want a single health number from several KPIs."
                    loading={false}
                    itemCount={items.length}
                >
                    {items.map((item) => (
                        <PlatformBuilderListItem
                            key={item.id}
                            selected={selectedId === item.id}
                            onClick={() => setSelectedId(item.id)}
                            title={item.label}
                            meta={ROLLUP_TYPE_LABELS[item.rollup_type] ?? item.rollup_type}
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
                        <button type="button" className="text-xs font-semibold text-alloy-juniper" onClick={() => setShowAdvanced((v) => !v)}>
                            {showAdvanced ? "Hide advanced settings" : "Show advanced settings"}
                        </button>
                        {formFields(false)}
                        {canEdit ?
                            <div className="flex flex-wrap gap-2">
                                <PlatformBuilderButton loading={saving} onClick={() => void save("draft")}>Save draft</PlatformBuilderButton>
                                <PlatformBuilderButton variant="primary" loading={saving} onClick={() => void save("active")}>Publish</PlatformBuilderButton>
                            </div>
                        :   null}
                    </div>
                :   <PlatformBuilderEmptyState
                        title="Combine metrics into one score"
                        body="Use combined scores for enrollment health, communications health, or any rollup your operators should scan quickly. Publish at least two calculations first."
                        action={canEdit ? <PlatformBuilderButton variant="primary" onClick={() => { setForm(EMPTY); setCreateModalOpen(true); }}>+ New combined score</PlatformBuilderButton> : null}
                    />}
            </div>

            <PlatformBuilderModal
                open={createModalOpen}
                title="New combined score"
                subtitle="Pick calculations and how they should roll up."
                onClose={() => setCreateModalOpen(false)}
                footer={
                    <>
                        <PlatformBuilderButton onClick={() => setCreateModalOpen(false)}>Cancel</PlatformBuilderButton>
                        <PlatformBuilderButton
                            variant="primary"
                            loading={saving}
                            disabled={form.metric_ids.length < 2 || !form.label.trim()}
                            onClick={() => void save("active", true)}
                        >
                            Publish
                        </PlatformBuilderButton>
                    </>
                }
            >
                {formFields(false)}
            </PlatformBuilderModal>
        </div>
    );
}
