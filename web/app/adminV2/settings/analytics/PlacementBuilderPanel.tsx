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
    humanPlacementLabel,
    METRIC_STATUS_LABELS,
    SURFACE_OPTIONS,
    ZONE_LABELS,
    type SurfaceKey,
} from "@/app/adminV2/settings/analytics/platformBuilderLabels";
import {
    PlacementSurfacePreview,
    SurfacePicker,
    visualizationLabelById,
} from "@/app/adminV2/settings/analytics/PlacementSurfacePreview";
import { fetchMetricPlacementsList, fetchMetricVisualizations } from "@/lib/metrics/platform/fetchMetricPlatform";
import type { MetricPlacementRow, MetricVisualizationRow } from "@/lib/metrics/platform/types";

type Props = { canEdit: boolean };

const ZONES_BY_SURFACE: Record<SurfaceKey, string[]> = {
    operational_intelligence: ["overview", "health", "trends", "comparisons"],
    workspace_header: ["primary_metrics", "secondary_metrics"],
    work_unit_header: ["header_metrics"],
    business_process_tile: ["tile_metrics"],
};

type PlacementForm = {
    visualization_id: string;
    surface: SurfaceKey;
    surface_key: string;
    placement_zone: string;
    sort_order: number;
};

const EMPTY: PlacementForm = {
    visualization_id: "",
    surface: "operational_intelligence",
    surface_key: "default",
    placement_zone: "overview",
    sort_order: 0,
};

type WizardStep = 1 | 2 | 3 | 4;

