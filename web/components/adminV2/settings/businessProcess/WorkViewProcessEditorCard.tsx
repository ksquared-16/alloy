"use client";

import Link from "next/link";
import LayoutAssignmentCard from "@/components/adminV2/settings/configurationRuntime/LayoutAssignmentCard";
import WorkViewConditionEditor from "@/components/adminV2/settings/businessProcess/WorkViewConditionEditor";
import WorkViewSortRulesEditor, {
    formatWorkViewSortSummary,
    normalizeWorkViewSorts,
    syncSortFields,
} from "@/components/adminV2/settings/businessProcess/WorkViewSortRulesEditor";
import {
    useWorkViewEditorSectionState,
    type WorkViewEditorSectionId,
} from "@/components/adminV2/settings/businessProcess/useWorkViewEditorSectionState";
import {
    BUSINESS_PROCESS_SECTION_PURPOSE,
    BUSINESS_PROCESS_LENS_OPERATORS_SEE,
    BUSINESS_PROCESS_LENS_PREVIEW_RUNTIME,
    BUSINESS_PROCESS_LENS_PRESENTATION,
    BUSINESS_PROCESS_LENS_SORTED_BY,
    BUSINESS_PROCESS_LENS_VISIBLE_IN_WORK_UNIT,
    BUSINESS_PROCESS_WORK_VIEW_DEFAULT_ORDER,
    BUSINESS_PROCESS_WORK_VIEW_TECHNICAL_IDENTITY,
    BUSINESS_PROCESS_WORK_VIEW_CATCH_ALL_HELPER,
} from "@/lib/lifecycle/businessProcessUiLabels";
import {
    formatWorkViewBasicsSummary,
    formatWorkViewConditionsSummary,
    formatWorkViewPresentationSummary,
    formatWorkViewVisibilitySummary,
} from "@/lib/lifecycle/workViewEditorSummaries";
import { buildOperationalViewPreviewRuntimeHref } from "@/lib/adminV2/runtime/perspective/mergeOperationalViewMetadata";
import type { WorkViewCompatQueueLane } from "@/lib/lifecycle/workViewsRuntimeConvergence";
import type { WorkViewConfigV1Stored } from "@/lib/lifecycle/workViewsConfigV1";
import { isWorkViewCatchAll } from "@/lib/lifecycle/workViewsConfigV1";
import type { EntityLayoutRecord } from "@/lib/layout/layoutV2";
import { isLayoutRuntimeOpportunityDrawerBodyEnabledClient } from "@/lib/layout/featureFlag";
import { publishedLayoutOptionsForAssignmentSlot } from "@/lib/layout/layoutAssignmentLayoutOptions";
import { GRAIN_LABELS, resolveWorkViewStageGrains, stageKeysReferencedByWorkView, validateWorkViewGrainConsistency } from "@/lib/lifecycle/stageGrainV1";
import type { StageGrain } from "@/lib/lifecycle/stageGrainV1";

/**
 * ROW TYPE DECLARATION for a lens with no stage condition.
 *
 * Row type is normally INHERITED from the stages a view filters on, and that inheritance stays
 * authoritative — a stage-scoped view shows it read-only below. A view with no stage condition has
 * nothing to inherit from, and in a process whose stages are not all one row type the runtime cannot
 * resolve it and refuses the view outright. Declaring it here is how such a view becomes usable.
 *
 * Only Family and Child are offered: they are the row types the Focus Panel can actually present.
 * Person / Account / Work item exist in stage configuration but have no panel subject, so offering
 * them would let an operator author a view that can only ever refuse.
 */
