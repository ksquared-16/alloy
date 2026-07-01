"use client";

import Link from "next/link";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { asOperatorStageKey } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { lifecycleStageWorkUnitKey } from "@/lib/lifecycle/lifecycleStageWorkUnit";
import { defaultWorkUnitQueueNameForStageKey } from "@/lib/lifecycle/lifecycleRuntimeBinding";
import type { EnrollmentPipelineWorkUnitSnapshot } from "@/lib/lifecycle/parseEnrollmentPipelineQueues";
import { stageQueueMappingForPipeline } from "@/lib/lifecycle/parseEnrollmentPipelineQueues";
import { LIFECYCLE_STAGE_RUNTIME_CONFIG_PATH } from "@/lib/lifecycle/lifecycleStageRuntimeConfigTypes";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

export type LifecycleStageWorkUnitCardHandle = {
    /** Upsert stage queue (create or update) and sync filters when needed. */
    save: () => Promise<boolean>;
    canSave: () => boolean;
    getDisplayName: () => string;
};

export type LifecycleStageWorkUnitIdentityUiState =
    | "not_created"
    | "synced"
    | "needs_sync"
    | "conflict";

const LifecycleStageWorkUnitCard = forwardRef<
    LifecycleStageWorkUnitCardHandle,
    {
        departmentId: string;
        activeStageKey: string;
        stageLabel: string;
        stageStatusDisplayLabels?: string[];
        /** Saved status keys for this stage (written to queue_definition on save). */
        stageSavedStatusKeys?: readonly string[];
        /** @deprecated Use stageStatusDisplayLabels */
        stageStatusLabels?: string[];
        pipeline: EnrollmentPipelineWorkUnitSnapshot | null;
        workUnitIdentityState?: LifecycleStageWorkUnitIdentityUiState;
        workUnitNeedsSync?: boolean;
        loadingPipeline: boolean;
        onPipelineUpdated: (snapshot: EnrollmentPipelineWorkUnitSnapshot | null) => void | Promise<void>;
        /** Guided board — save only via card footer. */
        guidedMode?: boolean;
        /** Stage workspace — display name only; save via Save stage. */
        workspaceMode?: boolean;
        onDraftNameDirtyChange?: (dirty: boolean) => void;
    }
