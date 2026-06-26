"use client";

import Link from "next/link";
import LayoutAssignmentCard from "@/components/adminV2/settings/configurationRuntime/LayoutAssignmentCard";
import { ConfigRuntimeLensRow } from "@/components/adminV2/settings/configurationRuntime/ConfigurationRuntimePrimitives";
import WorkViewConditionEditor from "@/components/adminV2/settings/businessProcess/WorkViewConditionEditor";
import WorkViewSortRulesEditor, {
    normalizeWorkViewSorts,
    syncSortFields,
} from "@/components/adminV2/settings/businessProcess/WorkViewSortRulesEditor";
import {
    BUSINESS_PROCESS_SECTION_PURPOSE,
    BUSINESS_PROCESS_LENS_OPERATORS_SEE,
    BUSINESS_PROCESS_LENS_PREVIEW_RUNTIME,
    BUSINESS_PROCESS_LENS_PRESENTATION,
    BUSINESS_PROCESS_LENS_SORTED_BY,
    BUSINESS_PROCESS_LENS_VISIBLE_IN_WORK_UNIT,
    BUSINESS_PROCESS_WORK_VIEW_DEFAULT_ORDER,
    BUSINESS_PROCESS_WORK_VIEW_TECHNICAL_IDENTITY,
} from "@/lib/lifecycle/businessProcessUiLabels";
import { buildOperationalViewPreviewRuntimeHref } from "@/lib/adminV2/runtime/perspective/mergeOperationalViewMetadata";
import type { WorkViewCompatQueueLane } from "@/lib/lifecycle/workViewsRuntimeConvergence";
import type { WorkViewConfigV1Stored } from "@/lib/lifecycle/workViewsConfigV1";
import type { EntityLayoutRecord } from "@/lib/layout/layoutV2";
import { publishedLayoutOptionsForAssignmentSlot } from "@/lib/layout/layoutAssignmentLayoutOptions";