export default function PlacementBuilderPanel({ canEdit }: Props) {
    const [items, setItems] = useState<MetricPlacementRow[]>([]);
    const [visualizations, setVisualizations] = useState<MetricVisualizationRow[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [form, setForm] = useState<PlacementForm>(EMPTY);
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [manageMode, setManageMode] = useState(false);
    const [wizardStep, setWizardStep] = useState<WizardStep>(1);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        const [placements, viz] = await Promise.all([fetchMetricPlacementsList(), fetchMetricVisualizations()]);
        setItems((placements.items ?? []) as MetricPlacementRow[]);
        setVisualizations((viz.items ?? []) as MetricVisualizationRow[]);
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const selected = items.find((i) => i.id === selectedId) ?? null;
    const zones = ZONES_BY_SURFACE[form.surface] ?? ["overview"];
    const vizLabel = visualizationLabelById(visualizations, form.visualization_id);
    const activeVisualizations = useMemo(
        () => visualizations.filter((v) => v.status === "active" || v.id === form.visualization_id),
        [visualizations, form.visualization_id]
    );

    useEffect(() => {
        if (!selected || createModalOpen) return;
        setForm({
            visualization_id: selected.visualization_id,
            surface: selected.surface as SurfaceKey,
            surface_key: selected.surface_key,
            placement_zone: selected.placement_zone,
            sort_order: selected.sort_order,
        });
    }, [selected, createModalOpen]);

    const payload = (status: string) => ({
        visualization_id: form.visualization_id,
        surface: form.surface,
        surface_key: form.surface_key.trim() || "default",
        placement_zone: form.placement_zone,
        sort_order: form.sort_order,
        context_config: { version: 1 },
        visibility_config: { version: 1, visible: status === "active" },
        status,
        version: 1,
    });

    const save = async (status: string, fromModal = false) => {
        if (!canEdit || !form.visualization_id) return;
        setSaving(true);
        const res =
            createModalOpen || !selectedId
                ? await fetch("/api/admin/analytics/placements", {
                      method: "POST",
                      credentials: "include",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(payload(status)),
                  })
                : await fetch(`/api/admin/analytics/placements/${selectedId}`, {
                      method: "PATCH",
                      credentials: "include",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(payload(status)),
                  });
        if (res.ok) {
            const data = (await res.json()) as { item: MetricPlacementRow };
            setSelectedId(data.item.id);
            setCreateModalOpen(false);
            setManageMode(true);
            await load();
        }
        setSaving(false);
        if (fromModal) setCreateModalOpen(false);
    };

    const reorder = async (id: string, delta: number) => {
        const item = items.find((i) => i.id === id);
        if (!item || !canEdit) return;
        await fetch(`/api/admin/analytics/placements/${id}`, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sort_order: item.sort_order + delta }),
        });
        await load();
    };

    const openCreate = () => {
        setForm(EMPTY);
        setWizardStep(1);
        setCreateModalOpen(true);
        setSelectedId(null);
    };

    const wizardFields = (step: WizardStep) => {
        if (step === 1) {
            return (
                <PlatformBuilderSection title="Step 1 — Choose where it appears" hint="Pick the surface operators will see this metric on.">
                    <div className="sm:col-span-2">
                        <SurfacePicker
                            value={form.surface}
                            onChange={(surface) =>
                                setForm((f) => ({
                                    ...f,
                                    surface,
                                    placement_zone: ZONES_BY_SURFACE[surface][0],
                                }))
                            }
                        />
                    </div>
                </PlatformBuilderSection>
            );
        }
        if (step === 2) {
            return (
                <PlatformBuilderSection title="Step 2 — Choose section" hint="Which part of that surface should show this card?">
                    <div className="sm:col-span-2 grid gap-2 sm:grid-cols-2">
                        {zones.map((z) => (
                            <button
                                key={z}
                                type="button"
                                onClick={() => setForm((f) => ({ ...f, placement_zone: z }))}
                                className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
                                    form.placement_zone === z
                                        ? "border-alloy-juniper/35 bg-alloy-juniper/8"
                                        : "border-alloy-stone/25 bg-white hover:border-alloy-stone/40"
                                }`}
                            >
                                <p className="text-sm font-semibold text-alloy-midnight">
                                    {ZONE_LABELS[form.surface]?.[z] ?? z.replace(/_/g, " ")}
                                </p>
                                <p className="mt-0.5 text-[11px] text-alloy-midnight/50">
                                    {humanPlacementLabel(form.surface, z)}
                                </p>
                            </button>
                        ))}
                    </div>
                    <div className="sm:col-span-2">
                        <PlacementSurfacePreview surface={form.surface} zone={form.placement_zone} />
                    </div>
                </PlatformBuilderSection>
            );
        }
        if (step === 3) {
            return (
                <PlatformBuilderSection title="Step 3 — Choose display style" hint="Pick a published card or scorecard to place.">
                    <div className="sm:col-span-2">
                        <PlatformBuilderField label="Display style">
                            <select
                                className={PLATFORM_BUILDER_SELECT}
                                value={form.visualization_id}
                                onChange={(e) => setForm((f) => ({ ...f, visualization_id: e.target.value }))}
                            >
                                <option value="">Select a display style…</option>
                                {activeVisualizations.map((v) => (
                                    <option key={v.id} value={v.id}>
                                        {v.label} ({v.visualization_type.replace(/_/g, " ")})
                                    </option>
                                ))}
                            </select>
                        </PlatformBuilderField>
                    </div>
                    {showAdvanced ?
                        <PlatformBuilderField label="Surface scope key" hint="Advanced — usually leave as default.">
                            <input
                                className={PLATFORM_BUILDER_INPUT}
                                value={form.surface_key}
                                onChange={(e) => setForm((f) => ({ ...f, surface_key: e.target.value }))}
                            />
                        </PlatformBuilderField>
                    :   null}
                </PlatformBuilderSection>
            );
        }
        return (
            <PlatformBuilderSection title="Step 4 — Preview placement" hint="Confirm before publishing.">
                <div className="sm:col-span-2 space-y-3">
                    <PlacementSurfacePreview
                        surface={form.surface}
                        zone={form.placement_zone}
                        visualizationLabel={vizLabel}
                    />
                    <PlatformBuilderCallout>
                        <strong>{vizLabel ?? "Display style"}</strong> will appear in{" "}
                        <strong>{humanPlacementLabel(form.surface, form.placement_zone)}</strong>.
                    </PlatformBuilderCallout>
                </div>
            </PlatformBuilderSection>
        );
    };

    const editFields = () => (
        <>
            <button type="button" className="text-xs font-semibold text-alloy-juniper" onClick={() => setShowAdvanced((v) => !v)}>
                {showAdvanced ? "Hide advanced settings" : "Show advanced settings"}
            </button>
            <PlatformBuilderSection title="Placement details">
                <PlatformBuilderField label="Display style">
                    <select
                        className={PLATFORM_BUILDER_SELECT}
                        value={form.visualization_id}
                        onChange={(e) => setForm((f) => ({ ...f, visualization_id: e.target.value }))}
                    >
                        <option value="">Select…</option>
                        {activeVisualizations.map((v) => (
                            <option key={v.id} value={v.id}>{v.label}</option>
                        ))}
                    </select>
                </PlatformBuilderField>
                <PlatformBuilderField label="Surface">
                    <select
                        className={PLATFORM_BUILDER_SELECT}
                        value={form.surface}
                        onChange={(e) =>
                            setForm((f) => ({
                                ...f,
                                surface: e.target.value as SurfaceKey,
                                placement_zone: ZONES_BY_SURFACE[e.target.value as SurfaceKey]?.[0] ?? "overview",
                            }))
                        }
                    >
                        {SURFACE_OPTIONS.map((s) => (
                            <option key={s.key} value={s.key}>{s.label}</option>
                        ))}
                    </select>
                </PlatformBuilderField>
                <PlatformBuilderField label="Section">
                    <select
                        className={PLATFORM_BUILDER_SELECT}
                        value={form.placement_zone}
                        onChange={(e) => setForm((f) => ({ ...f, placement_zone: e.target.value }))}
                    >
                        {zones.map((z) => (
                            <option key={z} value={z}>{ZONE_LABELS[form.surface]?.[z] ?? z.replace(/_/g, " ")}</option>
                        ))}
                    </select>
                </PlatformBuilderField>
                {showAdvanced ?
                    <>
                        <PlatformBuilderField label="Surface scope key">
                            <input className={PLATFORM_BUILDER_INPUT} value={form.surface_key} onChange={(e) => setForm((f) => ({ ...f, surface_key: e.target.value }))} />
                        </PlatformBuilderField>
                        <PlatformBuilderField label="Sort order">
                            <input type="number" className={PLATFORM_BUILDER_INPUT} value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: parseInt(e.target.value, 10) || 0 }))} />
                        </PlatformBuilderField>
                    </>
                :   null}
            </PlatformBuilderSection>
            <PlacementSurfacePreview surface={form.surface} zone={form.placement_zone} visualizationLabel={vizLabel} />
        </>
    );

    return (
        <div className={`${PLATFORM_BUILDER_SHELL} p-4`} data-placement-builder="true">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                <div>
                    <h3 className="text-sm font-semibold text-alloy-midnight">Where it appears</h3>
                    <p className="text-xs text-alloy-midnight/55">
                        Choose a surface, section, and display style — like the Experience Layout Builder.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <PlatformBuilderButton onClick={() => setManageMode((v) => !v)}>
                        {manageMode ? "Layout builder" : "Manage list"}
                    </PlatformBuilderButton>
                    {canEdit ?
                        <PlatformBuilderButton variant="primary" onClick={openCreate}>+ New placement</PlatformBuilderButton>
                    :   null}
                </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
                <PlatformBuilderListPanel
                    title="Saved placements"
                    hint="Select a placement to edit or reorder."
                    emptyTitle="No placements yet"
                    emptyHint="Publish a display style first, then place it on a surface."
                    loading={false}
                    itemCount={items.length}
                >
                    {items.map((item) => {
                        const viz = visualizations.find((v) => v.id === item.visualization_id);
                        return (
                            <PlatformBuilderListItem
                                key={item.id}
                                selected={selectedId === item.id && !createModalOpen}
                                onClick={() => { setSelectedId(item.id); setCreateModalOpen(false); }}
                                title={viz?.label ?? "Display style"}
                                meta={humanPlacementLabel(item.surface, item.placement_zone)}
                                badges={
                                    <>
                                        <PlatformBuilderStatusBadge
                                            label={METRIC_STATUS_LABELS[item.status]?.label ?? item.status}
                                            tone={METRIC_STATUS_LABELS[item.status]?.tone ?? "neutral"}
                                        />
                                        {canEdit ?
                                            <span className="inline-flex gap-0.5">
                                                <button type="button" className="rounded px-1 text-[10px] text-alloy-midnight/40 hover:bg-alloy-stone/10" onClick={(e) => { e.stopPropagation(); void reorder(item.id, -1); }}>↑</button>
                                                <button type="button" className="rounded px-1 text-[10px] text-alloy-midnight/40 hover:bg-alloy-stone/10" onClick={(e) => { e.stopPropagation(); void reorder(item.id, 1); }}>↓</button>
                                            </span>
                                        :   null}
                                    </>
                                }
                            />
                        );
                    })}
                </PlatformBuilderListPanel>

                {manageMode && selected ?
                    <div className="space-y-4">
                        {editFields()}
                        {canEdit ?
                            <div className="flex flex-wrap gap-2">
                                <PlatformBuilderButton loading={saving} onClick={() => void save("draft")}>Save draft</PlatformBuilderButton>
                                <PlatformBuilderButton variant="primary" loading={saving} onClick={() => void save("active")}>Publish</PlatformBuilderButton>
                                {selected.status === "active" ?
                                    <PlatformBuilderButton onClick={() => void save("hidden")}>Hide</PlatformBuilderButton>
                                :   null}
                                <PlatformBuilderButton variant="danger" onClick={() => void save("archived")}>Archive</PlatformBuilderButton>
                            </div>
                        :   null}
                    </div>
                : selected && !createModalOpen ?
                    <div className="space-y-4">
                        <PlatformBuilderCallout>
                            Showing <strong>{vizLabel ?? "display style"}</strong> on{" "}
                            <strong>{humanPlacementLabel(form.surface, form.placement_zone)}</strong>.
                        </PlatformBuilderCallout>
                        <PlacementSurfacePreview surface={form.surface} zone={form.placement_zone} visualizationLabel={vizLabel} />
                        {canEdit ?
                            <div className="flex flex-wrap gap-2">
                                <PlatformBuilderButton onClick={() => setManageMode(true)}>Edit placement</PlatformBuilderButton>
                            </div>
                        :   null}
                    </div>
                : !selected && !createModalOpen ?
                    <PlatformBuilderEmptyState
                        title="Place a metric on a surface"
                        body="Start with + New placement to choose Operational Intelligence, a workspace header, work unit header, or business process tile."
                        action={canEdit ? <PlatformBuilderButton variant="primary" onClick={openCreate}>+ New placement</PlatformBuilderButton> : null}
                    />
                :   null}
            </div>

            <PlatformBuilderModal
                open={createModalOpen}
                title="New placement"
                subtitle="Walk through surface → section → display style → preview."
                onClose={() => setCreateModalOpen(false)}
                footer={
                    <>
                        {wizardStep > 1 ?
                            <PlatformBuilderButton onClick={() => setWizardStep((s) => (s - 1) as WizardStep)}>Back</PlatformBuilderButton>
                        :   <PlatformBuilderButton onClick={() => setCreateModalOpen(false)}>Cancel</PlatformBuilderButton>}
                        {wizardStep < 4 ?
                            <PlatformBuilderButton
                                variant="primary"
                                disabled={wizardStep === 3 && !form.visualization_id}
                                onClick={() => setWizardStep((s) => (s + 1) as WizardStep)}
                            >
                                Continue
                            </PlatformBuilderButton>
                        :   <PlatformBuilderButton variant="primary" loading={saving} onClick={() => void save("active", true)}>Publish placement</PlatformBuilderButton>}
                    </>
                }
            >
                <div className="mb-3 flex gap-1">
                    {([1, 2, 3, 4] as WizardStep[]).map((s) => (
                        <span
                            key={s}
                            className={`h-1.5 flex-1 rounded-full ${wizardStep >= s ? "bg-alloy-juniper" : "bg-alloy-stone/20"}`}
                        />
                    ))}
                </div>
                {wizardFields(wizardStep)}
                {wizardStep >= 2 ?
                    <button type="button" className="mt-2 text-xs font-semibold text-alloy-juniper" onClick={() => setShowAdvanced((v) => !v)}>
                        {showAdvanced ? "Hide advanced settings" : "Show advanced settings"}
                    </button>
                :   null}
            </PlatformBuilderModal>
        </div>
    );
}
