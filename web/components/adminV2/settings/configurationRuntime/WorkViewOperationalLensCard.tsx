"use client";

import Link from "next/link";
import {
    BUSINESS_PROCESS_LENS_ADVANCED_IDENTITY,
    BUSINESS_PROCESS_LENS_MISSION,
    BUSINESS_PROCESS_LENS_OPEN_LAYOUTS,
    BUSINESS_PROCESS_LENS_OPERATORS_SEE,
    BUSINESS_PROCESS_LENS_PREVIEW_RUNTIME,
    BUSINESS_PROCESS_LENS_PRESENTATION,
    BUSINESS_PROCESS_LENS_SORTED_BY,
    BUSINESS_PROCESS_LENS_VISIBLE_IN_WORK_UNIT,
    BUSINESS_PROCESS_LENS_WORK_INCLUDED,
    BUSINESS_PROCESS_LENS_WORK_INCLUDED_NOTE,
} from "@/lib/lifecycle/businessProcessUiLabels";
import { LAYOUTS_SETTINGS_HREF } from "@/lib/admin/canonicalAdminRoutes";
import {
    FocusPanelLayoutPreviewThumbnail,
    QueueLayoutPreviewThumbnail,
} from "@/components/adminV2/settings/configurationRuntime/LayoutPresentationPreview";
import type { PerspectiveEditorDraftRow } from "@/lib/lifecycle/perspectiveConfigEditorModel";
import type { PerspectiveWorkIncludedChip } from "@/lib/lifecycle/perspectiveWorkIncludedProjection";

function LensSectionRow({
    label,
    children,
    className = "",
}: {
    label: string;
    children: React.ReactNode;
    className?: string;
}) {
    return (
        <div
            className={`grid gap-2 border-b border-alloy-forge/8 py-3 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:items-start ${className}`}
        >
            <span className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">{label}</span>
            <div className="min-w-0">{children}</div>
        </div>
    );
}

