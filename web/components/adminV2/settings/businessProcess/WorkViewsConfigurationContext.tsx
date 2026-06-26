"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";
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
    compatibility_seed?: boolean;
    error?: string;
};

type WorkViewsConfigurationContextValue = {
    drafts: WorkViewConfigV1Stored[];
    selected: WorkViewConfigV1Stored | null;
    selectedId: string | null;
    setSelectedId: (id: string) => void;
    layouts: EntityLayoutRecord[];
    loading: boolean;
    saving: boolean;
    dirty: boolean;
    error: string | null;
    compatibilitySeed: boolean;
    savedFlash: boolean;
    updateSelected: (patch: Partial<WorkViewConfigV1Stored>) => void;
    addWorkView: () => void;
    deleteSelected: () => void;
    save: () => Promise<void>;
};

const WorkViewsConfigurationContext = createContext<WorkViewsConfigurationContextValue | null>(null);

export function WorkViewsConfigurationProvider({
    departmentId,
    processId,
    queueLanes = [],
    enabled,
    children,
}: {
    departmentId: string;
    processId: string;
    queueLanes?: WorkViewCompatQueueLane[];
    enabled: boolean;
    children: ReactNode;
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
        if (!enabled) return;
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
    }, [departmentId, enabled, processId]);

    useEffect(() => {
        void load();
    }, [load]);

    const updateSelected = useCallback(
        (patch: Partial<WorkViewConfigV1Stored>) => {
            if (!selected) return;
            setDrafts((prev) => prev.map((row) => (row.id === selected.id ? { ...row, ...patch } : row)));
        },
        [selected],
    );

    const addWorkView = useCallback(() => {
        const label = "New work view";
        const row = createEmptyWorkViewDraft(label);
        row.id = slugifyWorkViewId(`${label}_${drafts.length + 1}`);
        row.display_order = drafts.length + 1;
        setDrafts((prev) => normalizeWorkViewsDisplayOrder([...prev, row]));
        setSelectedId(row.id);
    }, [drafts.length]);

    const deleteSelected = useCallback(() => {
        if (!selected || drafts.length <= 1) return;
        const next = drafts.filter((row) => row.id !== selected.id);
        setDrafts(normalizeWorkViewsDisplayOrder(next));
        setSelectedId(next[0]?.id ?? null);
    }, [drafts, selected]);

    const save = useCallback(async () => {
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
    }, [departmentId, drafts, processId, queueLanes]);

    const value = useMemo(
        (): WorkViewsConfigurationContextValue => ({
            drafts,
            selected,
            selectedId,
            setSelectedId,
            layouts,
            loading,
            saving,
            dirty,
            error,
            compatibilitySeed,
            savedFlash,
            updateSelected,
            addWorkView,
            deleteSelected,
            save,
        }),
        [
            addWorkView,
            compatibilitySeed,
            deleteSelected,
            dirty,
            drafts,
            error,
            layouts,
            loading,
            save,
            savedFlash,
            saving,
            selected,
            selectedId,
            updateSelected,
        ],
    );

    return (
        <WorkViewsConfigurationContext.Provider value={value}>{children}</WorkViewsConfigurationContext.Provider>
    );
}

export function useWorkViewsConfiguration(): WorkViewsConfigurationContextValue {
    const ctx = useContext(WorkViewsConfigurationContext);
    if (!ctx) throw new Error("useWorkViewsConfiguration requires WorkViewsConfigurationProvider");
    return ctx;
}
