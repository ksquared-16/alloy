"use client";

import Link from "next/link";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { asOperatorStageKey } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { defaultWorkUnitQueueNameForStageKey } from "@/lib/lifecycle/lifecycleRuntimeBinding";
import type { EnrollmentPipelineWorkUnitSnapshot } from "@/lib/lifecycle/parseEnrollmentPipelineQueues";
import { stageQueueMappingForPipeline } from "@/lib/lifecycle/parseEnrollmentPipelineQueues";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

export type LifecycleStageWorkUnitCardHandle = {
    /** Create queue when missing, or save name when dirty. */
    save: () => Promise<boolean>;
    canSave: () => boolean;
};

const LifecycleStageWorkUnitCard = forwardRef<
    LifecycleStageWorkUnitCardHandle,
    {
        departmentId: string;
        activeStageKey: string;
        stageLabel: string;
        stageStatusDisplayLabels?: string[];
        /** @deprecated Use stageStatusDisplayLabels */
        stageStatusLabels?: string[];
        pipeline: EnrollmentPipelineWorkUnitSnapshot | null;
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
        stageStatusLabels,
        pipeline,
        loadingPipeline,
        onPipelineUpdated,
        guidedMode = false,
    },
    ref
) {
    const operatorStage = asOperatorStageKey(activeStageKey);
    const statusLabelsForDisplay = stageStatusDisplayLabels ?? stageStatusLabels ?? [];
    const [draftName, setDraftName] = useState("");
    const [saving, setSaving] = useState(false);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [feedback, setFeedback] = useState<string | null>(null);

    const queueMapping = useMemo(
        () => (operatorStage ? stageQueueMappingForPipeline(operatorStage, pipeline) : null),
        [operatorStage, pipeline]
    );

    useEffect(() => {
        setDraftName(
            pipeline?.name ?? (operatorStage ? defaultWorkUnitQueueNameForStageKey(activeStageKey) : "")
        );
        setFeedback(null);
        setError(null);
    }, [pipeline?.id, pipeline?.name, activeStageKey, operatorStage]);

    const createWorkUnit = useCallback(async () => {
        setCreating(true);
        setError(null);
        setFeedback(null);
        try {
            const res = await fetch("/api/admin/enrollment-process/stage-work-unit", {
                ...workspaceDataFetchInit(),
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    department_id: departmentId,
                    name: draftName.trim(),
                    ...(operatorStage ? { stage: operatorStage } : {}),
                }),
            });
            const j = (await res.json().catch(() => ({}))) as {
                error?: string;
                snapshot?: EnrollmentPipelineWorkUnitSnapshot | null;
            };
            if (!res.ok) throw new Error(j.error ?? "Failed to create Work Unit Queue");
            if (!guidedMode) setFeedback("Work Unit Queue created.");
            await onPipelineUpdated(j.snapshot ?? null);
            return true;
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to create Work Unit Queue");
            return false;
        } finally {
            setCreating(false);
        }
    }, [departmentId, draftName, operatorStage, onPipelineUpdated, guidedMode]);

    const saveName = useCallback(async () => {
        if (!pipeline) return false;
        setSaving(true);
        setError(null);
        setFeedback(null);
        try {
            const res = await fetch("/api/admin/enrollment-process/stage-work-unit", {
                ...workspaceDataFetchInit(),
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ work_unit_id: pipeline.id, name: draftName.trim() }),
            });
            const j = (await res.json().catch(() => ({}))) as {
                error?: string;
                snapshot?: EnrollmentPipelineWorkUnitSnapshot | null;
            };
            if (!res.ok) throw new Error(j.error ?? "Failed to save name");
            if (!guidedMode) setFeedback("Name saved.");
            await onPipelineUpdated(j.snapshot ?? pipeline);
            return true;
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to save name");
            return false;
        } finally {
            setSaving(false);
        }
    }, [pipeline, draftName, onPipelineUpdated, guidedMode]);

    const nameDirty = pipeline ? draftName.trim() !== pipeline.name : false;
    const canSave = pipeline ? nameDirty && Boolean(draftName.trim()) : Boolean(draftName.trim());

    useImperativeHandle(
        ref,
        () => ({
            save: async () => {
                if (pipeline) {
                    if (!nameDirty) return true;
                    return saveName();
                }
                return createWorkUnit();
            },
            canSave: () => canSave,
        }),
        [pipeline, nameDirty, canSave, saveName, createWorkUnit]
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
                pipeline && queueMapping ? (
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            className="rounded-md border border-alloy-forge/20 bg-white px-2 py-1 text-[11px] font-medium disabled:opacity-50"
                            disabled={saving || !nameDirty || !draftName.trim()}
                            onClick={() => void saveName()}
                            data-testid="lifecycle-work-unit-save-name"
                        >
                            {saving ? "Saving…" : "Save name"}
                        </button>
                    </div>
                ) : (
                    <button
                        type="button"
                        className="rounded-md bg-alloy-pine px-2 py-1 text-[11px] font-medium text-white disabled:opacity-50"
                        disabled={creating || !departmentId || !draftName.trim()}
                        onClick={() => void createWorkUnit()}
                        data-testid="lifecycle-create-work-unit"
                    >
                        {creating ? "Creating…" : "Create Work Unit Queue"}
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