function WorkViewRowTypeDeclaration({
    declaredGrain,
    onDeclareGrain,
    viewId,
    helper,
}: {
    declaredGrain?: StageGrain;
    onDeclareGrain: (grain: StageGrain | undefined) => void;
    viewId: string;
    helper: string;
}) {
    return (
        <div
            className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-alloy-stone/20 bg-alloy-stone/[0.03] px-4 py-2.5"
            data-testid="work-view-grain-declaration"
        >
            <label className="flex items-center gap-2">
                <span className="text-[11px] font-medium text-alloy-midnight/60">Row type</span>
                <select
                    className="rounded border border-alloy-stone/40 bg-white px-2 py-1 text-[11px] text-alloy-midnight"
                    value={declaredGrain ?? ""}
                    onChange={(e) => onDeclareGrain((e.target.value || undefined) as StageGrain | undefined)}
                    data-testid={`process-work-view-row-grain-${viewId}`}
                >
                    <option value="">Not declared</option>
                    <option value="family">{GRAIN_LABELS.family}</option>
                    <option value="child">{GRAIN_LABELS.child}</option>
                </select>
            </label>
            <p className="text-[11px] leading-relaxed text-alloy-midnight/50">
                {declaredGrain ?
                    `Every row in this view is one ${GRAIN_LABELS[declaredGrain].toLowerCase()}, whatever stage it is at.`
                :   helper}
            </p>
        </div>
    );
}

function WorkViewGrainBanner({
    stageGrains,
    hasStageScope,
    catchAll = false,
    declaredGrain,
    onDeclareGrain,
    viewId,
}: {
    stageGrains: (StageGrain | undefined)[];
    /** True when the view filters by `opportunity_stage` — grain can be confirmed from stage config. */
    hasStageScope: boolean;
    /** Process-wide catch-all (`filters_v1: []`) — informational only, no mixed-grain warnings. */
    catchAll?: boolean;
    /** The view's own Row Type declaration, for a view with no stage condition to inherit from. */
    declaredGrain?: StageGrain;
    onDeclareGrain: (grain: StageGrain | undefined) => void;
    viewId: string;
}) {
    // No stage condition — nothing to inherit from, so the view declares its own row type.
    if (catchAll || !hasStageScope) {
        return (
            <>
                <WorkViewRowTypeDeclaration
                    declaredGrain={declaredGrain}
                    onDeclareGrain={onDeclareGrain}
                    viewId={viewId}
                    helper={
                        "No stage condition, so there is no stage to inherit a row type from."
                        + " Declare one — a process with more than one row type across its stages cannot resolve this view without it."
                    }
                />
                {catchAll ?
                    <div
                        className="flex items-start gap-2 border-b border-alloy-bend-pine/15 bg-alloy-bend-pine/[0.04] px-4 py-2.5"
                        data-testid="work-view-grain-catch-all"
                    >
                        <span className="text-[11px] font-medium text-alloy-bend-pine">All work</span>
                        <p className="text-[11px] leading-relaxed text-alloy-midnight/55">
                            {BUSINESS_PROCESS_WORK_VIEW_CATCH_ALL_HELPER}
                        </p>
                    </div>
                :   null}
            </>
        );
    }

    const defined = stageGrains.filter((g): g is StageGrain => g !== undefined);
    const consistency = validateWorkViewGrainConsistency(stageGrains);

    if (!consistency.valid) {
        return (
            <div
                className="flex items-start gap-2 border-b border-red-200 bg-red-50 px-4 py-2.5"
                data-testid="work-view-grain-mixed-warning"
                role="alert"
            >
                <span className="mt-px text-red-600">⚠</span>
                <p className="text-[12px] text-red-800">{consistency.message}</p>
            </div>
        );
    }

    if (defined.length === 0) {
        return (
            <div
                className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2"
                data-testid="work-view-grain-missing"
            >
                <span className="text-[11px] font-medium text-amber-800">Row type</span>
                <span className="text-[11px] text-amber-700">Missing stage grain — configure Row type in each stage&apos;s Stage Context.</span>
            </div>
        );
    }

    const grain = defined[0];
    // A declaration that disagrees with the stages the view filters on is a contradiction, and the
    // runtime refuses the view rather than picking a winner. Say so here, before it is published.
    if (declaredGrain && declaredGrain !== grain) {
        return (
            <div
                className="flex items-start gap-2 border-b border-red-200 bg-red-50 px-4 py-2.5"
                data-testid="work-view-grain-declaration-conflict"
                role="alert"
            >
                <span className="mt-px text-red-600">⚠</span>
                <p className="text-[12px] text-red-800">
                    This view declares its row type as {GRAIN_LABELS[declaredGrain]}, but the stages it
                    includes are {GRAIN_LABELS[grain]}. The runtime refuses a view that contradicts
                    itself — clear the declaration, or change the stage condition.
                </p>
            </div>
        );
    }
    return (
        <div
            className="flex items-center gap-3 border-b border-alloy-stone/20 bg-alloy-stone/[0.04] px-4 py-2"
            data-testid="work-view-grain-banner"
        >
            <span className="text-[11px] font-medium text-alloy-midnight/60">Row type</span>
            <span className="text-[11px] font-semibold text-alloy-midnight" data-testid="work-view-grain-label">
                {GRAIN_LABELS[grain]}
            </span>
            <span className="text-[11px] text-alloy-midnight/40">· Inherited from included stages</span>
        </div>
    );
}

