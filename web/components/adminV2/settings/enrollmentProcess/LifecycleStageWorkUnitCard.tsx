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
    }, [pipeline?.id, pipeline?.name, builderStageKey]);

    const upsertWorkUnitQueue = useCallback(async () => {
        if (!builderStageKey) {
            setError("Select a stage before saving the work unit queue.");
            return false;
        }
        if (workUnitIdentityState === "conflict") {
            setError(
                "Multiple active queues share this stage identity. Use Runtime validation Repair to dedupe."
            );
            return false;
        }
        setSaving(true);
        setError(null);
        setFeedback(null);
        const savedKeys = stageSavedStatusKeys?.length ? [...stageSavedStatusKeys] : [];
        if (!savedKeys.length) {
            setError(
                `No saved status keys for stage "${builderStageKey}". Save statuses before saving the Work Unit Queue.`
            );
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
                throw new Error(j.error ?? "Failed to save Work Unit Queue");
            }
            const snapshot = j.pipeline ?? null;
            if (!snapshot?.id) {
                throw new Error("Work unit queue was not persisted.");
            }
            if (j.snapshot?.synced === false) {
                throw new Error("Queue filters are not synced to selected statuses.");
            }
            if (!guidedMode) {
                setFeedback(snapshot ? "Work Unit Queue saved." : "Work Unit Queue saved.");
            }
            await onPipelineUpdated(snapshot);
            return true;
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to save Work Unit Queue");
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
                if (guidedMode) return upsertWorkUnitQueue();
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
        }),
        [guidedMode, pipeline, nameDirty, canSave, upsertWorkUnitQueue, workUnitNeedsSync]
    );

    if (loadingPipeline) {
        return <p className="text-xs text-alloy-midnight/50">Loading…</p>;
    }

    return (
        <div className="space-y-2" data-testid="lifecycle-stage-work-unit-editor">
            {!guidedMode ? (
                <p className="text-[11px] leading-relaxed text-alloy-midnight/60" data-testid="lifecycle-work-unit-queue-copy">
                    This queue shows records that are currently in this stage.
                </p>
            ) : null}

            {uiState === "not_created" ? (
                <p className="text-[10px] text-alloy-midnight/55" data-testid="lifecycle-work-unit-state-not-created">
                    Queue not created for stage {stageLabel || builderStageKey}. Save to create{" "}
                    <span className="font-mono text-[9px]">{lifecycleStageWorkUnitKey(builderStageKey)}</span>.
                </p>
            ) : null}
            {uiState === "synced" ? (
                <p className="text-[10px] text-alloy-pine" data-testid="lifecycle-work-unit-state-synced">
                    Queue connected — filters match statuses selected for this stage.
                </p>
            ) : null}
            {uiState === "needs_sync" ? (
                <p className="text-[10px] text-amber-800/90" data-testid="lifecycle-work-unit-state-needs-sync">
                    Queue exists but filters are out of sync with selected statuses. Save to reconnect filters.
                </p>
            ) : null}
            {uiState === "conflict" ? (
                <p className="text-[10px] text-red-800" data-testid="lifecycle-work-unit-state-conflict">
                    Multiple active work unit rows share this stage key. Use Runtime validation Repair — do not create
                    another queue by display name.
                </p>
            ) : null}

            {error ? (
                <p className="text-xs text-red-700" role="alert">
                    {error}
                </p>
            ) : null}
            {feedback && !guidedMode ? <p className="text-xs text-alloy-pine">{feedback}</p> : null}

            <label className="block text-[11px] font-medium text-alloy-midnight/60">
                Work Unit Queue name
                <input
                    type="text"
                    className="mt-0.5 w-full rounded-md border border-alloy-forge/20 bg-white px-2 py-1 text-xs"
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    data-testid="lifecycle-work-unit-name"
                />
            </label>

            {statusLabelsForDisplay.length ? (
                <p className="text-[10px] text-alloy-midnight/50" data-testid="lifecycle-work-unit-status-filter">
                    Filtered by statuses: {statusLabelsForDisplay.join(", ")}
                </p>
            ) : (
                <p className="text-[10px] text-amber-800/80">Assign statuses in the previous step to set the queue filter.</p>
            )}

            {!guidedMode ? (
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
                        {saving ? "Saving…" : "Create Work Unit Queue"}
                    </button>
                )
            ) : null}

            {!guidedMode ? (
                <p className="text-[10px] text-alloy-midnight/45">
                    Advanced:{" "}
                    <Link
                        href={`/adminV2/settings/work-units?department_id=${encodeURIComponent(departmentId)}`}
                        className="text-alloy-pine hover:underline"
                    >
                        Work Units &amp; Queues
                    </Link>
                </p>
            ) : null}
        </div>
    );
});

export default LifecycleStageWorkUnitCard;