export default function WorkViewOperationalLensCard({
    row,
    workIncluded,
    sortLabel,
    previewHref,
    onUpdate,
}: {
    row: PerspectiveEditorDraftRow;
    workIncluded: readonly PerspectiveWorkIncludedChip[];
    sortLabel: string;
    previewHref: string | null;
    onUpdate: (patch: Partial<PerspectiveEditorDraftRow>) => void;
}) {
    const displayTitle = row.label.trim() || "Untitled work view";

    return (
        <article
            className="overflow-hidden rounded-xl border border-alloy-forge/12 bg-white shadow-sm"
            data-testid={`work-view-lens-${row.queue_key}`}
        >
            <header className="flex items-start gap-3 border-b border-alloy-forge/8 bg-alloy-stone/[0.02] px-4 py-3">
                <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-alloy-pine/10 text-sm"
                    aria-hidden
                >
                    ◆
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-pine/80">
                        Work view
                    </p>
                    <h5 className="truncate text-sm font-semibold text-alloy-midnight">{displayTitle}</h5>
                </div>
            </header>

            <div className="px-4 pb-4">
                <LensSectionRow label={BUSINESS_PROCESS_LENS_OPERATORS_SEE}>
                    <input
                        type="text"
                        value={row.label}
                        onChange={(e) => onUpdate({ label: e.target.value })}
                        className="w-full rounded-lg border border-alloy-forge/12 bg-white px-3 py-2 text-sm text-alloy-midnight"
                        data-testid={`work-view-label-${row.queue_key}`}
                    />
                </LensSectionRow>

                <LensSectionRow label={BUSINESS_PROCESS_LENS_MISSION}>
                    <textarea
                        value={row.mission}
                        rows={2}
                        onChange={(e) => onUpdate({ mission: e.target.value })}
                        className="w-full rounded-lg border border-alloy-forge/12 bg-white px-3 py-2 text-sm leading-relaxed text-alloy-midnight"
                        data-testid={`work-view-mission-${row.queue_key}`}
                    />
                </LensSectionRow>

                <LensSectionRow label={BUSINESS_PROCESS_LENS_WORK_INCLUDED}>
                    <div className="space-y-2">
                        {workIncluded.length ?
                            <div className="flex flex-wrap gap-1.5">
                                {workIncluded.map((chip) => (
                                    <span
                                        key={`${chip.field}-${chip.value}`}
                                        className="rounded-full border border-alloy-forge/10 bg-white px-2.5 py-1 text-[11px] text-alloy-midnight/75"
                                    >
                                        {chip.field} {chip.operator} {chip.value}
                                    </span>
                                ))}
                            </div>
                        :   <p className="text-xs text-alloy-midnight/50">Derived from stage membership and queue filters.</p>}
                        <p className="text-[10px] text-alloy-midnight/45">{BUSINESS_PROCESS_LENS_WORK_INCLUDED_NOTE}</p>
                    </div>
                </LensSectionRow>

                <LensSectionRow label={BUSINESS_PROCESS_LENS_SORTED_BY}>
                    <p className="text-sm text-alloy-midnight/80">{sortLabel}</p>
                </LensSectionRow>

                <LensSectionRow label={BUSINESS_PROCESS_LENS_PRESENTATION}>
                    <div className="space-y-3">
                        <div className="flex flex-wrap items-start gap-3 rounded-lg border border-alloy-forge/10 bg-alloy-stone/[0.02] p-3">
                            <QueueLayoutPreviewThumbnail label={displayTitle} />
                            <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold text-alloy-midnight">Queue (work list)</p>
                                <p className="mt-0.5 text-[11px] text-alloy-midnight/55">
                                    Operators see and pick work from a list.
                                </p>
                                <Link
                                    href={LAYOUTS_SETTINGS_HREF}
                                    className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-alloy-pine hover:underline"
                                    data-testid={`work-view-queue-layout-link-${row.queue_key}`}
                                >
                                    {BUSINESS_PROCESS_LENS_OPEN_LAYOUTS} →
                                </Link>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-start gap-3 rounded-lg border border-alloy-forge/10 bg-alloy-stone/[0.02] p-3">
                            <FocusPanelLayoutPreviewThumbnail label={displayTitle} />
                            <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold text-alloy-midnight">Focus panel (work details)</p>
                                <p className="mt-0.5 text-[11px] text-alloy-midnight/55">
                                    Operators view and act on the selected record.
                                </p>
                                <Link
                                    href={LAYOUTS_SETTINGS_HREF}
                                    className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-alloy-pine hover:underline"
                                    data-testid={`work-view-focus-panel-layout-link-${row.queue_key}`}
                                >
                                    {BUSINESS_PROCESS_LENS_OPEN_LAYOUTS} →
                                </Link>
                            </div>
                        </div>
                    </div>
                </LensSectionRow>

                <LensSectionRow label="Visibility" className="border-b-0">
                    <div className="flex flex-wrap items-center gap-4">
                        <label className="flex items-center gap-2 text-sm text-alloy-midnight/75">
                            <input
                                type="checkbox"
                                checked={row.visible_in_rail}
                                onChange={(e) => onUpdate({ visible_in_rail: e.target.checked })}
                                className="h-4 w-4 rounded border-alloy-forge/20 text-alloy-pine"
                                data-testid={`work-view-visible-${row.queue_key}`}
                            />
                            {BUSINESS_PROCESS_LENS_VISIBLE_IN_WORK_UNIT}
                        </label>
                        <span className="text-[11px] text-alloy-midnight/45">
                            Default order · {row.display_order ?? 1}
                        </span>
                    </div>
                </LensSectionRow>

                {previewHref ?
                    <Link
                        href={previewHref}
                        className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-alloy-pine/35 bg-white px-4 py-2.5 text-sm font-medium text-alloy-pine hover:bg-alloy-pine/[0.04]"
                        data-testid={`work-view-preview-runtime-${row.queue_key}`}
                    >
                        {BUSINESS_PROCESS_LENS_PREVIEW_RUNTIME}
                    </Link>
                :   null}

                <details className="mt-3 rounded-lg border border-alloy-forge/8 bg-alloy-stone/[0.02] px-3 py-2">
                    <summary className="cursor-pointer text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                        {BUSINESS_PROCESS_LENS_ADVANCED_IDENTITY}
                    </summary>
                    <p className="mt-2 font-mono text-[10px] leading-relaxed text-alloy-midnight/45">
                        Synced queue key: {row.queue_key}
                        {row.grain ? ` · Grain: ${row.grain}` : ""}
                        {!row.foundInDefinition ? " · Not synced yet" : ""}
                    </p>
                </details>
            </div>
        </article>
    );
}
