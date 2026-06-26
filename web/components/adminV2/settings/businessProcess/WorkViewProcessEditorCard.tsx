"use client";

import Link from "next/link";
import {
    FocusPanelLayoutPreviewThumbnail,
    QueueLayoutPreviewThumbnail,
} from "@/components/adminV2/settings/configurationRuntime/LayoutPresentationPreview";
import WorkViewConditionEditor from "@/components/adminV2/settings/businessProcess/WorkViewConditionEditor";
import {
    BUSINESS_PROCESS_LENS_MISSION,
    BUSINESS_PROCESS_LENS_OPERATORS_SEE,
    BUSINESS_PROCESS_LENS_OPEN_LAYOUTS,
    BUSINESS_PROCESS_LENS_PREVIEW_RUNTIME,
    BUSINESS_PROCESS_LENS_PRESENTATION,
    BUSINESS_PROCESS_LENS_VISIBLE_IN_WORK_UNIT,
    BUSINESS_PROCESS_PRESENTATION_CHANGE,
    BUSINESS_PROCESS_WORK_VIEW_DEFAULT_ORDER,
    BUSINESS_PROCESS_WORK_VIEW_TECHNICAL_IDENTITY,
} from "@/lib/lifecycle/businessProcessUiLabels";
import { LAYOUTS_SETTINGS_HREF } from "@/lib/admin/canonicalAdminRoutes";
import { buildOperationalViewPreviewRuntimeHref } from "@/lib/adminV2/runtime/perspective/mergeOperationalViewMetadata";
import type { WorkViewCompatQueueLane } from "@/lib/lifecycle/workViewsRuntimeConvergence";
import {
    WORK_VIEW_SORT_FIELD_OPTIONS,
    type WorkViewConfigV1Stored,
} from "@/lib/lifecycle/workViewsConfigV1";
import { formatLayoutTitleWithVersion } from "@/lib/layout/layoutVersionNaming";
import type { EntityLayoutRecord } from "@/lib/layout/layoutV2";
import { publishedLayoutOptionsForAssignmentSlot } from "@/lib/layout/layoutAssignmentLayoutOptions";

