"use client";

import Link from "next/link";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from "react";
import {
    FocusPanelLayoutPreviewThumbnail,
    QueueLayoutPreviewThumbnail,
} from "@/components/adminV2/settings/configurationRuntime/LayoutPresentationPreview";
import {
    BUSINESS_PROCESS_LENS_ADVANCED_IDENTITY,
    BUSINESS_PROCESS_LENS_MISSION,
    BUSINESS_PROCESS_LENS_OPEN_LAYOUTS,
    BUSINESS_PROCESS_LENS_OPERATORS_SEE,
    BUSINESS_PROCESS_LENS_PRESENTATION,
    BUSINESS_PROCESS_LENS_PREVIEW_RUNTIME,
    BUSINESS_PROCESS_LENS_SORTED_BY,
    BUSINESS_PROCESS_LENS_VISIBLE_IN_WORK_UNIT,
    BUSINESS_PROCESS_LENS_WORK_INCLUDED,
    BUSINESS_PROCESS_LENS_WORK_INCLUDED_NOTE,
    BUSINESS_PROCESS_PERSPECTIVES_INTRO,
    BUSINESS_PROCESS_PERSPECTIVES_NO_LANES_NOTE,
    BUSINESS_PROCESS_PERSPECTIVES_SINGLE_LANE_NOTE,
} from "@/lib/lifecycle/businessProcessUiLabels";
import {
    derivePerspectiveLanesFromPipeline,
    type PerspectiveLaneSource,
} from "@/lib/lifecycle/lifecycleStagePerspectiveLanes";
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
import { LAYOUTS_SETTINGS_HREF } from "@/lib/admin/canonicalAdminRoutes";

export type LifecycleStagePerspectivesEditorHandle = {
    getDraftPerspectives: () => PerspectiveConfigV1Stored[];
    isDirty: () => boolean;
};