function WorkViewEditorSection({
    sectionId,
    title,
    summary,
    summaryActive = false,
    open,
    onOpenChange,
    children,
    testId,
}: {
    sectionId: WorkViewEditorSectionId;
    title: string;
    summary?: string;
    summaryActive?: boolean;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    children: React.ReactNode;
    testId?: string;
}) {
    return (
        <details
            className="group border-b border-alloy-stone/25 py-2.5"
            open={open}
            onToggle={(e) => onOpenChange(e.currentTarget.open)}
            data-testid={testId ?? `work-view-section-${sectionId}`}
        >
            <summary className="cursor-pointer list-none py-0.5 [&::-webkit-details-marker]:hidden">
                <div className="flex items-center justify-between gap-3">
                    <span className="work-view-section-title">{title}</span>
                    {!open && summary ?
                        <span
                            className={`work-view-section-summary ${summaryActive ? "work-view-section-summary--active" : ""}`}
                            data-testid={`${testId ?? `work-view-section-${sectionId}`}-summary`}
                        >
                            {summary}
                        </span>
                    :   null}
                </div>
            </summary>
            <div className="pt-3">{children}</div>
        </details>
    );
}

export default function WorkViewProcessEditorCard({
    view,
    selected,
    workUnitKey,
    layouts,
    stageGrains = [],
    stageGrainByKey,
    queueLanes = [],
    onSelect: _onSelect,
    onChange,
    onDelete,
}: {
    view: WorkViewConfigV1Stored;
    selected: boolean;
    workUnitKey: string | null;
    layouts: EntityLayoutRecord[];
    stageGrains?: (StageGrain | undefined)[];
    /** stage key → grain. When provided, the grain banner scopes to the stages THIS view filters to. */
    stageGrainByKey?: Record<string, StageGrain | undefined>;
    queueLanes?: WorkViewCompatQueueLane[];
    onSelect: () => void;
    onChange: (patch: Partial<WorkViewConfigV1Stored>) => void;
    onDelete?: () => void;
}) {
    const legacyDrawerBodyEnabled = isLayoutRuntimeOpportunityDrawerBodyEnabledClient();
    const queueOptions = publishedLayoutOptionsForAssignmentSlot(layouts, "queue_record");
    const drawerOptions = publishedLayoutOptionsForAssignmentSlot(layouts, "opportunity_drawer");
    const queueRecord = view.queue_layout_id ? layouts.find((l) => l.id === view.queue_layout_id) ?? null : null;
    const drawerRecord =
        view.focus_panel_layout_id ? layouts.find((l) => l.id === view.focus_panel_layout_id) ?? null : null;

    const previewHref = buildOperationalViewPreviewRuntimeHref({
        workUnitKey,
        queueKey: view.compat_queue_key,
        workViewId: view.id,
        queueLayoutId: view.queue_layout_id,
        focusPanelLayoutId: view.focus_panel_layout_id,
    });

    const displayTitle = view.label.trim() || "Untitled work view";
    const sortRules = normalizeWorkViewSorts(view.sort_v1, view.sorts_v1);
    const { open, setSectionOpen } = useWorkViewEditorSectionState(view.id);

    const conditionsSummary = formatWorkViewConditionsSummary(view.filters_v1);
    const sortSummary = formatWorkViewSortSummary(sortRules);
    const presentationSummary = formatWorkViewPresentationSummary(
        view.queue_layout_id,
        view.focus_panel_layout_id,
        layouts,
    );
    const visibilitySummary = formatWorkViewVisibilitySummary(view);
    const basicsSummary = formatWorkViewBasicsSummary(view.mission);

    return (
        <article
            className="process-config-setup-card overflow-hidden"
            data-testid={`process-work-view-card-${view.id}`}
        >
            <header className="flex items-center gap-2 border-b border-alloy-stone/30 bg-white px-4 py-2.5">
                <div className="min-w-0 flex-1">
                    {open.basics ?
                        <p className="work-view-editor-header-title truncate" aria-hidden>
                            Work view
                        </p>
                    :   <h4 className="work-view-editor-header-title truncate" data-testid={`process-work-view-header-title-${view.id}`}>
                            {displayTitle}
                        </h4>
                    }
                </div>
                {selected ?
                    <span className="rounded-full bg-alloy-pine/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-alloy-pine">
                        Active
                    </span>
                :   null}
                {onDelete ?
                    <button
                        type="button"
                        onClick={onDelete}
                        className="rounded px-2 py-0.5 text-xs font-medium text-alloy-forge/60 hover:text-red-700"
                        data-testid={`process-work-view-delete-${view.id}`}
                    >
                        Delete
                    </button>
                :   null}
            </header>

            <WorkViewGrainBanner
                catchAll={isWorkViewCatchAll(view)}
                stageGrains={
                    stageGrainByKey ? resolveWorkViewStageGrains(view.filters_v1, stageGrainByKey) : stageGrains
                }
                hasStageScope={stageKeysReferencedByWorkView(view.filters_v1).length > 0}
                declaredGrain={view.row_grain_v1}
                onDeclareGrain={(grain) => onChange({ row_grain_v1: grain })}
                viewId={view.id}
            />

            <div className="space-y-0 px-4 pb-4">
                <WorkViewEditorSection
                    sectionId="basics"
                    title="Basics"
                    summary={basicsSummary}
                    open={open.basics}
                    onOpenChange={(isOpen) => setSectionOpen("basics", isOpen)}
                    testId="work-view-section-basics"
                >
                    <div className="space-y-3">
                        <label className="block space-y-1.5">
                            <span className="work-view-field-label">{BUSINESS_PROCESS_LENS_OPERATORS_SEE}</span>
                            <input
                                type="text"
                                value={view.label}
                                onChange={(e) => onChange({ label: e.target.value })}
                                className="config-runtime-input"
                                data-testid={`process-work-view-label-${view.id}`}
                            />
                        </label>
                        <label className="block space-y-1.5">
                            <span className="work-view-field-label">{BUSINESS_PROCESS_SECTION_PURPOSE}</span>
                            <textarea
                                value={view.mission ?? ""}
                                rows={2}
                                onChange={(e) => onChange({ mission: e.target.value })}
                                className="config-runtime-input leading-relaxed"
                                data-testid={`process-work-view-mission-${view.id}`}
                            />
                        </label>
                    </div>
                </WorkViewEditorSection>

                <WorkViewEditorSection
                    sectionId="conditions"
                    title="Show work when…"
                    summary={conditionsSummary}
                    open={open.conditions}
                    onOpenChange={(isOpen) => setSectionOpen("conditions", isOpen)}
                    testId="work-view-section-conditions"
                >
                    <WorkViewConditionEditor
                        filters={view.filters_v1 ?? []}
                        onChange={(filters_v1) => onChange({ filters_v1 })}
                        match={view.match ?? "all"}
                        onMatchChange={(match) => onChange({ match })}
                    />
                </WorkViewEditorSection>

                <WorkViewEditorSection
                    sectionId="sort"
                    title={BUSINESS_PROCESS_LENS_SORTED_BY}
                    summary={sortSummary}
                    summaryActive
                    open={open.sort}
                    onOpenChange={(isOpen) => setSectionOpen("sort", isOpen)}
                    testId="work-view-section-sort"
                >
                    <WorkViewSortRulesEditor
                        sorts={sortRules}
                        testIdPrefix={`process-work-view-${view.id}`}
                        onChange={(sorts) => onChange(syncSortFields(sorts))}
                    />
                </WorkViewEditorSection>

                <WorkViewEditorSection
                    sectionId="presentation"
                    title={BUSINESS_PROCESS_LENS_PRESENTATION}
                    summary={presentationSummary}
                    open={open.presentation}
                    onOpenChange={(isOpen) => setSectionOpen("presentation", isOpen)}
                    testId="work-view-section-presentation"
                >
                    <p className="mb-3 text-[11px] text-alloy-midnight/45">
                        Select surfaces for this Work View. Surface owns presentation — Work View only selects which surface to use.
                    </p>
                    <div className="grid gap-2" data-testid={`process-work-view-presentation-${view.id}`}>
                        <LayoutAssignmentCard
                            title="Queue Row Surface"
                            subtitle="Work list presentation for this view."
                            selectedId={view.queue_layout_id ?? ""}
                            assignedRecord={queueRecord}
                            options={queueOptions}
                            allLayouts={layouts}
                            onChange={(queue_layout_id) => onChange({ queue_layout_id: queue_layout_id || undefined })}
                            testIdPrefix={`process-work-view-queue-${view.id}`}
                        />
                        {/*
                          * THIS SLOT DRIVES THE LEGACY DRAWER BODY, NOT THE FOCUS PANEL.
                          *
                          * It writes `focus_panel_layout_id`, and the only runtime that reads
                          * that is `/api/admin/layout-runtime/opportunity-drawer-body` — gated
                          * off by default. The Focus Panel resolves its own surface by published
                          * variant and never consults an assigned id, so titling this "Focus
                          * Panel Surface" promised an effect it could not have: two Work Views
                          * were left pointing at focus_panel_summary v10 and v132 while the
                          * runtime served v143.
                          *
                          * So it appears only when its consumer is switched on, and it says which
                          * runtime it drives. To scope a Focus Panel to a Work View, publish a
                          * variant declaring that Work View — the resolver already ranks that
                          * above an unscoped one.
                          */}
                        {legacyDrawerBodyEnabled ? (
                            <LayoutAssignmentCard
                                title="Opportunity Drawer Body (legacy runtime)"
                                subtitle="Record body for the legacy drawer. The Focus Panel resolves its own surface by published variant."
                                selectedId={view.focus_panel_layout_id ?? ""}
                                assignedRecord={drawerRecord}
                                options={drawerOptions}
                                allLayouts={layouts}
                                onChange={(focus_panel_layout_id) =>
                                    onChange({ focus_panel_layout_id: focus_panel_layout_id || undefined })
                                }
                                testIdPrefix={`process-work-view-focus-${view.id}`}
                            />
                        ) : null}
                    </div>
                </WorkViewEditorSection>

                <WorkViewEditorSection
                    sectionId="visibility"
                    title="Visibility"
                    summary={visibilitySummary}
                    open={open.visibility}
                    onOpenChange={(isOpen) => setSectionOpen("visibility", isOpen)}
                    testId="work-view-section-visibility"
                >
                    <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-5">
                            <label className="flex items-center gap-2.5 text-[13px] text-alloy-forge/80">
                                <input
                                    type="checkbox"
                                    checked={view.visible_in_runtime !== false}
                                    onChange={(e) => onChange({ visible_in_runtime: e.target.checked })}
                                    className="config-mode-control h-4 w-4 rounded border-alloy-stone/40"
                                />
                                {BUSINESS_PROCESS_LENS_VISIBLE_IN_WORK_UNIT}
                            </label>
                            <label className="flex items-center gap-2 text-[13px] text-alloy-forge/75">
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
                        {previewHref ?
                            <Link
                                href={previewHref}
                                className="config-runtime-preview-btn"
                                data-testid={`process-work-view-preview-${view.id}`}
                            >
                                {BUSINESS_PROCESS_LENS_PREVIEW_RUNTIME}
                            </Link>
                        :   null}
                    </div>
                </WorkViewEditorSection>

                <WorkViewEditorSection
                    sectionId="advanced"
                    title={BUSINESS_PROCESS_WORK_VIEW_TECHNICAL_IDENTITY}
                    open={open.advanced}
                    onOpenChange={(isOpen) => setSectionOpen("advanced", isOpen)}
                    testId="work-view-section-advanced"
                >
                    <div className="space-y-2">
                        <p className="font-mono text-xs text-alloy-forge/70">Work view id: {view.id}</p>
                        {queueLanes.length ?
                            <label className="block">
                                <span className="work-view-field-label">Compatibility queue lane</span>
                                <select
                                    value={view.compat_queue_key ?? ""}
                                    onChange={(e) => onChange({ compat_queue_key: e.target.value || undefined })}
                                    className="config-runtime-select mt-1.5 text-xs"
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
                </WorkViewEditorSection>
            </div>
        </article>
    );
}