function layoutLabel(record: EntityLayoutRecord | null): string {
    if (!record) return "Surface default";
    return formatLayoutTitleWithVersion(record.name, record.version);
}

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
    const drawerRecord = view.focus_panel_layout_id ? layouts.find((l) => l.id === view.focus_panel_layout_id) ?? null : null;

    const previewHref =
        view.compat_queue_key && workUnitId ?
            buildOperationalViewPreviewRuntimeHref({
                departmentId,
                workUnitId,
                queueKey: view.compat_queue_key,
                workViewId: view.id,
                queueLayoutId: view.queue_layout_id,
                focusPanelLayoutId: view.focus_panel_layout_id,
            })
        :   null;

    return (
        <article
            className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition-colors ${
                selected ? "border-alloy-pine/35 ring-1 ring-alloy-pine/20" : "border-alloy-forge/12"
            }`}
            data-testid={`process-work-view-card-${view.id}`}
        >
            <button
                type="button"
                onClick={onSelect}
                className="flex w-full items-start gap-3 border-b border-alloy-forge/8 bg-alloy-pine/[0.04] px-5 py-4 text-left"
            >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-alloy-pine text-sm font-semibold text-white">
                    WV
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-pine/80">Work View</p>
                    <h4 className="truncate text-base font-semibold text-alloy-midnight">{view.label || "Untitled work view"}</h4>
                    {view.mission ?
                        <p className="mt-1 line-clamp-2 text-xs text-alloy-midnight/55">{view.mission}</p>
                    :   null}
                </div>
            </button>

            {selected ?
                <div className="space-y-0 px-5 pb-5 pt-2">
                    <Section label={BUSINESS_PROCESS_LENS_OPERATORS_SEE}>
                        <input
                            type="text"
                            value={view.label}
                            onChange={(e) => onChange({ label: e.target.value })}
                            className="w-full rounded-xl border border-alloy-forge/12 bg-[#FAFBFC] px-3 py-2.5 text-sm"
                            data-testid={`process-work-view-label-${view.id}`}
                        />
                    </Section>

                    <Section label={BUSINESS_PROCESS_LENS_MISSION}>
                        <textarea
                            value={view.mission ?? ""}
                            rows={2}
                            onChange={(e) => onChange({ mission: e.target.value })}
                            className="w-full rounded-xl border border-alloy-forge/12 bg-[#FAFBFC] px-3 py-2.5 text-sm leading-relaxed"
                            data-testid={`process-work-view-mission-${view.id}`}
                        />
                    </Section>

                    <Section label="">
                        <WorkViewConditionEditor
                            filters={view.filters_v1 ?? []}
                            onChange={(filters_v1) => onChange({ filters_v1 })}
                        />
                    </Section>

                    <Section label="Sorted by">
                        <div className="grid gap-2 sm:grid-cols-2">
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
                                className="w-full rounded-xl border border-alloy-forge/12 bg-white px-3 py-2.5 text-sm"
                                data-testid={`process-work-view-sort-${view.id}`}
                            >
                                {WORK_VIEW_SORT_FIELD_OPTIONS.map((opt) => (
                                    <option key={opt.key} value={opt.key}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                            <select
                                value={view.sort_v1?.direction ?? "desc"}
                                onChange={(e) =>
                                    onChange({
                                        sort_v1: {
                                            field_key: view.sort_v1?.field_key ?? "updated_at",
                                            direction: e.target.value === "asc" ? "asc" : "desc",
                                        },
                                    })
                                }
                                className="w-full rounded-xl border border-alloy-forge/12 bg-white px-3 py-2.5 text-sm"
                                data-testid={`process-work-view-sort-direction-${view.id}`}
                            >
                                <option value="desc">Newest first</option>
                                <option value="asc">Oldest first</option>
                            </select>
                        </div>
                    </Section>

                    <Section label={BUSINESS_PROCESS_LENS_PRESENTATION}>
                        <div className="grid gap-3 lg:grid-cols-2">
                            <PresentationRow
                                title="Queue (work list)"
                                subtitle="Operators see and pick work from a list."
                                preview={<QueueLayoutPreviewThumbnail label={layoutLabel(queueRecord)} />}
                                layoutName={layoutLabel(queueRecord)}
                                options={queueOptions}
                                selectedId={view.queue_layout_id ?? ""}
                                onChange={(queue_layout_id) => onChange({ queue_layout_id })}
                                testIdPrefix={`process-work-view-queue-${view.id}`}
                            />
                            <PresentationRow
                                title="Focus panel (work details)"
                                subtitle="Operators view and act on the selected record."
                                preview={<FocusPanelLayoutPreviewThumbnail label={layoutLabel(drawerRecord)} />}
                                layoutName={layoutLabel(drawerRecord)}
                                options={drawerOptions}
                                selectedId={view.focus_panel_layout_id ?? ""}
                                onChange={(focus_panel_layout_id) => onChange({ focus_panel_layout_id })}
                                testIdPrefix={`process-work-view-focus-${view.id}`}
                            />
                        </div>
                    </Section>

                    <Section label="Visibility">
                        <div className="flex flex-wrap items-center gap-4">
                            <label className="flex items-center gap-2 text-sm text-alloy-midnight/75">
                                <input
                                    type="checkbox"
                                    checked={view.visible_in_runtime !== false}
                                    onChange={(e) => onChange({ visible_in_runtime: e.target.checked })}
                                    className="h-4 w-4 rounded border-alloy-forge/20 text-alloy-pine"
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
                                    className="w-16 rounded-lg border border-alloy-forge/12 px-2 py-1 text-sm"
                                />
                            </label>
                        </div>
                    </Section>

                    {previewHref ?
                        <Link
                            href={previewHref}
                            className="mt-4 flex w-full items-center justify-center rounded-xl border border-alloy-pine/35 px-4 py-3 text-sm font-semibold text-alloy-pine hover:bg-alloy-pine/[0.05]"
                            data-testid={`process-work-view-preview-${view.id}`}
                        >
                            {BUSINESS_PROCESS_LENS_PREVIEW_RUNTIME}
                        </Link>
                    :   <div className="mt-4 space-y-2 rounded-xl border border-dashed border-alloy-forge/15 px-4 py-3">
                            <p className="text-center text-xs text-alloy-midnight/50">
                                Select a compatibility queue lane in Advanced to enable preview runtime.
                            </p>
                            {queueLanes.length ?
                                <select
                                    value={view.compat_queue_key ?? ""}
                                    onChange={(e) => onChange({ compat_queue_key: e.target.value || undefined })}
                                    className="w-full rounded-lg border border-alloy-forge/12 bg-white px-2 py-1.5 text-xs"
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
                                        className="mt-1 w-full rounded-lg border border-alloy-forge/12 bg-white px-2 py-1.5 text-xs"
                                    >
                                        <option value="">Not mapped</option>
                                        {queueLanes.map((lane) => (
                                            <option key={lane.queueKey} value={lane.queueKey}>
                                                {lane.label} ({lane.queueKey})
                                            </option>
                                        ))}
                                    </select>
                                </label>
                            :   null}
                            {onDelete ?
                                <button
                                    type="button"
                                    onClick={onDelete}
                                    className="text-xs font-medium text-red-700 hover:underline"
                                    data-testid={`process-work-view-delete-${view.id}`}
                                >
                                    Delete work view
                                </button>
                            :   null}
                        </div>
                    </details>
                </div>
            :   null}
        </article>
    );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="border-b border-alloy-forge/8 py-4 last:border-b-0">
            {label ?
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">{label}</p>
            :   null}
            {children}
        </div>
    );
}

function PresentationRow({
    title,
    subtitle,
    preview,
    layoutName,
    options,
    selectedId,
    onChange,
    testIdPrefix,
}: {
    title: string;
    subtitle: string;
    preview: React.ReactNode;
    layoutName: string;
    options: EntityLayoutRecord[];
    selectedId: string;
    onChange: (layoutId: string) => void;
    testIdPrefix: string;
}) {
    return (
        <div className="rounded-xl border border-alloy-forge/10 bg-alloy-stone/[0.02] p-4">
            <div className="flex flex-wrap items-start gap-3">
                {preview}
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-alloy-midnight">{title}</p>
                    <p className="mt-0.5 text-[11px] text-alloy-midnight/55">{subtitle}</p>
                    <p className="mt-2 text-xs font-medium text-alloy-midnight">{layoutName}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <select
                            value={selectedId}
                            onChange={(e) => onChange(e.target.value)}
                            className="max-w-full flex-1 rounded-lg border border-alloy-forge/12 bg-white px-2 py-1.5 text-[11px]"
                            data-testid={`${testIdPrefix}-select`}
                        >
                            <option value="">Surface default</option>
                            {options.map((opt) => (
                                <option key={opt.id} value={opt.id}>
                                    {formatLayoutTitleWithVersion(opt.name, opt.version)}
                                </option>
                            ))}
                        </select>
                        <Link
                            href={LAYOUTS_SETTINGS_HREF}
                            className="rounded-lg border border-alloy-pine/30 px-2.5 py-1.5 text-[11px] font-medium text-alloy-pine hover:bg-alloy-pine/[0.04]"
                        >
                            {BUSINESS_PROCESS_PRESENTATION_CHANGE}
                        </Link>
                        <Link
                            href={LAYOUTS_SETTINGS_HREF}
                            className="text-[11px] font-medium text-alloy-pine hover:underline"
                        >
                            {BUSINESS_PROCESS_LENS_OPEN_LAYOUTS} →
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
