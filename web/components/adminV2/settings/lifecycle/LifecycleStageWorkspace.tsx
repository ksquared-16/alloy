"use client";

import { operatorWorkUnitHrefFromKey } from "@/lib/admin/canonicalOperatorRoutes";
import Link from "next/link";
import {
    useEffect,
    useImperativeHandle,
    useRef,
    useState,
    type ReactNode,
} from "react";
import ConfigurationRuntimeUniversalCard from "@/components/adminV2/settings/configurationRuntime/ConfigurationRuntimeUniversalCard";
import {
    BUSINESS_PROCESS_CARD_OPERATING_PLAN,
    BUSINESS_PROCESS_CARD_OPERATING_PLAN_QUESTION,
    BUSINESS_PROCESS_CARD_REQUIRED,
    BUSINESS_PROCESS_CARD_REQUIRED_QUESTION,
    BUSINESS_PROCESS_CARD_STATUS_MEMBERSHIP_QUESTION,
    BUSINESS_PROCESS_PREVIEW_WORK_UNIT,
    BUSINESS_PROCESS_SAVE_STAGE,
    BUSINESS_PROCESS_SECTION_WHO_BELONGS,
    BUSINESS_PROCESS_SECTION_WHO_BELONGS_SUMMARY,
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

function countFieldRules(rules: LifecycleStageFieldRules | undefined): number {
    if (!rules) return 0;
    return new Set([...rules.required_rule_ids, ...rules.recommended_rule_ids]).size;
}

function SaveBar({
    effectiveSaveState,
    saveError,
    saveNotice,
    saveDisabled,
    onSaveStage,
    previewHref,
}: {
    effectiveSaveState: LifecycleStageSaveUiState;
    saveError: string | null;
    saveNotice: string | null;
    saveDisabled: boolean;
    onSaveStage: () => void | Promise<void>;
    previewHref: string | null;
}) {
    return (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {effectiveSaveState === "unsaved" ?
                <span
                    className="text-[10px] font-medium text-amber-800/90"
                    data-testid="lifecycle-stage-save-unsaved"
                >
                    Unsaved
                </span>
            :   null}
            {effectiveSaveState === "saved" ?
                saveNotice ?
                    // Saved, but not publishable yet. The count is the whole point of the message.
                    <span
                        className="max-w-[20rem] text-right text-[10px] font-medium text-amber-800"
                        data-testid="lifecycle-stage-save-remaining-issues"
                        role="status"
                    >
                        {saveNotice}
                    </span>
                :   <span
                        className="text-[10px] font-medium text-alloy-pine"
                        data-testid="lifecycle-stage-save-saved"
                    >
                        Saved
                    </span>
            :   null}
            {effectiveSaveState === "error" && saveError ?
                <span className="max-w-[14rem] text-right text-[10px] text-red-700" role="alert">
                    {saveError}
                </span>
            :   null}
            {previewHref ?
                <Link
                    href={previewHref}
                    className="rounded-md border border-alloy-forge/15 px-2.5 py-1 text-[11px] font-medium text-alloy-pine hover:bg-alloy-stone/10"
                    data-testid="lifecycle-stage-preview-work-unit"
                >
                    {BUSINESS_PROCESS_PREVIEW_WORK_UNIT}
                </Link>
            :   null}
            <button
                type="button"
                className="config-primary-btn config-primary-btn--sm"
                disabled={saveDisabled}
                onClick={() => void onSaveStage()}
                data-testid="lifecycle-stage-save"
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
    getStageOperatingPlanDraft: () =>
        | import("@/lib/lifecycle/stageOperatingPlanDraftDelta").StageOperatingPlanDraftSave
        | null;
    isStageOperatingPlanDirty: () => boolean;
};

export default function LifecycleStageWorkspace({
    departmentId,
    businessProcessKey,
    stageKey,
    stageLabel,
    lifecycleName,
    bootstrap,
    bootstrapLoading,
    entityDisplayLabels,
    statusesError,
    onStatusRollupChange,
    saveState,
    saveError,
    saveNotice,
    onSaveStage,
    onDirtyChange,
    workspaceRef,
}: {
    departmentId: string;
    businessProcessKey: string;
    stageKey: string;
    stageLabel: string;
    lifecycleName: string;
    bootstrap: LifecycleStageBootstrapPayload | null;
    bootstrapLoading: boolean;
    entityDisplayLabels?: Partial<Record<LifecycleRequirementEntityKey, string>>;
    statusesError: string | null;
    onStatusRollupChange: (rollup: StatusRollupV1, flatKeys: string[]) => void;
    validationSlot?: ReactNode;
    readyCheckRefreshKey?: string;
    saveState: LifecycleStageSaveUiState;
    saveError: string | null;
    saveNotice?: string | null;
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
        ? bootstrap.status_rollup_v1.categories.reduce((n, c) => n + c.selected_status_keys.length, 0)
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
    const statusesSettingsHref = statusesSettingsHrefForEntity(statusEntityTypeForSubject(statusSubjectType));

    useEffect(() => {
        setRollupDirty(rollupRef.current?.isDirty() ?? false);
    }, [bootstrap?.status_rollup_v1, stageKey]);

    const previewHref =
        bootstrap?.pipeline?.key?.trim() ? operatorWorkUnitHrefFromKey(bootstrap.pipeline.key) : null;

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
                className="process-config-workspace-header flex flex-wrap items-center justify-between gap-2"
                data-testid="lifecycle-stage-workspace-header"
            >
                <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-alloy-midnight">{stageLabel || stageKey}</h3>
                </div>
                <SaveBar
                    effectiveSaveState={effectiveSaveState}
                    saveError={saveError}
                    saveNotice={saveNotice ?? null}
                    saveDisabled={saveDisabled}
                    onSaveStage={onSaveStage}
                    previewHref={previewHref}
                />
            </header>

            {statusesError ?
                <p className="mb-2 text-xs text-red-700" role="alert" data-testid="lifecycle-stage-statuses-error">
                    {statusesError}
                </p>
            :   null}

            <div className="space-y-2" data-testid="configuration-runtime-stage-card-grid">
                <ConfigurationRuntimeUniversalCard
                    id="membership"
                    title={BUSINESS_PROCESS_SECTION_WHO_BELONGS}
                    question={BUSINESS_PROCESS_CARD_STATUS_MEMBERSHIP_QUESTION}
                    summary={BUSINESS_PROCESS_SECTION_WHO_BELONGS_SUMMARY}
                    dirty={membershipDirty || rollupDirty}
                    insightChips={savedStatusCount > 0 ? [`${savedStatusCount} statuses`] : undefined}
                >
                    {stageKey.trim() ?
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
                                    onRollupChange={(rollup) => {
                                        setRollupDirty(rollupRef.current?.isDirty() ?? true);
                                        onStatusRollupChange(
                                            rollup,
                                            rollup.categories.flatMap((c) => c.selected_status_keys),
                                        );
                                    }}
                                />
                            </div>
                        </div>
                    :   <p className="text-xs text-alloy-midnight/50">Select a stage first.</p>}
                </ConfigurationRuntimeUniversalCard>

                <ConfigurationRuntimeUniversalCard
                    id="required"
                    title={BUSINESS_PROCESS_CARD_REQUIRED}
                    question={BUSINESS_PROCESS_CARD_REQUIRED_QUESTION}
                    dirty={fieldDirty}
                    insightChips={configuredFieldCount > 0 ? [`${configuredFieldCount} fields`] : undefined}
                >
                    {stageKey.trim() ?
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
                    :   <p className="text-xs text-alloy-midnight/50">Select a stage first.</p>}
                </ConfigurationRuntimeUniversalCard>

                <ConfigurationRuntimeUniversalCard
                    id="operating_plan"
                    title={BUSINESS_PROCESS_CARD_OPERATING_PLAN}
                    question={BUSINESS_PROCESS_CARD_OPERATING_PLAN_QUESTION}
                    dirty={operatingPlanDirty}
                >
                    {stageKey.trim() ?
                        <LifecycleStageOperatingPlanEditor
                            ref={operatingPlanRef}
                            stageKey={stageKey}
                            stageLabel={stageLabel}
                            savedPlan={bootstrap?.stage_operating_plan ?? null}
                            onDirtyChange={setOperatingPlanDirty}
                            configuredActions={bootstrap?.actions ?? []}
                            processStages={
                                // `configured_stages` — NOT `pipeline.queues`. Queues are work unit
                                // definitions and carry no journey grain, which left the editor's
                                // grain resolver blind to a stage whose configured metadata
                                // disagrees with the canonical vocabulary.
                                bootstrap?.configured_stages?.map((stage) => ({
                                    key: stage.key,
                                    label: stage.label,
                                    ...(typeof stage.grain === "string" ? { grain: stage.grain } : {}),
                                })) ??
                                bootstrap?.pipeline?.queues?.map((lane) => ({
                                    key: lane.key,
                                    label: lane.label,
                                })) ??
                                []
                            }
                            configuredStatuses={
                                // The record-status catalog, not the queue picker. The picker
                                // drops case-layer rows, which is exactly what a transition writes.
                                bootstrap?.record_status_vocabulary ?? []
                            }
                        />
                    :   <p className="text-xs text-alloy-midnight/50">Select a stage first.</p>}
                </ConfigurationRuntimeUniversalCard>
            </div>
        </div>
    );
}