function workUnitPreviewHref(departmentId: string, pipeline: EnrollmentPipelineWorkUnitSnapshot | null): string | null {
    const dept = departmentId.trim();
    const workUnitId = pipeline?.id?.trim();
    if (!dept || !workUnitId) return null;
    return `/adminV2/workspace/dept/${dept}/work-unit/${workUnitId}`;
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
    const previewHref = workUnitPreviewHref(departmentId, pipeline);

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
        return <p className="text-xs text-alloy-midnight/50">Loading queue lanes…</p>;
    }

    if (!lanes.length) {
        return (
            <p className="text-xs leading-relaxed text-alloy-midnight/55" data-testid="perspectives-no-lanes">
                {BUSINESS_PROCESS_PERSPECTIVES_NO_LANES_NOTE}
            </p>
        );
    }

    return (
        <div className="space-y-3" data-testid="lifecycle-stage-perspectives-editor">
            <p className="text-[11px] leading-relaxed text-alloy-midnight/55">{BUSINESS_PROCESS_PERSPECTIVES_INTRO}</p>

            {lanes.length === 1 ?
                <p className="text-[11px] text-alloy-midnight/50">{BUSINESS_PROCESS_PERSPECTIVES_SINGLE_LANE_NOTE}</p>
            :   null}

            <ul className="space-y-3">
                {drafts.map((row) => {
                    const workIncluded = projectPerspectiveWorkIncludedChips(
                        pipeline,
                        row.queue_key,
                        stageStatusLabels,
                    );
                    const sortLabel = projectPerspectiveSortLabel(pipeline, row.queue_key);

                    return (
                        <li
                            key={row.queue_key}
                            className="rounded-lg border border-alloy-forge/12 bg-alloy-stone/[0.03] p-3"
                            data-testid={`perspective-lens-${row.queue_key}`}
                        >
                            <div className="grid gap-3 lg:grid-cols-2">
                                <label className="block space-y-1">
                                    <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                                        {BUSINESS_PROCESS_LENS_OPERATORS_SEE}
                                    </span>
                                    <input
                                        type="text"
                                        value={row.label}
                                        onChange={(e) => updateRow(row.queue_key, { label: e.target.value })}
                                        className="w-full rounded-md border border-alloy-forge/15 bg-white px-2 py-1.5 text-xs text-alloy-midnight"
                                        data-testid={`perspective-label-${row.queue_key}`}
                                    />
                                </label>

                                <label className="block space-y-1 lg:col-span-2">
                                    <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                                        {BUSINESS_PROCESS_LENS_MISSION}
                                    </span>
                                    <textarea
                                        value={row.mission}
                                        rows={2}
                                        onChange={(e) => updateRow(row.queue_key, { mission: e.target.value })}
                                        className="w-full rounded-md border border-alloy-forge/15 bg-white px-2 py-1.5 text-xs text-alloy-midnight"
                                        data-testid={`perspective-mission-${row.queue_key}`}
                                    />
                                </label>

                                <div className="space-y-1">
                                    <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                                        {BUSINESS_PROCESS_LENS_WORK_INCLUDED}
                                    </span>
                                    <div className="flex flex-wrap gap-1">
                                        {workIncluded.map((chip) => (
                                            <span
                                                key={`${chip.field}-${chip.value}`}
                                                className="rounded-full border border-alloy-forge/10 bg-white px-2 py-0.5 text-[10px] text-alloy-midnight/70"
                                            >
                                                {chip.field} {chip.operator} {chip.value}
                                            </span>
                                        ))}
                                    </div>
                                    <p className="text-[10px] text-alloy-midnight/45">{BUSINESS_PROCESS_LENS_WORK_INCLUDED_NOTE}</p>
                                </div>

                                <div className="space-y-1">
                                    <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                                        {BUSINESS_PROCESS_LENS_SORTED_BY}
                                    </span>
                                    <p className="text-xs text-alloy-midnight/70">{sortLabel}</p>
                                </div>

                                <div className="space-y-2 lg:col-span-2">
                                    <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                                        {BUSINESS_PROCESS_LENS_PRESENTATION}
                                    </span>
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        <div>
                                            <QueueLayoutPreviewThumbnail label={row.label} />
                                            <Link
                                                href={LAYOUTS_SETTINGS_HREF}
                                                className="mt-1 inline-block text-[11px] font-medium text-alloy-pine hover:underline"
                                                data-testid={`perspective-queue-layout-link-${row.queue_key}`}
                                            >
                                                {BUSINESS_PROCESS_LENS_OPEN_LAYOUTS}
                                            </Link>
                                        </div>
                                        <div>
                                            <FocusPanelLayoutPreviewThumbnail label={row.label} />
                                            <Link
                                                href={LAYOUTS_SETTINGS_HREF}
                                                className="mt-1 inline-block text-[11px] font-medium text-alloy-pine hover:underline"
                                                data-testid={`perspective-drawer-layout-link-${row.queue_key}`}
                                            >
                                                {BUSINESS_PROCESS_LENS_OPEN_LAYOUTS}
                                            </Link>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center justify-between gap-2 lg:col-span-2">
                                    <label className="flex items-center gap-1.5 text-[11px] text-alloy-midnight/70">
                                        <input
                                            type="checkbox"
                                            checked={row.visible_in_rail}
                                            onChange={(e) =>
                                                updateRow(row.queue_key, { visible_in_rail: e.target.checked })
                                            }
                                            data-testid={`perspective-visible-${row.queue_key}`}
                                        />
                                        {BUSINESS_PROCESS_LENS_VISIBLE_IN_WORK_UNIT}
                                    </label>
                                    {previewHref ?
                                        <Link
                                            href={previewHref}
                                            className="text-[11px] font-medium text-alloy-pine hover:underline"
                                            data-testid={`perspective-preview-runtime-${row.queue_key}`}
                                        >
                                            {BUSINESS_PROCESS_LENS_PREVIEW_RUNTIME}
                                        </Link>
                                    :   null}
                                </div>
                            </div>

                            <details className="mt-3 rounded border border-alloy-forge/8 bg-white/60 px-2 py-1.5">
                                <summary className="cursor-pointer text-[10px] font-medium text-alloy-midnight/45">
                                    {BUSINESS_PROCESS_LENS_ADVANCED_IDENTITY}
                                </summary>
                                <p className="mt-1 font-mono text-[10px] text-alloy-midnight/45">
                                    Synced queue key: {row.queue_key}
                                    {row.grain ? ` · Grain: ${row.grain}` : ""}
                                    {!row.foundInDefinition ? " · Not synced yet" : ""}
                                </p>
                            </details>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
});

export default LifecycleStagePerspectivesEditor;
