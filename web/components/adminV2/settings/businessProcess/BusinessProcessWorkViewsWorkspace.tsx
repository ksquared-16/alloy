"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import WorkViewProcessEditorCard from "@/components/adminV2/settings/businessProcess/WorkViewProcessEditorCard";
import {
    BUSINESS_PROCESS_WORK_VIEW_ADD,
    BUSINESS_PROCESS_WORK_VIEW_COMPAT_NOTE,
    BUSINESS_PROCESS_WORK_VIEWS_INTRO,
} from "@/lib/lifecycle/businessProcessUiLabels";
import {
    createEmptyWorkViewDraft,
    normalizeWorkViewsDisplayOrder,
    slugifyWorkViewId,
    workViewsV1Equal,
    type WorkViewConfigV1Stored,
} from "@/lib/lifecycle/workViewsConfigV1";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import type { EntityLayoutRecord } from "@/lib/layout/layoutV2";
import {
    enrichWorkViewsCompatQueueKeys,
    type WorkViewCompatQueueLane,
} from "@/lib/lifecycle/workViewsRuntimeConvergence";

type WorkViewsResponse = {
    work_views_v1?: WorkViewConfigV1Stored[];
    saved_work_views_v1?: WorkViewConfigV1Stored[] | null;
    compatibility_seed?: boolean;
    error?: string;
};

