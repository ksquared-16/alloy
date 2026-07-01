"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    PLATFORM_BUILDER_SHELL,
    PlatformBuilderButton,
    PlatformBuilderCallout,
    PlatformBuilderEmptyState,
    PlatformBuilderListItem,
    PlatformBuilderListPanel,
    PlatformBuilderModal,
    PlatformBuilderStatusBadge,
} from "@/app/adminV2/settings/analytics/platformBuilderUi";
import {
    humanPlacementLabel,
    METRIC_STATUS_LABELS,
    VIZ_TYPE_LABELS,
    ZONE_LABELS,
    ZONES_BY_SURFACE,
    type SurfaceKey,
} from "@/app/adminV2/settings/analytics/platformBuilderLabels";
import {
    PlacementSurfacePreview,
    SurfacePicker,
} from "@/app/adminV2/settings/analytics/PlacementSurfacePreview";
import { fetchMetricPlacementsList, fetchMetricVisualizations } from "@/lib/metrics/platform/fetchMetricPlatform";
import type { MetricPlacementRow, MetricVisualizationRow } from "@/lib/metrics/platform/types";

type Props = { canEdit: boolean };

type AddForm = { surface: SurfaceKey; placement_zone: string; surface_key: string };

const ADD_EMPTY: AddForm = { surface: "operational_intelligence", placement_zone: "overview", surface_key: "default" };

