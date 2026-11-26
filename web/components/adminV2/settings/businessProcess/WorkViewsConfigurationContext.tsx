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
import type { WorkViewFilterOption } from "@/lib/lifecycle/workViewFilterValueControls";

type WorkViewsResponse = {
    work_views_v1?: WorkViewConfigV1Stored[];
    compatibility_seed?: boolean;
    stages?: WorkViewFilterOption[];
    /** Where the draft stood when this response was produced — the CAS token. */
    configuration_state?: { draft_revision?: number };
    /** The token minted by a save, so the next save presents a current one. */
    draft?: { draft_revision?: number };
    error?: string;
};

type WorkViewsConfigurationContextValue = {
    drafts: WorkViewConfigV1Stored[];
    selected: WorkViewConfigV1Stored | null;
    selectedId: string | null;
    setSelectedId: (id: string) => void;
    layouts: EntityLayoutRecord[];
    /** Typed "Opportunity Stage" options — the process's configured lifecycle stages. */
    stageOptions: WorkViewFilterOption[];
    loading: boolean;
    saving: boolean;
    dirty: boolean;
    error: string | null;
    compatibilitySeed: boolean;
    savedFlash: boolean;
    updateSelected: (patch: Partial<WorkViewConfigV1Stored>) => void;
    addWorkView: () => void;
    deleteSelected: () => void;
    /** Returns true when the draft save succeeded. */
    save: () => Promise<boolean>;
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
    const [stageOptions, setStageOptions] = useState<WorkViewFilterOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [compatibilitySeed, setCompatibilitySeed] = useState(false);
    const [savedFlash, setSavedFlash] = useState(false);
    /**
     * The draft token this editor loaded.
     *
     * Sending it back makes the save a compare-and-set, so a colleague who saved between our load
     * and our save produces a conflict the operator can see instead of silently losing their work.
     * Null means we never got one and the server must fall back to its own read.
     */
    const [draftRevision, setDraftRevision] = useState<number | null>(null);

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
            setStageOptions(viewsJson.stages ?? []);
            setDraftRevision(viewsJson.configuration_state?.draft_revision ?? null);
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
                    ...(draftRevision != null ? { draft_revision: draftRevision } : {}),
                }),
            });
            const json = (await res.json()) as WorkViewsResponse;
            if (!res.ok) throw new Error(json.error ?? "Save failed");
            // Advance to the token the server just minted; without this the NEXT save would
            // present a stale token and conflict with our own write.
            if (json.draft?.draft_revision != null) setDraftRevision(json.draft.draft_revision);
            const saved = normalizeWorkViewsDisplayOrder(json.work_views_v1 ?? enriched);
            setBaseline(saved);
            setDrafts(saved);
            setCompatibilitySeed(false);
            setSavedFlash(true);
            window.setTimeout(() => setSavedFlash(false), 2500);
            return true;
        } catch (e) {
            setError(e instanceof Error ? e.message : "Save failed");
            return false;
        } finally {
            setSaving(false);
        }
    }, [departmentId, draftRevision, drafts, processId, queueLanes]);

    const value = useMemo(
        (): WorkViewsConfigurationContextValue => ({
            drafts,
            selected,
            selectedId,
            setSelectedId,
            layouts,
            stageOptions,
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
            stageOptions,
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