>(function LifecycleStageWorkUnitCard(
    {
        departmentId,
        activeStageKey,
        stageLabel,
        stageStatusDisplayLabels,
        stageSavedStatusKeys,
        stageStatusLabels,
        pipeline,
        workUnitIdentityState = "not_created",
        workUnitNeedsSync = false,
        loadingPipeline,
        onPipelineUpdated,
        guidedMode = false,
        workspaceMode = false,
        onDraftNameDirtyChange,
    },
    ref
) {
    const operatorStage = asOperatorStageKey(activeStageKey);
    const builderStageKey = activeStageKey.trim();
    const statusLabelsForDisplay = stageStatusDisplayLabels ?? stageStatusLabels ?? [];
    const [draftName, setDraftName] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<string | null>(null);

    const queueMapping = useMemo(
        () => (operatorStage ? stageQueueMappingForPipeline(operatorStage, pipeline) : null),
        [operatorStage, pipeline]
    );

    const uiState: LifecycleStageWorkUnitIdentityUiState =
        workUnitIdentityState === "conflict"
            ? "conflict"
            : !pipeline?.id
              ? "not_created"
              : workUnitNeedsSync || workUnitIdentityState === "needs_sync"
                ? "needs_sync"
                : workUnitIdentityState === "synced"
                  ? "synced"
                  : pipeline?.id
                    ? "synced"
                    : "not_created";

    useEffect(() => {
        setDraftName(
            pipeline?.name ??
                (builderStageKey ? defaultWorkUnitQueueNameForStageKey(builderStageKey) : "")
        );
        setFeedback(null);
        setError(null);
        onDraftNameDirtyChange?.(false);
    }, [pipeline?.id, pipeline?.name, builderStageKey, onDraftNameDirtyChange]);

    useEffect(() => {
        if (!pipeline) {
            onDraftNameDirtyChange?.(false);
            return;
        }
        onDraftNameDirtyChange?.(draftName.trim() !== (pipeline.name ?? "").trim());
    }, [draftName, pipeline, onDraftNameDirtyChange]);

    const upsertWorkUnitQueue = useCallback(async () => {
        if (!builderStageKey) {
            setError("Select a stage before saving the queue view.");
            return false;
        }
        if (workUnitIdentityState === "conflict") {
            setError(
                "Multiple queues were found for this stage. Open Ready check and use Fix setup."
            );
            return false;
        }
        setSaving(true);
        setError(null);
        setFeedback(null);
        const savedKeys = stageSavedStatusKeys?.length ? [...stageSavedStatusKeys] : [];
        if (!savedKeys.length) {
            setError(`Select at least one status for this stage before saving.`);
            return false;
        }
        try {
            const res = await fetch(LIFECYCLE_STAGE_RUNTIME_CONFIG_PATH, {
                ...workspaceDataFetchInit(),
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    department_id: departmentId,
                    stage_key: builderStageKey,
                    selected_status_keys: savedKeys,
                    work_unit_name: draftName.trim(),
                }),
            });
            const j = (await res.json().catch(() => ({}))) as {
                error?: string;
                pipeline?: EnrollmentPipelineWorkUnitSnapshot | null;
                snapshot?: { synced?: boolean };
            };
            if (!res.ok) {
                throw new Error(j.error ?? "Failed to save queue view");
            }
            const snapshot = j.pipeline ?? null;
            if (!snapshot?.id) {
                throw new Error("Queue view was not published.");
            }
            if (j.snapshot?.synced === false) {
                throw new Error("Queue view is out of date — save the stage again.");
            }
            if (!guidedMode && !workspaceMode) {
                setFeedback("Queue view saved.");
            }
            await onPipelineUpdated(snapshot);
            return true;
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to save queue view");
            return false;
        } finally {
            setSaving(false);
        }
    }, [
        departmentId,
        draftName,
        builderStageKey,
        stageSavedStatusKeys,
        workUnitIdentityState,
        onPipelineUpdated,
        guidedMode,
    ]);

    const nameDirty = pipeline ? draftName.trim() !== pipeline.name : false;
    const canSave =
        Boolean(draftName.trim()) &&
        workUnitIdentityState !== "conflict" &&
        Boolean(builderStageKey) &&
        (stageSavedStatusKeys?.length ?? 0) > 0;

    useImperativeHandle(
        ref,
        () => ({
            save: async () => {
                if (workspaceMode || guidedMode) return upsertWorkUnitQueue();
                if (pipeline) {
                    if (!nameDirty) {
                        if (workUnitNeedsSync) return upsertWorkUnitQueue();
                        return true;
                    }
                    return upsertWorkUnitQueue();
                }
                return upsertWorkUnitQueue();
            },
            canSave: () => canSave,
            getDisplayName: () => draftName.trim(),
        }),
        [guidedMode, workspaceMode, pipeline, nameDirty, canSave, upsertWorkUnitQueue, workUnitNeedsSync, draftName]
    );

    if (loadingPipeline) {
        return <p className="text-xs text-alloy-midnight/50">Loading…</p>;
    }

    return (
        <div className="space-y-2" data-testid="lifecycle-stage-work-unit-editor">
            {!guidedMode && !workspaceMode ? (
                <p className="text-[11px] leading-relaxed text-alloy-midnight/60" data-testid="lifecycle-queue-view-copy">
                    This queue view shows records that are currently in this stage.
                </p>
            ) : null}

            {uiState === "not_created" ? (
                <p className="text-[10px] text-alloy-midnight/55" data-testid="lifecycle-queue-view-unpublished">
                    Queue view not published yet. Save this stage to publish it for staff.
                </p>
            ) : null}
            {uiState === "synced" ? (
                <p className="text-[10px] text-alloy-pine" data-testid="lifecycle-queue-view-current">
                    Queue view is up to date with your status selections.
                </p>
            ) : null}
            {uiState === "needs_sync" ? (
                <p className="text-[10px] text-amber-800/90" data-testid="lifecycle-queue-view-out-of-date">
                    Queue view is out of date with your status selections. Save this stage to update it.
                </p>
            ) : null}
            {uiState === "conflict" ? (
                <p className="text-[10px] text-red-800" data-testid="lifecycle-queue-view-conflict">
                    Multiple queue views were found for this stage. Use Fix setup in Ready check — do not create
                    another queue by display name.
                </p>
            ) : null}

            {error ? (
                <p className="text-xs text-red-700" role="alert">
                    {error}
                </p>
            ) : null}
            {feedback && !guidedMode && !workspaceMode ? <p className="text-xs text-alloy-pine">{feedback}</p> : null}

            <label className="block text-[11px] font-medium text-alloy-midnight/60">
                Queue display name
                <input
                    type="text"
                    className="mt-0.5 w-full rounded-md border border-alloy-forge/20 bg-white px-2 py-1 text-xs"
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    data-testid="lifecycle-work-unit-name"
                />
            </label>

            {statusLabelsForDisplay.length ? (
                <p className="text-[10px] text-alloy-midnight/50" data-testid="lifecycle-queue-view-status-filter">
                    Includes statuses: {statusLabelsForDisplay.join(", ")}
                </p>
            ) : (
                <p className="text-[10px] text-amber-800/80">
                    Select statuses above to preview which records appear in this queue view.
                </p>
            )}

            {!guidedMode && !workspaceMode ? (
                pipeline && queueMapping && uiState !== "not_created" ? (
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            className="rounded-md border border-alloy-forge/20 bg-white px-2 py-1 text-[11px] font-medium disabled:opacity-50"
                            disabled={saving || !canSave}
                            onClick={() => void upsertWorkUnitQueue()}
                            data-testid="lifecycle-work-unit-save-name"
                        >
                            {saving ? "Saving…" : "Save queue"}
                        </button>
                    </div>
                ) : (
                    <button
                        type="button"
                        className="rounded-md bg-alloy-pine px-2 py-1 text-[11px] font-medium text-white disabled:opacity-50"
                        disabled={saving || !canSave}
                        onClick={() => void upsertWorkUnitQueue()}
                        data-testid="lifecycle-create-work-unit"
                    >
                        {saving ? "Saving…" : pipeline ? "Save queue view" : "Publish queue view"}
                    </button>
                )
            ) : null}

            {!guidedMode && !workspaceMode ? (
                <p className="text-[10px] text-alloy-midnight/45">
                    Advanced:{" "}
                    <Link
                        href={`/settings/work-units?department_id=${encodeURIComponent(departmentId)}`}
                        className="text-alloy-pine hover:underline"
                    >
                        Queue settings
                    </Link>
                </p>
            ) : null}
        </div>
    );
});

export default LifecycleStageWorkUnitCard;