export default function PlacementBuilderPanel({ canEdit }: Props) {
    const [visualizations, setVisualizations] = useState<MetricVisualizationRow[]>([]);
    const [placements, setPlacements] = useState<MetricPlacementRow[]>([]);
    const [selectedVizId, setSelectedVizId] = useState<string | null>(null);
    const [addModalOpen, setAddModalOpen] = useState(false);
    const [addForm, setAddForm] = useState<AddForm>(ADD_EMPTY);
    const [saving, setSaving] = useState(false);
    const [manageMode, setManageMode] = useState(false);

    const load = useCallback(async () => {
        const [viz, pl] = await Promise.all([fetchMetricVisualizations(), fetchMetricPlacementsList()]);
        setVisualizations((viz.items ?? []) as MetricVisualizationRow[]);
        setPlacements((pl.items ?? []) as MetricPlacementRow[]);
    }, []);

    useEffect(() => {
        void load();
    }, [load]);

    const selectedViz = visualizations.find((v) => v.id === selectedVizId) ?? null;
    const vizPlacements = useMemo(
        () =>
            placements
                .filter((p) => p.visualization_id === selectedVizId && p.status !== "archived")
                .sort((a, b) => a.sort_order - b.sort_order),
        [placements, selectedVizId]
    );

    const existingLocationKeys = new Set(vizPlacements.map((p) => `${p.surface}:${p.placement_zone}:${p.surface_key}`));

    const addLocation = async () => {
        if (!canEdit || !selectedVizId) return;
        const key = `${addForm.surface}:${addForm.placement_zone}:${addForm.surface_key}`;
        if (existingLocationKeys.has(key)) return;
        setSaving(true);
        const res = await fetch("/api/admin/analytics/placements", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                visualization_id: selectedVizId,
                surface: addForm.surface,
                surface_key: addForm.surface_key.trim() || "default",
                placement_zone: addForm.placement_zone,
                sort_order: (vizPlacements.at(-1)?.sort_order ?? 0) + 10,
                context_config: { version: 1 },
                visibility_config: { version: 1, visible: true },
                status: "active",
                version: 1,
            }),
        });
        if (res.ok) {
            setAddModalOpen(false);
            setAddForm(ADD_EMPTY);
            await load();
        }
        setSaving(false);
    };

    const removePlacement = async (id: string) => {
        if (!canEdit) return;
        await fetch(`/api/admin/analytics/placements/${id}`, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "archived" }),
        });
        await load();
    };

    const reorder = async (id: string, delta: number) => {
        const item = placements.find((p) => p.id === id);
        if (!item || !canEdit) return;
        await fetch(`/api/admin/analytics/placements/${id}`, {
            method: "PATCH",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sort_order: item.sort_order + delta }),
        });
        await load();
    };

    const activeVisualizations = visualizations.filter((v) => v.status === "active" || v.status === "draft");

    return (
        <div className={`${PLATFORM_BUILDER_SHELL} p-4`} data-placement-builder="true">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                    <h3 className="text-sm font-semibold text-alloy-midnight">Where it appears</h3>
                    <p className="text-xs text-alloy-midnight/55">
                        Pick a display style, then add every surface where operators should see it. One style can appear in many places.
                    </p>
                </div>
                <PlatformBuilderButton onClick={() => setManageMode((v) => !v)}>
                    {manageMode ? "Grouped view" : "Manage all"}
                </PlatformBuilderButton>
            </div>

            <PlatformBuilderCallout>
                This controls <strong>V2 metric placements</strong>. The top-level <strong>Experience placement</strong> tab shows legacy V1 indicator visibility.
            </PlatformBuilderCallout>

            <div className="mt-3 grid gap-3 lg:grid-cols-[220px_1fr]">
                <PlatformBuilderListPanel
                    title="Display styles"
                    hint="Select a style to manage locations."
                    emptyTitle="No display styles"
                    emptyHint="Publish a display style first."
                    loading={false}
                    itemCount={activeVisualizations.length}
                >
                    {activeVisualizations.map((viz) => {
                        const count = placements.filter((p) => p.visualization_id === viz.id && p.status !== "archived").length;
                        return (
                            <PlatformBuilderListItem
                                key={viz.id}
                                selected={selectedVizId === viz.id}
                                onClick={() => setSelectedVizId(viz.id)}
                                title={viz.label}
                                meta={`${VIZ_TYPE_LABELS[viz.visualization_type] ?? viz.visualization_type} · ${count} location${count === 1 ? "" : "s"}`}
                                badges={
                                    <PlatformBuilderStatusBadge
                                        label={METRIC_STATUS_LABELS[viz.status]?.label ?? viz.status}
                                        tone={METRIC_STATUS_LABELS[viz.status]?.tone ?? "neutral"}
                                    />
                                }
                            />
                        );
                    })}
                </PlatformBuilderListPanel>

                {selectedViz ?
                    <div className="space-y-3">
                        <div className="rounded-lg border border-alloy-stone/15 bg-alloy-stone/[0.02] p-3">
                            <p className="text-sm font-semibold text-alloy-midnight">{selectedViz.label}</p>
                            <p className="text-xs text-alloy-midnight/50">{VIZ_TYPE_LABELS[selectedViz.visualization_type] ?? selectedViz.visualization_type}</p>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-alloy-midnight/55">Where this appears</p>
                                <p className="text-[11px] text-alloy-midnight/45">One display style can appear in multiple places.</p>
                            </div>
                            {canEdit ?
                                <PlatformBuilderButton variant="primary" onClick={() => { setAddForm(ADD_EMPTY); setAddModalOpen(true); }}>
                                    + Add another place
                                </PlatformBuilderButton>
                            :   null}
                        </div>

                        {vizPlacements.length ?
                            <ul className="space-y-1.5">
                                {vizPlacements.map((p) => (
                                    <li
                                        key={p.id}
                                        className="flex items-center gap-2 rounded-lg border border-alloy-stone/20 bg-white px-3 py-2"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-medium text-alloy-midnight">{humanPlacementLabel(p.surface, p.placement_zone)}</p>
                                            <p className="text-[10px] text-alloy-midnight/45">{METRIC_STATUS_LABELS[p.status]?.label ?? p.status}</p>
                                        </div>
                                        {canEdit ?
                                            <div className="flex shrink-0 items-center gap-1">
                                                <button type="button" className="rounded px-1.5 py-0.5 text-xs text-alloy-midnight/45 hover:bg-alloy-stone/10" onClick={() => void reorder(p.id, -1)}>↑</button>
                                                <button type="button" className="rounded px-1.5 py-0.5 text-xs text-alloy-midnight/45 hover:bg-alloy-stone/10" onClick={() => void reorder(p.id, 1)}>↓</button>
                                                <PlatformBuilderButton variant="danger" onClick={() => void removePlacement(p.id)}>Remove</PlatformBuilderButton>
                                            </div>
                                        :   null}
                                    </li>
                                ))}
                            </ul>
                        :   <PlatformBuilderEmptyState
                                title="Not placed yet"
                                body="Add the surfaces where operators should see this display style — work unit headers, workspace pulse, OI sections, or process tiles. One display style can appear in multiple places."
                                action={canEdit ? <PlatformBuilderButton variant="primary" onClick={() => setAddModalOpen(true)}>+ Add another place</PlatformBuilderButton> : null}
                            />}

                        {vizPlacements[0] ?
                            <PlacementSurfacePreview
                                surface={vizPlacements[0].surface}
                                zone={vizPlacements[0].placement_zone}
                                visualizationLabel={selectedViz.label}
                            />
                        :   null}

                        {manageMode ?
                            <div className="rounded-lg border border-dashed border-alloy-stone/25 p-3">
                                <p className="mb-2 text-xs font-semibold text-alloy-midnight/55">All placements (manage)</p>
                                <ul className="space-y-1 text-xs text-alloy-midnight/60">
                                    {placements.filter((p) => p.status !== "archived").map((p) => {
                                        const viz = visualizations.find((v) => v.id === p.visualization_id);
                                        return (
                                            <li key={p.id}>{viz?.label ?? "Style"} → {humanPlacementLabel(p.surface, p.placement_zone)}</li>
                                        );
                                    })}
                                </ul>
                            </div>
                        :   null}
                    </div>
                :   <PlatformBuilderEmptyState title="Select a display style" body="Choose a published display style to manage where it appears." />}
            </div>

            <PlatformBuilderModal
                open={addModalOpen}
                title="Add another place"
                subtitle={`Place "${selectedViz?.label ?? "this style"}" on another surface. One display style can appear in multiple places.`}
                onClose={() => setAddModalOpen(false)}
                footer={
                    <>
                        <PlatformBuilderButton disabled={saving} onClick={() => setAddModalOpen(false)}>Cancel</PlatformBuilderButton>
                        <PlatformBuilderButton variant="primary" loading={saving} disabled={saving} onClick={() => void addLocation()}>Add place</PlatformBuilderButton>
                    </>
                }
            >
                <div className="space-y-3">
                    <SurfacePicker
                        value={addForm.surface}
                        onChange={(surface) =>
                            setAddForm((f) => ({
                                ...f,
                                surface,
                                placement_zone: ZONES_BY_SURFACE[surface][0],
                            }))
                        }
                    />
                    <div className="grid gap-2 sm:grid-cols-2">
                        {ZONES_BY_SURFACE[addForm.surface].map((zone) => (
                            <button
                                key={zone}
                                type="button"
                                onClick={() => setAddForm((f) => ({ ...f, placement_zone: zone }))}
                                className={`rounded-lg border px-3 py-2 text-left text-sm ${
                                    addForm.placement_zone === zone
                                        ? "border-alloy-juniper/35 bg-alloy-juniper/8 font-semibold"
                                        : "border-alloy-stone/25 hover:border-alloy-stone/40"
                                }`}
                            >
                                {ZONE_LABELS[addForm.surface]?.[zone] ?? zone.replace(/_/g, " ")}
                            </button>
                        ))}
                    </div>
                    <PlacementSurfacePreview surface={addForm.surface} zone={addForm.placement_zone} visualizationLabel={selectedViz?.label} />
                </div>
            </PlatformBuilderModal>
        </div>
    );
}
