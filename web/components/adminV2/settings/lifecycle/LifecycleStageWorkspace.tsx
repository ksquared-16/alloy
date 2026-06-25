"use client";

import {
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import {
    BUSINESS_PROCESS_SAVE_STAGE,
    BUSINESS_PROCESS_SECTION_MEMBERSHIP,
    BUSINESS_PROCESS_SECTION_MEMBERSHIP_SUMMARY,
    BUSINESS_PROCESS_SECTION_OPERATING_PLAN,
    BUSINESS_PROCESS_SECTION_OPERATING_PLAN_SUMMARY,
    BUSINESS_PROCESS_SECTION_PERSPECTIVES,
    BUSINESS_PROCESS_SECTION_PERSPECTIVES_SUMMARY,
    BUSINESS_PROCESS_SECTION_READY,
    BUSINESS_PROCESS_SECTION_READY_SUMMARY,
    BUSINESS_PROCESS_SECTION_REQUIRED,
    BUSINESS_PROCESS_SECTION_REQUIRED_SUMMARY,
    BUSINESS_PROCESS_STAGE_HEADER,
} from "@/lib/lifecycle/businessProcessUiLabels";
import {
    STAGE_MEMBERSHIP_INCLUDED_STATUSES_HELPER,
    STAGE_MEMBERSHIP_INCLUDED_STATUSES_LABEL,
} from "@/lib/lifecycle/queueMembershipUiLabels";
import LifecycleStageStatusRollupEditor, {
    type LifecycleStageStatusRollupEditorHandle,
} from "@/components/adminV2/settings/lifecycle/LifecycleStageStatusRollupEditor";
import type { StatusRollupV1 } from "@/lib/lifecycle/statusRollupV1";
import LifecycleStageFieldRequirementsEditor, {
    type LifecycleStageFieldRequirementsEditorHandle,
} from "@/components/adminV2/settings/LifecycleStageFieldRequirementsEditor";
import LifecycleStageQueueMembershipEditor, {
    type LifecycleStageQueueMembershipEditorHandle,
} from "@/components/adminV2/settings/lifecycle/LifecycleStageQueueMembershipEditor";
import LifecycleStageOperatingPlanEditor, {
    type LifecycleStageOperatingPlanEditorHandle,
} from "@/components/adminV2/settings/lifecycle/LifecycleStageOperatingPlanEditor";
import LifecycleStagePerspectivesEditor from "@/components/adminV2/settings/lifecycle/LifecycleStagePerspectivesEditor";
import type { LifecycleStageBootstrapPayload } from "@/lib/lifecycle/lifecycleStageBootstrapTypes";
import {
    queueMembershipSubjectForStatusOptions,
    statusEntityTypeForSubject,
    statusesSettingsHrefForEntity,
} from "@/lib/lifecycle/stageStatusRollup";
import type { LifecycleStageFieldRules } from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";
import type { LifecycleStageFieldRulesStored } from "@/lib/lifecycle/lifecycleStageRequirementLevels";
import type { LifecycleRequirementEntityKey } from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";
export type LifecycleStageSaveUiState = "idle" | "unsaved" | "saving" | "saved" | "error";

type SectionId = "membership" | "required" | "operating_plan" | "perspectives" | "ready_check";

function countFieldRules(rules: LifecycleStageFieldRules | undefined): number {
    if (!rules) return 0;
    return new Set([...rules.required_rule_ids, ...rules.recommended_rule_ids]).size;
}

function StageSection({
    id,
    title,
    summary,
    children,
    onOpenChange,
    lazyMount,
    defaultOpen = false,
}: {
    id: SectionId;
    title: string;
    summary?: string;
    children: ReactNode;
    onOpenChange?: (open: boolean) => void;
    lazyMount?: boolean;
    defaultOpen?: boolean;
}) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <details
            className="group rounded-xl border border-alloy-forge/12 bg-white/90 shadow-sm"
            data-testid={`lifecycle-stage-section-${id}`}
            open={open}
            onToggle={(e) => {
                const next = (e.currentTarget as HTMLDetailsElement).open;
                setOpen(next);
                onOpenChange?.(next);
            }}
        >
            <summary className="cursor-pointer list-none px-4 py-2.5 [&::-webkit-details-marker]:hidden">
                <div className="flex items-start justify-between gap-2">
                    <div>
                        <h4 className="text-xs font-semibold text-alloy-midnight">{title}</h4>
                        {summary ? (
                            <p className="mt-0.5 text-[11px] text-alloy-midnight/55">{summary}</p>
                        ) : null}
                    </div>
                    <span className="text-[10px] text-alloy-midnight/40 group-open:rotate-90">›</span>
                </div>
            </summary>
            <div className="border-t border-alloy-forge/8 px-4 py-3">
                {!lazyMount || open ? children : null}
            </div>
        </details>
    );
}

