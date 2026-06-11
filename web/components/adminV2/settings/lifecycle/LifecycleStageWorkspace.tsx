"use client";

import {
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import Link from "next/link";
import {
    BUSINESS_PROCESS_SAVE_STAGE,
    BUSINESS_PROCESS_SECTION_ACTIONS,
    BUSINESS_PROCESS_SECTION_ACTIONS_SUMMARY,
    BUSINESS_PROCESS_SECTION_EXPECTED_WORK,
    BUSINESS_PROCESS_SECTION_EXPECTED_WORK_SUMMARY,
    BUSINESS_PROCESS_SECTION_MEMBERSHIP,
    BUSINESS_PROCESS_SECTION_MEMBERSHIP_SUMMARY,
    BUSINESS_PROCESS_SECTION_QUEUE_ADVANCED,
    BUSINESS_PROCESS_SECTION_QUEUE_ADVANCED_SUMMARY,
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
import LifecycleStatusesCard from "@/components/adminV2/settings/lifecycle/LifecycleStatusesCard";
import type { LifecycleStatusesSaveState } from "@/lib/lifecycle/lifecycleStatusesCardState";
import LifecycleStageFieldRequirementsEditor, {
    type LifecycleStageFieldRequirementsEditorHandle,
} from "@/components/adminV2/settings/LifecycleStageFieldRequirementsEditor";
import LifecycleStageWorkUnitCard, {
    type LifecycleStageWorkUnitCardHandle,
} from "@/components/adminV2/settings/enrollmentProcess/LifecycleStageWorkUnitCard";
import LifecycleStageQueueMembershipEditor, {
    type LifecycleStageQueueMembershipEditorHandle,
} from "@/components/adminV2/settings/lifecycle/LifecycleStageQueueMembershipEditor";
import LifecycleStageOperatingPlanEditor, {
    type LifecycleStageOperatingPlanEditorHandle,
} from "@/components/adminV2/settings/lifecycle/LifecycleStageOperatingPlanEditor";
import type { EnrollmentStatusStagesPayload } from "@/lib/lifecycle/enrollmentProcessStatusStageConfig";
import type { EnrollmentPipelineWorkUnitSnapshot } from "@/lib/lifecycle/parseEnrollmentPipelineQueues";
import type { LifecycleStageBootstrapPayload } from "@/lib/lifecycle/lifecycleStageBootstrapTypes";
import type { LifecycleStageFieldRules } from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";
import type { LifecycleStageFieldRulesStored } from "@/lib/lifecycle/lifecycleStageRequirementLevels";
import type { LifecycleRequirementEntityKey } from "@/lib/lifecycle/lifecycleFieldRequirementsCatalog";
import type { LifecycleStageWorkUnitIdentityUiState } from "@/components/adminV2/settings/enrollmentProcess/LifecycleStageWorkUnitCard";

export type LifecycleStageSaveUiState = "idle" | "unsaved" | "saving" | "saved" | "error";

type SectionId = "membership" | "work_plan" | "statuses" | "required" | "actions" | "queue" | "ready_check";

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
}: {
    id: SectionId;
    title: string;
    summary?: string;
    children: ReactNode;
    onOpenChange?: (open: boolean) => void;
    lazyMount?: boolean;
}) {
    const [open, setOpen] = useState(false);
    return (
        <details
            className="group rounded-xl border border-alloy-forge/12 bg-white/90 shadow-sm"
            data-testid={`lifecycle-stage-section-${id}`}
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
    statusesPayload,
    statusesSaveState,
    savedStatusKeys,
    statusesError,
    onToggleStatus,
    pipeline,
    workUnitIdentityState,
    workUnitNeedsSync,
    onPipelineUpdated,
    statusDisplayLabels,
    draftStatusLabels,
    enabledActionsCount,
    actionsSection,
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
    statusesPayload: EnrollmentStatusStagesPayload | null;
    statusesSaveState: LifecycleStatusesSaveState;
    savedStatusKeys: readonly string[];
    statusesError: string | null;
    onToggleStatus: (statusKey: string, selected: boolean) => void;
    pipeline: EnrollmentPipelineWorkUnitSnapshot | null;
    workUnitIdentityState: LifecycleStageWorkUnitIdentityUiState;
    workUnitNeedsSync: boolean;
    onPipelineUpdated: (snapshot: EnrollmentPipelineWorkUnitSnapshot | null) => void | Promise<void>;
    statusDisplayLabels: string[];
    draftStatusLabels: string[];
    enabledActionsCount: number;
    actionsSection: ReactNode;
    validationSlot: ReactNode;
    readyCheckRefreshKey?: string;
    saveState: LifecycleStageSaveUiState;
    saveError: string | null;
    onSaveStage: () => void | Promise<void>;
    onDirtyChange?: (dirty: boolean) => void;
    workspaceRef?: React.RefObject<LifecycleStageWorkspaceHandle | null>;
}) {
    const fieldReqRef = useRef<LifecycleStageFieldRequirementsEditorHandle | null>(null);
    const workUnitRef = useRef<LifecycleStageWorkUnitCardHandle | null>(null);
    const membershipRef = useRef<LifecycleStageQueueMembershipEditorHandle | null>(null);
    const operatingPlanRef = useRef<LifecycleStageOperatingPlanEditorHandle | null>(null);
    const [fieldDirty, setFieldDirty] = useState(false);
    const [queueNameDirty, setQueueNameDirty] = useState(false);
    const [membershipDirty, setMembershipDirty] = useState(false);
    const [operatingPlanDirty, setOperatingPlanDirty] = useState(false);

    const savedKeySet = useMemo(() => new Set(savedStatusKeys), [savedStatusKeys]);
    const statusesDirty = useMemo(() => {
        const draft = statusesSaveState.saveDraftKeys;
        if (savedStatusKeys.length !== draft.length) return true;
        for (const k of draft) if (!savedKeySet.has(k)) return true;
        return false;
    }, [statusesSaveState.saveDraftKeys, savedStatusKeys, savedKeySet]);

    const savedFieldRules = bootstrap?.field_requirements?.effective.field_rules;
    const configuredFieldCount = countFieldRules(savedFieldRules);
    const draftStatusCount = statusesSaveState.saveDraftKeys.length;
    const savedStatusCount = savedStatusKeys.length;
    const queueConfigured =
        Boolean(pipeline?.id) && workUnitIdentityState === "synced" && !workUnitNeedsSync;

    const isDirty = fieldDirty || statusesDirty || queueNameDirty || membershipDirty || operatingPlanDirty;

    useEffect(() => {
        onDirtyChange?.(isDirty);
    }, [isDirty, onDirtyChange]);

    useImperativeHandle(workspaceRef, () => ({
        getFieldDraftRules: () => fieldReqRef.current?.getDraftRules() ?? null,
        isFieldDirty: () => fieldReqRef.current?.isDirty() ?? false,
        getQueueDisplayName: () => workUnitRef.current?.getDisplayName() ?? null,
        getQueueMembershipDraft: () => membershipRef.current?.getDraftMembership() ?? null,
        isQueueMembershipDirty: () => membershipRef.current?.isDirty() ?? false,
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

    const previewStatusLabels =
        draftStatusLabels.length > 0 ? draftStatusLabels : statusDisplayLabels;

    const summaryLine = (
        <ul
            className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-alloy-midnight/65"
            data-testid="lifecycle-stage-summary"
        >
            <li>
                {savedStatusCount > 0
                    ? `${savedStatusCount} status${savedStatusCount === 1 ? "" : "es"} saved`
                    : statusesDirty && draftStatusCount > 0
                      ? `${draftStatusCount} status${draftStatusCount === 1 ? "" : "es"} selected`
                      : "No statuses yet"}
            </li>
            <li>
                {configuredFieldCount > 0
                    ? `${configuredFieldCount} field${configuredFieldCount === 1 ? "" : "s"} configured`
                    : "No required information yet"}
            </li>
            <li>
                {enabledActionsCount > 0
                    ? `${enabledActionsCount} action${enabledActionsCount === 1 ? "" : "s"} enabled`
                    : "No actions enabled"}
            </li>
            <li>{queueConfigured ? "Workspace lane synced" : "Workspace lane pending"}</li>
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
                                <LifecycleStatusesCard
                                    payload={statusesPayload}
                                    loading={false}
                                    saving={false}
                                    saveState={statusesSaveState}
                                    savedKeys={savedStatusKeys}
                                    error={null}
                                    onToggleStatus={onToggleStatus}
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
                    id="work_plan"
                    title={BUSINESS_PROCESS_SECTION_EXPECTED_WORK}
                    summary={BUSINESS_PROCESS_SECTION_EXPECTED_WORK_SUMMARY}
                >
                    {stageKey.trim() ? (
                        <LifecycleStageOperatingPlanEditor
                            ref={operatingPlanRef}
                            stageKey={stageKey}
                            savedPlan={bootstrap?.stage_operating_plan ?? null}
                            onDirtyChange={setOperatingPlanDirty}
                        />
                    ) : (
                        <p className="text-xs text-alloy-midnight/50">Select a stage first.</p>
                    )}
                </StageSection>

                <StageSection
                    id="actions"
                    title={BUSINESS_PROCESS_SECTION_ACTIONS}
                    summary={BUSINESS_PROCESS_SECTION_ACTIONS_SUMMARY}
                >
                    {actionsSection}
                </StageSection>

                <StageSection
                    id="ready_check"
                    title={BUSINESS_PROCESS_SECTION_READY}
                    summary={BUSINESS_PROCESS_SECTION_READY_SUMMARY}
                    lazyMount
                >
                    <div key={readyCheckRefreshKey ?? "initial"}>{validationSlot}</div>
                </StageSection>

                <details
                    className="rounded-xl border border-dashed border-alloy-forge/15 bg-alloy-stone/[0.03]"
                    data-testid="lifecycle-stage-section-queue-advanced"
                >
                    <summary className="cursor-pointer list-none px-4 py-2.5 text-xs font-medium text-alloy-midnight/60 [&::-webkit-details-marker]:hidden">
                        <span>{BUSINESS_PROCESS_SECTION_QUEUE_ADVANCED}</span>
                        <p className="mt-0.5 text-[11px] font-normal text-alloy-midnight/45">
                            {BUSINESS_PROCESS_SECTION_QUEUE_ADVANCED_SUMMARY}
                        </p>
                    </summary>
                    <div className="border-t border-alloy-forge/8 px-4 py-3">
                        <p className="mb-2 text-[11px] text-alloy-midnight/50">
                            Queue layout is managed in{" "}
                            <Link href="/admin/settings/layouts" className="font-medium text-alloy-pine hover:underline">
                                Layouts
                            </Link>
                            . Saving the stage syncs the workspace lane when statuses are assigned.
                        </p>
                        {draftStatusCount > 0 || savedStatusKeys.length > 0 ? (
                            <LifecycleStageWorkUnitCard
                                ref={workUnitRef}
                                departmentId={departmentId}
                                activeStageKey={stageKey}
                                stageLabel={stageLabel || stageKey}
                                stageStatusDisplayLabels={previewStatusLabels}
                                stageSavedStatusKeys={savedStatusKeys}
                                pipeline={pipeline}
                                workUnitIdentityState={workUnitIdentityState}
                                workUnitNeedsSync={workUnitNeedsSync}
                                loadingPipeline={false}
                                onPipelineUpdated={onPipelineUpdated}
                                workspaceMode
                                onDraftNameDirtyChange={setQueueNameDirty}
                            />
                        ) : (
                            <p className="text-xs text-alloy-midnight/50">
                                Select at least one status in Stage Membership to sync the workspace lane.
                            </p>
                        )}
                    </div>
                </details>
            </div>

        </div>
    );
}