export default function WorkViewProcessEditorCard({
    view,
    selected,
    departmentId,
    workUnitId,
    layouts,
    queueLanes = [],
    onSelect,
    onChange,
    onDelete,
}: {
    view: WorkViewConfigV1Stored;
    selected: boolean;
    departmentId: string;
    workUnitId: string | null;
    layouts: EntityLayoutRecord[];
    queueLanes?: WorkViewCompatQueueLane[];
    onSelect: () => void;
    onChange: (patch: Partial<WorkViewConfigV1Stored>) => void;
    onDelete?: () => void;
}) {
    const queueOptions = publishedLayoutOptionsForAssignmentSlot(layouts, "queue_record");
    const drawerOptions = publishedLayoutOptionsForAssignmentSlot(layouts, "opportunity_drawer");
    const queueRecord = view.queue_layout_id ? layouts.find((l) => l.id === view.queue_layout_id) ?? null : null;
    const drawerRecord =
        view.focus_panel_layout_id ? layouts.find((l) => l.id === view.focus_panel_layout_id) ?? null : null;

    const previewHref =
        workUnitId ?
            buildOperationalViewPreviewRuntimeHref({
                departmentId,
                workUnitId,
                queueKey: view.compat_queue_key,
                workViewId: view.id,
                queueLayoutId: view.queue_layout_id,
                focusPanelLayoutId: view.focus_panel_layout_id,
            })
        :   null;

    const displayTitle = view.label.trim() || "Untitled work view";
    const sortRules = normalizeWorkViewSorts(view.sort_v1, view.sorts_v1);

    return (
        <article
            className="process-config-setup-card overflow-hidden"
            data-testid={`process-work-view-card-${view.id}`}
        >
            <header className="flex items-center gap-2 border-b border-alloy-stone/40 bg-white px-3 py-2">
                <div className="min-w-0 flex-1">
                    <h4 className="truncate text-sm font-semibold text-alloy-midnight">{displayTitle}</h4>
                </div>
                {selected ?
                    <span className="rounded-full bg-alloy-pine/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-alloy-pine">
                        Selected
                    </span>
                :   null}
                {onDelete ?
                    <button
                        type="button"
                        onClick={onDelete}
                        className="rounded px-2 py-0.5 text-[10px] font-medium text-alloy-midnight/45 hover:text-red-700"
                        data-testid={`process-work-view-delete-${view.id}`}
                    >
                        Delete
                    </button>
                :   null}
            </header>

            <div className="space-y-0 px-3 pb-3 [&_.config-runtime-lens-row]:border-alloy-stone/30 [&_.config-runtime-lens-row]:py-2">
                <ConfigRuntimeLensRow label={BUSINESS_PROCESS_LENS_OPERATORS_SEE}>
                    <input
                        type="text"
                        value={view.label}
                        onChange={(e) => onChange({ label: e.target.value })}
                        className="config-runtime-input"
                        data-testid={`process-work-view-label-${view.id}`}
                    />
                </ConfigRuntimeLensRow>

                <ConfigRuntimeLensRow label={BUSINESS_PROCESS_SECTION_PURPOSE}>
                    <textarea
                        value={view.mission ?? ""}
                        rows={2}
                        onChange={(e) => onChange({ mission: e.target.value })}
                        className="config-runtime-input leading-relaxed"
                        data-testid={`process-work-view-mission-${view.id}`}
                    />
                </ConfigRuntimeLensRow>

                <details className="group border-b border-alloy-stone/30 py-2" open>
                    <summary className="cursor-pointer list-none text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45 [&::-webkit-details-marker]:hidden">
                        Show work when…
                    </summary>
                    <div className="pt-2">
                        <WorkViewConditionEditor
                            filters={view.filters_v1 ?? []}
                            onChange={(filters_v1) => onChange({ filters_v1 })}
                        />
                    </div>
                </details>

                <ConfigRuntimeLensRow label={BUSINESS_PROCESS_LENS_SORTED_BY}>
                    <WorkViewSortRulesEditor
                        sorts={sortRules}
                        testIdPrefix={`process-work-view-${view.id}`}
                        onChange={(sorts) => onChange(syncSortFields(sorts))}
                    />
                </ConfigRuntimeLensRow>

                <details className="group border-b border-alloy-stone/30 py-2">
                    <summary className="cursor-pointer list-none text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45 [&::-webkit-details-marker]:hidden">
                        {BUSINESS_PROCESS_LENS_PRESENTATION}
                    </summary>
                    <div className="grid gap-2 pt-2" data-testid={`process-work-view-presentation-${view.id}`}>
                        <LayoutAssignmentCard
                            title="Queue layout"
                            subtitle="Work list presentation for this view."
                            selectedId={view.queue_layout_id ?? ""}
                            assignedRecord={queueRecord}
                            options={queueOptions}
                            allLayouts={layouts}
                            onChange={(queue_layout_id) => onChange({ queue_layout_id: queue_layout_id || undefined })}
                            testIdPrefix={`process-work-view-queue-${view.id}`}
                        />
                        <LayoutAssignmentCard
                            title="Focus panel layout"
                            subtitle="Selected record presentation for this view."
                            selectedId={view.focus_panel_layout_id ?? ""}
                            assignedRecord={drawerRecord}
                            options={drawerOptions}
                            allLayouts={layouts}
                            onChange={(focus_panel_layout_id) =>
                                onChange({ focus_panel_layout_id: focus_panel_layout_id || undefined })
                            }
                            testIdPrefix={`process-work-view-focus-${view.id}`}
                        />
                    </div>
                </details>

                <details className="group border-b border-alloy-stone/30 py-2">
                    <summary className="cursor-pointer list-none text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45 [&::-webkit-details-marker]:hidden">
                        Visibility & order
                    </summary>
                    <div className="flex flex-wrap items-center gap-5 pt-2">
                        <label className="flex items-center gap-2.5 text-sm text-alloy-midnight/80">
                            <input
                                type="checkbox"
                                checked={view.visible_in_runtime !== false}
                                onChange={(e) => onChange({ visible_in_runtime: e.target.checked })}
                                className="config-mode-control h-4 w-4 rounded border-alloy-stone/40"
                            />
                            {BUSINESS_PROCESS_LENS_VISIBLE_IN_WORK_UNIT}
                        </label>
                        <label className="flex items-center gap-2 text-sm text-alloy-midnight/75">
                            <span>{BUSINESS_PROCESS_WORK_VIEW_DEFAULT_ORDER}</span>
                            <input
                                type="number"
                                min={1}
                                value={view.display_order ?? 1}
                                onChange={(e) =>
                                    onChange({ display_order: Math.max(1, Number(e.target.value) || 1) })
                                }
                                className="config-runtime-input w-16 py-1"
                            />
                        </label>
                    </div>
                </details>

                {previewHref ?
                    <div className="pt-2">
                        <Link
                            href={previewHref}
                            className="config-runtime-preview-btn"
                            data-testid={`process-work-view-preview-${view.id}`}
                        >
                            {BUSINESS_PROCESS_LENS_PREVIEW_RUNTIME}
                        </Link>
                    </div>
                :   null}

                <details className="mt-2 rounded-lg border border-alloy-stone/40 bg-white px-3 py-2">
                    <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                        {BUSINESS_PROCESS_WORK_VIEW_TECHNICAL_IDENTITY}
                    </summary>
                    <div className="mt-2 space-y-2">
                        <p className="font-mono text-[10px] text-alloy-forge/70">Work view id: {view.id}</p>
                        {queueLanes.length ?
                            <label className="block text-[10px] text-alloy-forge/70">
                                Compatibility queue lane
                                <select
                                    value={view.compat_queue_key ?? ""}
                                    onChange={(e) => onChange({ compat_queue_key: e.target.value || undefined })}
                                    className="config-runtime-select mt-1 text-xs"
                                >
                                    <option value="">Not mapped</option>
                                    {queueLanes.map((lane) => (
                                        <option key={lane.queueKey} value={lane.queueKey}>
                                            {lane.label}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        :   null}
                    </div>
                </details>
            </div>
        </article>
    );
}