function SaveBar({
    effectiveSaveState,
    saveError,
    saveDisabled,
    onSaveStage,
    compact,
}: {
    effectiveSaveState: LifecycleStageSaveUiState;
    saveError: string | null;
    saveDisabled: boolean;
    onSaveStage: () => void | Promise<void>;
    compact?: boolean;
}) {
    return (
        <div
            className={`flex shrink-0 items-center gap-2 ${compact ? "justify-end" : "flex-wrap justify-between"}`}
        >
            <div className={`flex flex-col items-end gap-0.5 ${compact ? "order-2" : ""}`}>
                {effectiveSaveState === "unsaved" ? (
                    <span
                        className="text-[10px] font-medium text-amber-800/90"
                        data-testid="lifecycle-stage-save-unsaved"
                    >
                        Unsaved changes
                    </span>
                ) : null}
                {effectiveSaveState === "saved" ? (
                    <span
                        className="text-[10px] font-medium text-alloy-pine"
                        data-testid="lifecycle-stage-save-saved"
                    >
                        Saved
                    </span>
                ) : null}
                {effectiveSaveState === "error" && saveError ? (
                    <span className="max-w-[14rem] text-right text-[10px] text-red-700" role="alert">
                        {saveError}
                    </span>
                ) : null}
            </div>
            <button
                type="button"
                className="rounded-md bg-alloy-pine px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                disabled={saveDisabled}
                onClick={() => void onSaveStage()}
                data-testid={compact ? "lifecycle-stage-save-sticky" : "lifecycle-stage-save"}
            >
                {effectiveSaveState === "saving" ? "Saving…" : BUSINESS_PROCESS_SAVE_STAGE}
            </button>
        </div>
    );
}

export type LifecycleStageWorkspaceHandle = {
    getFieldDraftRules: () => LifecycleStageFieldRulesStored | null;
    isFieldDirty: () => boolean;
    getQueueDisplayName: () => string | null;
    getQueueMembershipDraft: () => import("@/lib/lifecycle/queueMembershipV1").QueueMembershipV1 | null;
    isQueueMembershipDirty: () => boolean;
    getStatusRollupDraft: () => StatusRollupV1 | null;
    isStatusRollupDirty: () => boolean;
    getStageOperatingPlanDraft: () => import("@/lib/lifecycle/stageOperatingPlanV1").StageOperatingPlanV1 | null;
    isStageOperatingPlanDirty: () => boolean;
};

