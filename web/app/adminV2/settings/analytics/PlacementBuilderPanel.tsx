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
import { fetchMetricPlacementsList, fetchMetricVisualizations } from "@/lib/metrics/platform/fetchMetricPlatform";
import type { MetricPlacementRow, MetricVisualizationRow } from "@/lib/metrics/platform/types";

type Props = { canEdit: boolean };

const SURFACES = [
    "operational_intelligence",
    "workspace_header",
    "work_unit_header",
    "business_process_tile",
] as const;

const ZONES_BY_SURFACE: Record<string, string[]> = {
    operational_intelligence: ["overview", "health", "trends", "comparisons"],
    workspace_header: ["primary_metrics", "secondary_metrics"],
    work_unit_header: ["header_metrics"],
    business_process_tile: ["tile_metrics"],
};

type PlacementForm = {
    visualization_id: string;
    surface: string;
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

export default function PlacementBuilderPanel({ canEdit }: Props) {
    const [items, setItems] = useState<MetricPlacementRow[]>([]);
    const [visualizations, setVisualizations] = useState<MetricVisualizationRow[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [form, setForm] = useState<PlacementForm>(EMPTY);
    const [isNew, setIsNew] = useState(false);

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

    useEffect(() => {
        if (!selected || isNew) return;
        setForm({
            visualization_id: selected.visualization_id,
            surface: selected.surface,
            surface_key: selected.surface_key,
            placement_zone: selected.placement_zone,
            sort_order: selected.sort_order,
        });
    }, [selected, isNew]);

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

    const save = async (status: string) => {
        if (!canEdit) return;
        const res =
            isNew || !selectedId
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
            setIsNew(false);
            await load();
        }
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

    const duplicate = () => {
        if (!selected || !canEdit) return;
        setIsNew(true);
        setSelectedId(null);
        setForm((f) => ({
            ...f,
            sort_order: f.sort_order + 10,
        }));
    };

    return (
        <div className={`${PLATFORM_BUILDER_SHELL} p-4`} data-placement-builder="true">
            <div className="mb-3 flex justify-between gap-2">
                <div>
                    <h3 className="text-sm font-semibold text-alloy-midnight">Placements</h3>
                    <p className="text-xs text-alloy-midnight/50">Where visualizations appear — surfaces and zones.</p>
                </div>
                {canEdit ?
                    <button type="button" className={PLATFORM_BUILDER_BTN_PRIMARY} onClick={() => { setIsNew(true); setSelectedId(null); setForm(EMPTY); }}>+ New</button>
                :   null}
            </div>

            <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
                <ul className="space-y-0.5 rounded-lg border border-alloy-stone/12 p-2">
                    {items.map((item) => (
                        <li key={item.id} className="flex items-center gap-1">
                            <button type="button" onClick={() => { setSelectedId(item.id); setIsNew(false); }} className={`min-w-0 flex-1 rounded-md px-2 py-1.5 text-left text-sm ${selectedId === item.id && !isNew ? "bg-alloy-midnight/8 font-semibold" : ""}`}>
                                {item.surface} / {item.placement_zone}
                                <span className="block truncate text-[10px] text-alloy-midnight/40">{item.surface_key} · {item.status}</span>
                            </button>
                            {canEdit ?
                                <div className="flex shrink-0 flex-col">
                                    <button type="button" className="text-[10px] text-alloy-midnight/40" onClick={() => void reorder(item.id, -1)}>↑</button>
                                    <button type="button" className="text-[10px] text-alloy-midnight/40" onClick={() => void reorder(item.id, 1)}>↓</button>
                                </div>
                            :   null}
                        </li>
                    ))}
                </ul>

                {(selected || isNew) ?
                    <div className="space-y-4">
                        <PlatformBuilderSection title="Placement">
                            <PlatformBuilderField label="Visualization">
                                <select className={PLATFORM_BUILDER_SELECT} value={form.visualization_id} onChange={(e) => setForm((f) => ({ ...f, visualization_id: e.target.value }))}>
                                    <option value="">Select…</option>
                                    {visualizations.filter((v) => v.status === "active" || v.id === form.visualization_id).map((v) => (
                                        <option key={v.id} value={v.id}>{v.label} ({v.visualization_type})</option>
                                    ))}
                                </select>
                            </PlatformBuilderField>
                            <PlatformBuilderField label="Surface">
                                <select className={PLATFORM_BUILDER_SELECT} value={form.surface} onChange={(e) => setForm((f) => ({ ...f, surface: e.target.value, placement_zone: ZONES_BY_SURFACE[e.target.value]?.[0] ?? "overview" }))}>
                                    {SURFACES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                                </select>
                            </PlatformBuilderField>
                            <PlatformBuilderField label="Surface key" hint="e.g. default, enrollment, enrollment_pipeline">
                                <input className={PLATFORM_BUILDER_INPUT} value={form.surface_key} onChange={(e) => setForm((f) => ({ ...f, surface_key: e.target.value }))} />
                            </PlatformBuilderField>
                            <PlatformBuilderField label="Zone">
                                <select className={PLATFORM_BUILDER_SELECT} value={form.placement_zone} onChange={(e) => setForm((f) => ({ ...f, placement_zone: e.target.value }))}>
                                    {zones.map((z) => <option key={z} value={z}>{z.replace(/_/g, " ")}</option>)}
                                </select>
                            </PlatformBuilderField>
                            <PlatformBuilderField label="Sort order">
                                <input type="number" className={PLATFORM_BUILDER_INPUT} value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: parseInt(e.target.value, 10) || 0 }))} />
                            </PlatformBuilderField>
                        </PlatformBuilderSection>
                        {canEdit ?
                            <div className="flex flex-wrap gap-2">
                                <button type="button" className={PLATFORM_BUILDER_BTN} onClick={() => void save("draft")}>Save draft</button>
                                <button type="button" className={PLATFORM_BUILDER_BTN_PRIMARY} onClick={() => void save("active")}>Activate</button>
                                {selected?.status === "active" ?
                                    <button type="button" className={PLATFORM_BUILDER_BTN} onClick={() => void save("hidden")}>Deactivate</button>
                                :   null}
                                {selected ?
                                    <>
                                        <button type="button" className={PLATFORM_BUILDER_BTN} onClick={duplicate}>Duplicate</button>
                                        <button type="button" className={PLATFORM_BUILDER_BTN_DANGER} onClick={() => void save("archived")}>Archive</button>
                                    </>
                                :   null}
                            </div>
                        :   null}
                    </div>
                :   <p className="text-sm text-alloy-midnight/45">Select or create a placement.</p>}
            </div>
        </div>
    );
}
