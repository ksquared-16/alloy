"use client";

import Link from "next/link";
import LayoutAssignmentCard from "@/components/adminV2/settings/configurationRuntime/LayoutAssignmentCard";
import { ConfigRuntimeLensRow } from "@/components/adminV2/settings/configurationRuntime/ConfigurationRuntimePrimitives";
import WorkViewConditionEditor from "@/components/adminV2/settings/businessProcess/WorkViewConditionEditor";
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
import {
    WORK_VIEW_SORT_FIELD_OPTIONS,
    type WorkViewConfigV1Stored,
} from "@/lib/lifecycle/workViewsConfigV1";
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

    return (
        <article
            className="process-config-setup-card overflow-hidden"
            data-testid={`process-work-view-card-${view.id}`}
        >
            <header className="flex items-start gap-3 border-b border-alloy-forge/10 bg-alloy-pine/[0.04] px-4 py-3">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h4 className="truncate text-lg font-semibold text-alloy-midnight">{displayTitle}</h4>
                        {selected ?
                            <span className="rounded-full bg-alloy-pine/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-alloy-pine">
                                Active
                            </span>
                        :   null}
                    </div>
                    {view.mission ?
                        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-alloy-midnight/55">{view.mission}</p>
                    :   null}
                </div>
                {onDelete ?
                    <details className="relative shrink-0">
                        <summary className="cursor-pointer list-none rounded-md px-2 py-1 text-lg leading-none text-alloy-midnight/45 hover:bg-alloy-stone/10 [&::-webkit-details-marker]:hidden">
                            ⋯
                        </summary>
                        <div className="absolute right-0 z-10 mt-1 min-w-[8rem] rounded-lg border border-alloy-forge/12 bg-white py-1 shadow-md">
                            <button
                                type="button"
                                onClick={onDelete}
                                className="block w-full px-3 py-1.5 text-left text-xs font-medium text-red-700 hover:bg-red-50"
                                data-testid={`process-work-view-delete-${view.id}`}
                            >
                                Delete work view
                            </button>
                        </div>
                    </details>
                :   null}
            </header>

            <div className="grid gap-3 px-4 pb-4 pt-0 lg:grid-cols-[minmax(0,1fr)_16rem]">
                <div className="min-w-0 space-y-0 [&_.config-runtime-lens-row]:py-2.5 [&_.config-runtime-lens-row]:gap-2">
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

                    <ConfigRuntimeLensRow label="">
                        <WorkViewConditionEditor
                            filters={view.filters_v1 ?? []}
                            onChange={(filters_v1) => onChange({ filters_v1 })}
                        />
                    </ConfigRuntimeLensRow>

                    <ConfigRuntimeLensRow label={BUSINESS_PROCESS_LENS_SORTED_BY}>
                        <select
                            value={view.sort_v1?.field_key ?? "updated_at"}
                            onChange={(e) =>
                                onChange({
                                    sort_v1: {
                                        field_key: e.target.value,
                                        direction: view.sort_v1?.direction ?? "desc",
                                    },
                                })
                            }
                            className="config-runtime-select"
                            data-testid={`process-work-view-sort-${view.id}`}
                        >
                            {WORK_VIEW_SORT_FIELD_OPTIONS.map((opt) => (
                                <option key={opt.key} value={opt.key}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </ConfigRuntimeLensRow>
                </div>

                <aside className="min-w-0 space-y-0 border-t border-alloy-forge/10 pt-3 lg:border-l lg:border-t-0 lg:pl-4 lg:pt-0 [&_.config-runtime-lens-row]:py-2.5">
                    <ConfigRuntimeLensRow label={BUSINESS_PROCESS_LENS_PRESENTATION} className="border-b-0">
                        <div className="grid gap-2" data-testid={`process-work-view-presentation-${view.id}`}>
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
                    </ConfigRuntimeLensRow>

                    <ConfigRuntimeLensRow label="Visibility" className="border-b-0">
                        <div className="flex flex-wrap items-center gap-5">
                            <label className="flex items-center gap-2.5 text-sm text-alloy-midnight/80">
                                <input
                                    type="checkbox"
                                    checked={view.visible_in_runtime !== false}
                                    onChange={(e) => onChange({ visible_in_runtime: e.target.checked })}
                                    className="h-4 w-4 rounded border-alloy-forge/20 text-alloy-pine accent-alloy-pine"
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
                    </ConfigRuntimeLensRow>

                    {previewHref ?
                        <Link
                            href={previewHref}
                            className="config-runtime-preview-btn mt-4"
                            data-testid={`process-work-view-preview-${view.id}`}
                        >
                            {BUSINESS_PROCESS_LENS_PREVIEW_RUNTIME}
                        </Link>
                    :   <div className="mt-4 space-y-2 rounded-xl border border-dashed border-alloy-forge/15 px-4 py-3">
                            <p className="text-center text-xs text-alloy-midnight/50">
                                Map a compatibility queue lane in Advanced to enable preview runtime.
                            </p>
                            {queueLanes.length ?
                                <select
                                    value={view.compat_queue_key ?? ""}
                                    onChange={(e) => onChange({ compat_queue_key: e.target.value || undefined })}
                                    className="config-runtime-select text-xs"
                                    data-testid={`process-work-view-compat-queue-${view.id}`}
                                >
                                    <option value="">Choose queue lane…</option>
                                    {queueLanes.map((lane) => (
                                        <option key={lane.queueKey} value={lane.queueKey}>
                                            {lane.label}
                                        </option>
                                    ))}
                                </select>
                            :   null}
                        </div>}

                    <details className="mt-4 rounded-xl border border-alloy-forge/10 bg-alloy-stone/[0.03] px-4 py-3">
                        <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                            {BUSINESS_PROCESS_WORK_VIEW_TECHNICAL_IDENTITY}
                        </summary>
                        <div className="mt-2 space-y-2">
                            <p className="font-mono text-[10px] leading-relaxed text-alloy-midnight/45">
                                Work view id: {view.id}
                            </p>
                            {queueLanes.length ?
                                <label className="block text-[10px] text-alloy-midnight/50">
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
                </aside>
            </div>
        </article>
    );
}
