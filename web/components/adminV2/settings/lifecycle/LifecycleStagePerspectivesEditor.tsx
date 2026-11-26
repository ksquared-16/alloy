"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
import {
    BUSINESS_PROCESS_PERSPECTIVES_INTRO,
    BUSINESS_PROCESS_PERSPECTIVES_NO_LANES_NOTE,
    BUSINESS_PROCESS_PERSPECTIVES_SINGLE_LANE_NOTE,
} from "@/lib/lifecycle/businessProcessUiLabels";
import WorkViewOperationalLensCard from "@/components/adminV2/settings/configurationRuntime/WorkViewOperationalLensCard";
import { derivePerspectiveLanesFromPipeline } from "@/lib/lifecycle/lifecycleStagePerspectiveLanes";
import {
    perspectiveDraftDirty,
    perspectiveDraftFromLanesAndSaved,
    perspectiveDraftToPersisted,
    type PerspectiveEditorDraftRow,
} from "@/lib/lifecycle/perspectiveConfigEditorModel";
import type { PerspectiveConfigV1Stored } from "@/lib/lifecycle/perspectiveConfigV1";
import {
    projectPerspectiveSortLabel,
    projectPerspectiveWorkIncludedChips,
} from "@/lib/lifecycle/perspectiveWorkIncludedProjection";
import type { EnrollmentPipelineWorkUnitSnapshot } from "@/lib/lifecycle/parseEnrollmentPipelineQueues";
import { buildOperationalViewPreviewRuntimeHref } from "@/lib/adminV2/runtime/perspective/mergeOperationalViewMetadata";

export type LifecycleStagePerspectivesEditorHandle = {
    getDraftPerspectives: () => PerspectiveConfigV1Stored[];
    isDirty: () => boolean;
};

function workUnitPreviewHref(
    departmentId: string,
    pipeline: EnrollmentPipelineWorkUnitSnapshot | null,
    queueKey: string,
): string | null {
    void departmentId;
    return buildOperationalViewPreviewRuntimeHref({
        workUnitKey: pipeline?.key ?? null,
        queueKey,
    });
}

const LifecycleStagePerspectivesEditor = forwardRef<
    LifecycleStagePerspectivesEditorHandle,
    {
        departmentId: string;
        pipeline: EnrollmentPipelineWorkUnitSnapshot | null;
        savedPerspectives: readonly PerspectiveConfigV1Stored[] | null | undefined;
        stageStatusLabels?: string[];
        loading?: boolean;
        onDirtyChange?: (dirty: boolean) => void;
    }
>(function LifecycleStagePerspectivesEditor(
    { departmentId, pipeline, savedPerspectives, stageStatusLabels, loading, onDirtyChange },
    ref,
) {
    const lanes = useMemo(() => derivePerspectiveLanesFromPipeline(pipeline), [pipeline]);
    const baseline = useMemo(
        () => perspectiveDraftFromLanesAndSaved(lanes, savedPerspectives),
        [lanes, savedPerspectives],
    );
    const [drafts, setDrafts] = useState<PerspectiveEditorDraftRow[]>(baseline);

    useEffect(() => {
        setDrafts(baseline);
    }, [baseline]);

    const dirty = useMemo(
        () => perspectiveDraftDirty(savedPerspectives, drafts, lanes),
        [savedPerspectives, drafts, lanes],
    );

    useEffect(() => {
        onDirtyChange?.(dirty);
    }, [dirty, onDirtyChange]);

    const updateRow = useCallback((queueKey: string, patch: Partial<PerspectiveEditorDraftRow>) => {
        setDrafts((prev) => prev.map((row) => (row.queue_key === queueKey ? { ...row, ...patch } : row)));
    }, []);

    useImperativeHandle(ref, () => ({
        getDraftPerspectives: () => perspectiveDraftToPersisted(drafts, lanes),
        isDirty: () => dirty,
    }));

    if (loading) {
        return <p className="text-xs text-alloy-midnight/50">Loading work views…</p>;
    }

    if (!lanes.length) {
        return (
            <p className="text-xs leading-relaxed text-alloy-midnight/55" data-testid="work-views-no-lanes">
                {BUSINESS_PROCESS_PERSPECTIVES_NO_LANES_NOTE}
            </p>
        );
    }

    return (
        <div className="space-y-3" data-testid="lifecycle-stage-work-views-editor">
            <p className="text-[11px] leading-relaxed text-alloy-midnight/55">{BUSINESS_PROCESS_PERSPECTIVES_INTRO}</p>

            {lanes.length === 1 ?
                <p className="text-[11px] text-alloy-midnight/50">{BUSINESS_PROCESS_PERSPECTIVES_SINGLE_LANE_NOTE}</p>
            :   null}

            <ul className="space-y-4">
                {drafts.map((row) => {
                    const workIncluded = projectPerspectiveWorkIncludedChips(
                        pipeline,
                        row.queue_key,
                        stageStatusLabels,
                    );
                    const sortLabel = projectPerspectiveSortLabel(pipeline, row.queue_key);
                    const previewHref = workUnitPreviewHref(departmentId, pipeline, row.queue_key);

                    return (
                        <li key={row.queue_key}>
                            <WorkViewOperationalLensCard
                                row={row}
                                workIncluded={workIncluded}
                                sortLabel={sortLabel}
                                previewHref={previewHref}
                                onUpdate={(patch) => updateRow(row.queue_key, patch)}
                            />
                        </li>
                    );
                })}
            </ul>
        </div>
    );
});

export default LifecycleStagePerspectivesEditor;