export default function LifecycleStageWorkspace({
    departmentId,
    stageKey,
    stageLabel,
    lifecycleName,
    bootstrap,
    bootstrapLoading,
    entityDisplayLabels,
    statusesError,
    onStatusRollupChange,
    validationSlot,
    readyCheckRefreshKey,
    saveState,
    saveError,
    onSaveStage,
    onDirtyChange,
    workspaceRef,
}: {
    departmentId: string;
    stageKey: string;
    stageLabel: string;
    lifecycleName: string;
    bootstrap: LifecycleStageBootstrapPayload | null;
    bootstrapLoading: boolean;
    entityDisplayLabels?: Partial<Record<LifecycleRequirementEntityKey, string>>;
    statusesError: string | null;
    onStatusRollupChange: (rollup: StatusRollupV1, flatKeys: string[]) => void;
    validationSlot: ReactNode;
    readyCheckRefreshKey?: string;
    saveState: LifecycleStageSaveUiState;
    saveError: string | null;
    onSaveStage: () => void | Promise<void>;
    onDirtyChange?: (dirty: boolean) => void;
    workspaceRef?: React.RefObject<LifecycleStageWorkspaceHandle | null>;
}) {
    const fieldReqRef = useRef<LifecycleStageFieldRequirementsEditorHandle | null>(null);
    const membershipRef = useRef<LifecycleStageQueueMembershipEditorHandle | null>(null);
    const rollupRef = useRef<LifecycleStageStatusRollupEditorHandle | null>(null);
    const operatingPlanRef = useRef<LifecycleStageOperatingPlanEditorHandle | null>(null);
    const [fieldDirty, setFieldDirty] = useState(false);
    const [membershipDirty, setMembershipDirty] = useState(false);
    const [rollupDirty, setRollupDirty] = useState(false);
    const [operatingPlanDirty, setOperatingPlanDirty] = useState(false);

    const savedFieldRules = bootstrap?.field_requirements?.effective.field_rules;
    const configuredFieldCount = countFieldRules(savedFieldRules);
    const savedStatusCount = bootstrap?.status_rollup_v1
        ? bootstrap.status_rollup_v1.categories.reduce(
              (n, c) => n + c.selected_status_keys.length,
              0
          )
        : 0;

    const isDirty = fieldDirty || rollupDirty || membershipDirty || operatingPlanDirty;

    useEffect(() => {
        onDirtyChange?.(isDirty);
    }, [isDirty, onDirtyChange]);

    useImperativeHandle(workspaceRef, () => ({
        getFieldDraftRules: () => fieldReqRef.current?.getDraftRules() ?? null,
        isFieldDirty: () => fieldReqRef.current?.isDirty() ?? false,
        getQueueDisplayName: () => null,
        getQueueMembershipDraft: () => membershipRef.current?.getDraftMembership() ?? null,
        isQueueMembershipDirty: () => membershipRef.current?.isDirty() ?? false,
        getStatusRollupDraft: () => rollupRef.current?.getDraftRollup() ?? null,
        isStatusRollupDirty: () => rollupRef.current?.isDirty() ?? false,
        getStageOperatingPlanDraft: () => operatingPlanRef.current?.getDraftPlan() ?? null,
        isStageOperatingPlanDirty: () => operatingPlanRef.current?.isDirty() ?? false,
    }));

    const effectiveSaveState: LifecycleStageSaveUiState =
        saveState === "saving" || saveState === "saved" || saveState === "error"
            ? saveState
            : isDirty
              ? "unsaved"
              : "idle";

    const saveDisabled =
        !stageKey.trim() || effectiveSaveState === "saving" || (!isDirty && effectiveSaveState !== "error");

    const statusSubjectType = queueMembershipSubjectForStatusOptions({
        stageKey,
        trackKey: bootstrap?.stage_track_key ?? null,
        queueMembership: bootstrap?.queue_membership ?? null,
    });
    const statusesSettingsHref = statusesSettingsHrefForEntity(
        statusEntityTypeForSubject(statusSubjectType)
    );
    useEffect(() => {
        setRollupDirty(rollupRef.current?.isDirty() ?? false);
    }, [bootstrap?.status_rollup_v1, stageKey]);

    const summaryLine = (
        <ul
            className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-alloy-midnight/65"
            data-testid="lifecycle-stage-summary"
        >
            <li>
                {savedStatusCount > 0
                    ? `${savedStatusCount} status${savedStatusCount === 1 ? "" : "es"} saved`
                    : rollupDirty
                      ? "Unsaved status selection"
                      : "No statuses yet"}
            </li>
            <li>
                {configuredFieldCount > 0
                    ? `${configuredFieldCount} field${configuredFieldCount === 1 ? "" : "s"} configured`
                    : "No stage requirements yet"}
            </li>
            {bootstrap?.stage_operating_plan?.work_templates.length ? (
                <li>{bootstrap.stage_operating_plan.work_templates.length} work item(s)</li>
            ) : null}
        </ul>
    );

    if (bootstrapLoading && !bootstrap) {
        return (
            <div
                className="animate-pulse space-y-2 rounded-xl border border-alloy-forge/10 bg-alloy-stone/5 p-3"
                data-testid="lifecycle-stage-workspace-skeleton"
            >
                <div className="h-8 w-2/3 rounded bg-alloy-stone/20" />
                <div className="h-20 rounded bg-alloy-stone/15" />
                <div className="h-20 rounded bg-alloy-stone/15" />
            </div>
        );
    }

    return (
        <div className="relative" data-testid="lifecycle-stage-workspace">
            <header
                className="sticky top-0 z-20 -mx-0.5 mb-2 rounded-xl border border-alloy-forge/12 bg-white/95 px-3 py-2 shadow-sm backdrop-blur-sm"
                data-testid="lifecycle-stage-workspace-header"
            >
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                            {lifecycleName} · {BUSINESS_PROCESS_STAGE_HEADER}
                        </p>
                        <h3 className="text-sm font-semibold text-alloy-midnight">{stageLabel || stageKey}</h3>
                        {summaryLine}
                    </div>
                    <SaveBar
                        effectiveSaveState={effectiveSaveState}
                        saveError={saveError}
                        saveDisabled={saveDisabled}
                        onSaveStage={onSaveStage}
                    />
                </div>
            </header>

            {statusesError ? (
                <p className="mb-2 text-xs text-red-700" role="alert" data-testid="lifecycle-stage-statuses-error">
                    {statusesError}
                </p>
            ) : null}

            <div className="space-y-1.5">
                <StageSection
                    id="membership"
                    title={BUSINESS_PROCESS_SECTION_MEMBERSHIP}
                    summary={BUSINESS_PROCESS_SECTION_MEMBERSHIP_SUMMARY}
                    defaultOpen
                >
                    {stageKey.trim() ? (
                        <div className="space-y-4">
                            <LifecycleStageQueueMembershipEditor
                                ref={membershipRef}
                                departmentId={departmentId}
                                stageKey={stageKey}
                                savedMembership={bootstrap?.queue_membership ?? null}
                                onDirtyChange={setMembershipDirty}
                            />
                            <div className="border-t border-alloy-forge/8 pt-3" data-testid="stage-membership-included-statuses">
                                <p className="mb-1 text-[11px] font-medium text-alloy-midnight/70">
                                    {STAGE_MEMBERSHIP_INCLUDED_STATUSES_LABEL}
                                </p>
                                <p className="mb-2 text-[11px] text-alloy-midnight/50">
                                    {STAGE_MEMBERSHIP_INCLUDED_STATUSES_HELPER}
                                </p>
                                <LifecycleStageStatusRollupEditor
                                    editorRef={rollupRef}
                                    catalog={bootstrap?.status_category_catalog ?? []}
                                    savedRollup={bootstrap?.status_rollup_v1 ?? null}
                                    statusesSettingsHref={statusesSettingsHref}
                                    onRollupChange={(rollup, _flatKeys) => {
                                        setRollupDirty(
                                            rollupRef.current?.isDirty() ?? true
                                        );
                                        onStatusRollupChange(rollup, _flatKeys);
                                    }}
                                />
                            </div>
                        </div>
                    ) : (
                        <p className="text-xs text-alloy-midnight/50">Select a stage first.</p>
                    )}
                </StageSection>

                <StageSection
                    id="required"
                    title={BUSINESS_PROCESS_SECTION_REQUIRED}
                    summary={BUSINESS_PROCESS_SECTION_REQUIRED_SUMMARY}
                >
                    {stageKey.trim() ? (
                        <LifecycleStageFieldRequirementsEditor
                            ref={fieldReqRef}
                            departmentId={departmentId}
                            activeStageKey={stageKey}
                            compact
                            workspaceMode
                            prefetchedFieldRequirements={bootstrap?.field_requirements ?? null}
                            entityDisplayLabels={
                                entityDisplayLabels ?? bootstrap?.entity_display_labels ?? undefined
                            }
                            onDirtyChange={setFieldDirty}
                        />
                    ) : (
                        <p className="text-xs text-alloy-midnight/50">Select a stage first.</p>
                    )}
                </StageSection>

                <StageSection
                    id="operating_plan"
                    title={BUSINESS_PROCESS_SECTION_OPERATING_PLAN}
                    summary={BUSINESS_PROCESS_SECTION_OPERATING_PLAN_SUMMARY}
                >
                    {stageKey.trim() ?
                        <LifecycleStageOperatingPlanEditor
                            ref={operatingPlanRef}
                            stageKey={stageKey}
                            stageLabel={stageLabel}
                            savedPlan={bootstrap?.stage_operating_plan ?? null}
                            onDirtyChange={setOperatingPlanDirty}
                        />
                    :   <p className="text-xs text-alloy-midnight/50">Select a stage first.</p>}
                </StageSection>

                <StageSection
                    id="perspectives"
                    title={BUSINESS_PROCESS_SECTION_PERSPECTIVES}
                    summary={BUSINESS_PROCESS_SECTION_PERSPECTIVES_SUMMARY}
                >
                    {stageKey.trim() ?
                        <LifecycleStagePerspectivesEditor
                            pipeline={bootstrap?.pipeline ?? null}
                            loading={bootstrapLoading}
                        />
                    :   <p className="text-xs text-alloy-midnight/50">Select a stage first.</p>}
                </StageSection>

                <StageSection
                    id="ready_check"
                    title={BUSINESS_PROCESS_SECTION_READY}
                    summary={BUSINESS_PROCESS_SECTION_READY_SUMMARY}
                    lazyMount
                >
                    <div key={readyCheckRefreshKey ?? "initial"}>{validationSlot}</div>
                </StageSection>

            </div>

        </div>
    );
}
