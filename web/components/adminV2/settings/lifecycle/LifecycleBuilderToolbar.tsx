"use client";

import { useCallback, useEffect, useState } from "react";
import type {
    LifecycleBuilderProcessRecord,
    LifecycleBuilderStageRecord,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

export default function LifecycleBuilderToolbar({
    departmentId,
    processes,
    activeProcess,
    stages,
    activeStageKey,
    onConfigUpdated,
    onStageSelect,
}: {
    departmentId: string;
    processes: LifecycleBuilderProcessRecord[];
    activeProcess: LifecycleBuilderProcessRecord;
    stages: LifecycleBuilderStageRecord[];
    activeStageKey: string;
    onConfigUpdated: () => void | Promise<void>;
    onStageSelect: (stageKey: string) => void;
}) {
    const [processNameDraft, setProcessNameDraft] = useState(activeProcess.name);
    const [newLifecycleName, setNewLifecycleName] = useState("");
    const [newStageName, setNewStageName] = useState("");
    const [editingStageId, setEditingStageId] = useState<string | null>(null);
    const [stageLabelDraft, setStageLabelDraft] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setProcessNameDraft(activeProcess.name);
    }, [activeProcess.id, activeProcess.name]);

    const patch = useCallback(
        async (body: Record<string, unknown>) => {
            setBusy(true);
            setError(null);
            try {
                const res = await fetch(
                    `/api/admin/departments/${encodeURIComponent(departmentId)}/lifecycle-builder`,
                    {
                        ...workspaceDataFetchInit(),
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(body),
                    }
                );
                const j = (await res.json().catch(() => ({}))) as { error?: string };
                if (!res.ok) throw new Error(j.error ?? "Save failed");
                await onConfigUpdated();
            } catch (e) {
                setError(e instanceof Error ? e.message : "Save failed");
            } finally {
                setBusy(false);
            }
        },
        [departmentId, onConfigUpdated]
    );

    const activeStage = stages.find((s) => s.key === activeStageKey);

    return (
        <div className="space-y-3" data-testid="lifecycle-builder-toolbar">
            {error ? (
                <p className="text-xs text-red-700" role="alert">
                    {error}
                </p>
            ) : null}

            <div className="flex flex-wrap items-end gap-3 rounded-xl border border-alloy-forge/12 bg-white/70 px-4 py-3">
                <label className="flex min-w-[10rem] flex-col gap-1 text-xs font-medium text-alloy-midnight/70">
                    Lifecycle
                    <select
                        className="rounded-md border border-alloy-forge/20 bg-white px-2 py-1.5 text-sm"
                        value={activeProcess.id}
                        disabled={busy}
                        onChange={(e) =>
                            void patch({ action: "set_active_process", process_id: e.target.value })
                        }
                        data-testid="lifecycle-process-select"
                    >
                        {processes.map((p) => (
                            <option key={p.id} value={p.id}>
                                {p.name}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="flex min-w-[10rem] flex-col gap-1 text-xs font-medium text-alloy-midnight/70">
                    Lifecycle name
                    <input
                        type="text"
                        className="rounded-md border border-alloy-forge/20 bg-white px-2 py-1.5 text-sm"
                        value={processNameDraft}
                        onChange={(e) => setProcessNameDraft(e.target.value)}
                        data-testid="lifecycle-process-name-input"
                    />
                </label>
                <button
                    type="button"
                    className="rounded-md border border-alloy-forge/20 bg-white px-2 py-1.5 text-[11px] font-medium disabled:opacity-50"
                    disabled={busy || processNameDraft.trim() === activeProcess.name}
                    onClick={() =>
                        void patch({
                            action: "update_process_name",
                            process_id: activeProcess.id,
                            name: processNameDraft.trim(),
                        })
                    }
                    data-testid="lifecycle-save-process-name"
                >
                    Save name
                </button>
            </div>

            <div className="flex flex-wrap items-end gap-2">
                <input
                    type="text"
                    placeholder="New lifecycle name"
                    className="min-w-[10rem] rounded-md border border-alloy-forge/20 bg-white px-2 py-1 text-xs"
                    value={newLifecycleName}
                    onChange={(e) => setNewLifecycleName(e.target.value)}
                    data-testid="lifecycle-create-name-input"
                />
                <button
                    type="button"
                    className="rounded-md bg-alloy-pine px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-50"
                    disabled={busy || !newLifecycleName.trim()}
                    onClick={async () => {
                        await patch({ action: "create_process", name: newLifecycleName.trim() });
                        setNewLifecycleName("");
                    }}
                    data-testid="lifecycle-create-lifecycle"
                >
                    Create Lifecycle
                </button>
                <input
                    type="text"
                    placeholder="New stage name"
                    className="min-w-[8rem] rounded-md border border-alloy-forge/20 bg-white px-2 py-1 text-xs"
                    value={newStageName}
                    onChange={(e) => setNewStageName(e.target.value)}
                    data-testid="lifecycle-add-stage-name-input"
                />
                <button
                    type="button"
                    className="rounded-md border border-alloy-forge/20 bg-white px-2.5 py-1 text-[11px] font-medium disabled:opacity-50"
                    disabled={busy || !newStageName.trim()}
                    onClick={async () => {
                        await patch({
                            action: "add_stage",
                            process_id: activeProcess.id,
                            label: newStageName.trim(),
                        });
                        setNewStageName("");
                    }}
                    data-testid="lifecycle-add-stage"
                >
                    Add Stage
                </button>
            </div>

            <div className="flex flex-wrap gap-1" role="tablist" aria-label="Lifecycle stage" data-testid="lifecycle-stage-tabs">
                {stages.map((stage, idx) => (
                    <div key={stage.id} className="flex items-center gap-0.5">
                        <button
                            type="button"
                            role="tab"
                            aria-selected={stage.key === activeStageKey}
                            className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                                stage.key === activeStageKey
                                    ? "bg-alloy-pine text-white"
                                    : "bg-alloy-stone/15 text-alloy-midnight/70 hover:bg-alloy-stone/25"
                            }`}
                            onClick={() => onStageSelect(stage.key)}
                            data-testid={`lifecycle-stage-tab-${stage.key}`}
                        >
                            {stage.label}
                        </button>
                        {stage.key === activeStageKey ? (
                            <>
                                <button
                                    type="button"
                                    title="Move stage earlier"
                                    className="rounded px-1 text-[10px] text-alloy-midnight/50 hover:bg-alloy-stone/20 disabled:opacity-30"
                                    disabled={busy || idx === 0}
                                    onClick={() =>
                                        void patch({
                                            action: "reorder_stage",
                                            process_id: activeProcess.id,
                                            stage_id: stage.id,
                                            direction: "up",
                                        })
                                    }
                                >
                                    ↑
                                </button>
                                <button
                                    type="button"
                                    title="Move stage later"
                                    className="rounded px-1 text-[10px] text-alloy-midnight/50 hover:bg-alloy-stone/20 disabled:opacity-30"
                                    disabled={busy || idx === stages.length - 1}
                                    onClick={() =>
                                        void patch({
                                            action: "reorder_stage",
                                            process_id: activeProcess.id,
                                            stage_id: stage.id,
                                            direction: "down",
                                        })
                                    }
                                >
                                    ↓
                                </button>
                            </>
                        ) : null}
                    </div>
                ))}
            </div>

            {activeStage ? (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                    {editingStageId === activeStage.id ? (
                        <>
                            <input
                                type="text"
                                className="rounded-md border border-alloy-forge/20 px-2 py-1"
                                value={stageLabelDraft}
                                onChange={(e) => setStageLabelDraft(e.target.value)}
                                data-testid="lifecycle-rename-stage-input"
                            />
                            <button
                                type="button"
                                className="rounded-md bg-alloy-pine px-2 py-1 text-[11px] text-white disabled:opacity-50"
                                disabled={busy || !stageLabelDraft.trim()}
                                onClick={async () => {
                                    await patch({
                                        action: "rename_stage",
                                        process_id: activeProcess.id,
                                        stage_id: activeStage.id,
                                        label: stageLabelDraft.trim(),
                                    });
                                    setEditingStageId(null);
                                }}
                                data-testid="lifecycle-rename-stage-save"
                            >
                                Save stage name
                            </button>
                            <button
                                type="button"
                                className="text-alloy-midnight/50"
                                onClick={() => setEditingStageId(null)}
                            >
                                Cancel
                            </button>
                        </>
                    ) : (
                        <button
                            type="button"
                            className="text-alloy-pine hover:underline"
                            onClick={() => {
                                setEditingStageId(activeStage.id);
                                setStageLabelDraft(activeStage.label);
                            }}
                            data-testid="lifecycle-rename-stage"
                        >
                            Rename stage
                        </button>
                    )}
                </div>
            ) : null}
        </div>
    );
}