export default function BusinessProcessWorkViewsWorkspace({
    departmentId,
    processId,
    workUnitId,
    queueLanes = [],
}: {
    departmentId: string;
    processId: string;
    workUnitId: string | null;
    queueLanes?: WorkViewCompatQueueLane[];
}) {
    const [baseline, setBaseline] = useState<WorkViewConfigV1Stored[]>([]);
    const [drafts, setDrafts] = useState<WorkViewConfigV1Stored[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [layouts, setLayouts] = useState<EntityLayoutRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [compatibilitySeed, setCompatibilitySeed] = useState(false);
    const [savedFlash, setSavedFlash] = useState(false);

    const dirty = useMemo(() => !workViewsV1Equal(baseline, drafts), [baseline, drafts]);
    const selected = drafts.find((row) => row.id === selectedId) ?? drafts[0] ?? null;

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [viewsRes, layoutsRes] = await Promise.all([
                fetch(
                    `/api/admin/lifecycle-builder/process-work-views?department_id=${encodeURIComponent(departmentId)}&process_id=${encodeURIComponent(processId)}`,
                    workspaceDataFetchInit(),
                ),
                fetch("/api/admin/entity-layouts", workspaceDataFetchInit()),
            ]);
            const viewsJson = (await viewsRes.json()) as WorkViewsResponse;
            const layoutsJson = (await layoutsRes.json()) as { records?: EntityLayoutRecord[]; error?: string };
            if (!viewsRes.ok) throw new Error(viewsJson.error ?? "Failed to load work views");
            if (!layoutsRes.ok) throw new Error(layoutsJson.error ?? "Failed to load layouts");

            const effective = normalizeWorkViewsDisplayOrder(viewsJson.work_views_v1 ?? []);
            setBaseline(effective);
            setDrafts(effective);
            setSelectedId(effective[0]?.id ?? null);
            setCompatibilitySeed(Boolean(viewsJson.compatibility_seed));
            setLayouts(layoutsJson.records ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load work views");
        } finally {
            setLoading(false);
        }
    }, [departmentId, processId]);

    useEffect(() => {
        void load();
    }, [load]);

    const updateSelected = useCallback(
        (patch: Partial<WorkViewConfigV1Stored>) => {
            if (!selected) return;
            setDrafts((prev) =>
                prev.map((row) => (row.id === selected.id ? { ...row, ...patch } : row)),
            );
        },
        [selected],
    );

    const addWorkView = () => {
        const label = "New work view";
        const row = createEmptyWorkViewDraft(label);
        row.id = slugifyWorkViewId(`${label}_${drafts.length + 1}`);
        row.display_order = drafts.length + 1;
        setDrafts((prev) => normalizeWorkViewsDisplayOrder([...prev, row]));
        setSelectedId(row.id);
    };

    const deleteSelected = () => {
        if (!selected || drafts.length <= 1) return;
        const next = drafts.filter((row) => row.id !== selected.id);
        setDrafts(normalizeWorkViewsDisplayOrder(next));
        setSelectedId(next[0]?.id ?? null);
    };

    const save = async () => {
        setSaving(true);
        setError(null);
        try {
            const enriched = enrichWorkViewsCompatQueueKeys(drafts, queueLanes);
            const res = await fetch("/api/admin/lifecycle-builder/process-work-views", {
                ...workspaceDataFetchInit(),
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    department_id: departmentId,
                    process_id: processId,
                    work_views_v1: enriched,
                }),
            });
            const json = (await res.json()) as WorkViewsResponse;
            if (!res.ok) throw new Error(json.error ?? "Save failed");
            const saved = normalizeWorkViewsDisplayOrder(json.work_views_v1 ?? enriched);
            setBaseline(saved);
            setDrafts(saved);
            setCompatibilitySeed(false);
            setSavedFlash(true);
            window.setTimeout(() => setSavedFlash(false), 2500);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Save failed");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="rounded-2xl border border-alloy-forge/10 bg-white p-8 text-sm text-alloy-midnight/50" data-testid="business-process-work-views-loading">
                Loading Work Views…
            </div>
        );
    }

    return (
        <div className="space-y-4" data-testid="business-process-work-views-workspace">
            <header className="rounded-2xl border border-alloy-pine/15 bg-alloy-pine/[0.05] px-5 py-4">
                <h3 className="text-lg font-semibold text-alloy-midnight">Work Views</h3>
                <p className="mt-1 max-w-3xl text-sm leading-relaxed text-alloy-midnight/60">
                    {BUSINESS_PROCESS_WORK_VIEWS_INTRO}
                </p>
                {compatibilitySeed ?
                    <p className="mt-2 text-xs text-alloy-midnight/50">{BUSINESS_PROCESS_WORK_VIEW_COMPAT_NOTE}</p>
                :   null}
            </header>

            {error ?
                <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                    {error}
                </p>
            :   null}

            <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                    type="button"
                    onClick={addWorkView}
                    className="rounded-xl bg-alloy-pine px-4 py-2 text-sm font-semibold text-white hover:bg-alloy-pine/90"
                    data-testid="business-process-add-work-view"
                >
                    + {BUSINESS_PROCESS_WORK_VIEW_ADD}
                </button>
                <div className="flex items-center gap-2">
                    {dirty ?
                        <span className="text-xs font-medium text-amber-800">Unsaved changes</span>
                    :   null}
                    {savedFlash ?
                        <span className="text-xs font-medium text-alloy-pine">Saved</span>
                    :   null}
                    <button
                        type="button"
                        disabled={!dirty || saving}
                        onClick={() => void save()}
                        className="rounded-xl border border-alloy-pine/30 bg-white px-4 py-2 text-sm font-semibold text-alloy-pine disabled:opacity-50"
                        data-testid="business-process-save-work-views"
                    >
                        {saving ? "Saving…" : "Save Work Views"}
                    </button>
                </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
                <div className="space-y-3">
                    {drafts.map((view) => (
                        <button
                            key={view.id}
                            type="button"
                            onClick={() => setSelectedId(view.id)}
                            className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors ${
                                selected?.id === view.id
                                    ? "border-alloy-pine/35 bg-alloy-pine/[0.07]"
                                    : "border-alloy-forge/10 bg-white hover:border-alloy-pine/20"
                            }`}
                            data-testid={`business-process-work-view-list-${view.id}`}
                        >
                            <p className="text-sm font-semibold text-alloy-midnight">{view.label}</p>
                            <p className="mt-1 text-[11px] text-alloy-midnight/50">
                                {(view.filters_v1?.length ?? 0)} condition{(view.filters_v1?.length ?? 0) === 1 ? "" : "s"}
                                · Order {view.display_order ?? 1}
                            </p>
                        </button>
                    ))}
                </div>

                <div>
                    {selected ?
                        <WorkViewProcessEditorCard
                            view={selected}
                            selected
                            departmentId={departmentId}
                            workUnitId={workUnitId}
                            layouts={layouts}
                            queueLanes={queueLanes}
                            onSelect={() => setSelectedId(selected.id)}
                            onChange={updateSelected}
                            onDelete={drafts.length > 1 ? deleteSelected : undefined}
                        />
                    :   null}
                </div>
            </div>
        </div>
    );
}
