"use client";

import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import LifecycleActivationStatusesStep from "@/components/adminV2/settings/lifecycle/LifecycleActivationStatusesStep";
import LifecycleStageFieldRequirementsEditor, {
    type LifecycleStageFieldRequirementsEditorHandle,
} from "@/components/adminV2/settings/LifecycleStageFieldRequirementsEditor";
import LifecycleStageWorkUnitCard, {
    type LifecycleStageWorkUnitCardHandle,
} from "@/components/adminV2/settings/enrollmentProcess/LifecycleStageWorkUnitCard";
import type { EnrollmentStatusStagesPayload } from "@/lib/lifecycle/enrollmentProcessStatusStageConfig";
import { asOperatorStageKey } from "@/lib/lifecycle/lifecycleBuilderConfig";
import type { EnrollmentPipelineWorkUnitSnapshot } from "@/lib/lifecycle/parseEnrollmentPipelineQueues";
import type { LifecycleStageBootstrapPayload } from "@/lib/lifecycle/lifecycleStageBootstrapTypes";

export type GuidedSetupStepId = "required" | "statuses" | "queue" | "validation";

const STEP_ORDER: GuidedSetupStepId[] = ["required", "statuses", "queue", "validation"];

function nextStepAfter(current: GuidedSetupStepId): GuidedSetupStepId | null {
    const i = STEP_ORDER.indexOf(current);
    return i >= 0 && i < STEP_ORDER.length - 1 ? STEP_ORDER[i + 1]! : null;
}

/** Fixed height so row cards align; body scrolls, footer stays pinned. */
const GUIDED_CARD_HEIGHT_CLASS = "h-[380px] max-h-[380px] min-h-[380px]";
const GUIDED_CARD_BODY_CLASS =
    "lifecycle-guided-card-body min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-2 text-sm [overscroll-behavior:contain]";

function GuidedCard({
    stepId,
    title,
    status,
    summary,
    primaryLabel,
    primaryDisabled,
    primaryBusy,
    onPrimary,
    cardRef,
    hideFooter,
    children,
}: {
    stepId: GuidedSetupStepId;
    title: string;
    status: "complete" | "pending" | "ready";
    summary: string;
    primaryLabel: string;
    primaryDisabled?: boolean;
    primaryBusy?: boolean;
    onPrimary: () => void | Promise<void>;
    cardRef?: (el: HTMLElement | null) => void;
    hideFooter?: boolean;
    children: ReactNode;
}) {
    const statusLabel =
        status === "complete" ? "Complete" : status === "ready" ? "Ready" : "Not started";
    const statusClass =
        status === "complete"
            ? "bg-alloy-pine/10 text-alloy-pine"
            : status === "ready"
              ? "bg-alloy-stone/20 text-alloy-midnight/70"
              : "bg-alloy-stone/10 text-alloy-midnight/45";

    return (
        <article
            ref={cardRef}
            className={`flex flex-col rounded-xl border border-alloy-forge/12 bg-white/90 shadow-sm ${GUIDED_CARD_HEIGHT_CLASS}`}
            data-testid={`lifecycle-guided-card-${stepId}`}
        >
            <header className="border-b border-alloy-forge/8 px-3 py-2.5">
                <div className="flex items-start justify-between gap-2">
                    <h4 className="text-xs font-semibold text-alloy-midnight">{title}</h4>
                    <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${statusClass}`}
                        data-testid={`lifecycle-guided-status-${stepId}`}
                    >
                        {statusLabel}
                    </span>
                </div>
                <p className="mt-1 line-clamp-2 text-[11px] text-alloy-midnight/55">{summary}</p>
            </header>
            <div
                className={GUIDED_CARD_BODY_CLASS}
                data-testid={`lifecycle-guided-card-body-${stepId}`}
            >
                {children}
            </div>
            {hideFooter ? null : (
                <footer className="shrink-0 border-t border-alloy-forge/8 px-3 py-2">
                    <button
                        type="button"
                        className="w-full rounded-md bg-alloy-pine px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                        disabled={primaryDisabled || primaryBusy}
                        onClick={() => void onPrimary()}
                        data-testid={`lifecycle-guided-save-${stepId}`}
                    >
                        {primaryBusy ? "Saving…" : primaryLabel}
                    </button>
                </footer>
            )}
        </article>
    );
}

export default function LifecycleStageGuidedBoard({
    departmentId,
    stageKey,
    bootstrap,
    bootstrapLoading,
    statusesPayload,
    statusesSaving,
    draftStatusKeys,
    savedStatusKeys,
    statusesError,
    onToggleStatus,
    onSaveStatuses,
    canSaveStatuses,
    pipeline,
    onPipelineUpdated,
    statusDisplayLabels,
    validationSlot,
    onStepConfirmed,
}: {
    departmentId: string;
    stageKey: string;
    bootstrap: LifecycleStageBootstrapPayload | null;
    bootstrapLoading: boolean;
    statusesPayload: EnrollmentStatusStagesPayload | null;
    statusesSaving: boolean;
    draftStatusKeys: Set<string>;
    savedStatusKeys: Set<string>;
    statusesError: string | null;
    onToggleStatus: (statusKey: string, selected: boolean) => void;
    onSaveStatuses: () => void | Promise<void>;
    canSaveStatuses: boolean;
    pipeline: EnrollmentPipelineWorkUnitSnapshot | null;
    onPipelineUpdated: (snapshot: EnrollmentPipelineWorkUnitSnapshot | null) => void | Promise<void>;
    statusDisplayLabels: string[];
    validationSlot: ReactNode;
    onStepConfirmed?: (step: GuidedSetupStepId) => void;
}) {
    const operatorStage = asOperatorStageKey(stageKey);
    const fieldReqRef = useRef<LifecycleStageFieldRequirementsEditorHandle | null>(null);
    const workUnitRef = useRef<LifecycleStageWorkUnitCardHandle | null>(null);
    const [queueSaving, setQueueSaving] = useState(false);
    const cardRefs = useRef<Partial<Record<GuidedSetupStepId, HTMLElement | null>>>({});
    const [fieldDirty, setFieldDirty] = useState(false);
    const [fieldSaving, setFieldSaving] = useState(false);
    const [focusedStep, setFocusedStep] = useState<GuidedSetupStepId>("required");

    const scrollToStep = useCallback((step: GuidedSetupStepId) => {
        setFocusedStep(step);
        cardRefs.current[step]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, []);

    const confirmStep = useCallback(
        async (step: GuidedSetupStepId, action: () => void | Promise<void>) => {
            await action();
            onStepConfirmed?.(step);
            const next = nextStepAfter(step);
            if (next) scrollToStep(next);
        },
        [onStepConfirmed, scrollToStep]
    );

    const requiredComplete = useMemo(() => {
        const rules = bootstrap?.field_requirements?.effective.field_rules;
        return Boolean(rules && rules.required_rule_ids.length > 0);
    }, [bootstrap?.field_requirements]);

    const statusesComplete = savedStatusKeys.size > 0;
    const statusesDirty = useMemo(() => {
        if (savedStatusKeys.size !== draftStatusKeys.size) return true;
        for (const k of draftStatusKeys) if (!savedStatusKeys.has(k)) return true;
        return false;
    }, [draftStatusKeys, savedStatusKeys]);

    const queueComplete = Boolean(pipeline?.id);

    if (bootstrapLoading && !bootstrap) {
        return (
            <div
                className="grid animate-pulse gap-3 md:grid-cols-3"
                data-testid="lifecycle-guided-board-skeleton"
            >
                {[1, 2, 3, 4].map((n) => (
                    <div key={n} className="h-48 rounded-xl bg-alloy-stone/15" />
                ))}
            </div>
        );
    }

    return (
        <div className="space-y-2" data-testid="lifecycle-guided-board">
            <div className="grid items-stretch gap-3 md:grid-cols-3" data-testid="lifecycle-guided-row-1">
                <GuidedCard
                    stepId="required"
                    title="Required Information"
                    status={requiredComplete ? "complete" : fieldDirty ? "ready" : "pending"}
                    summary="Fields needed before work can move forward."
                    primaryLabel="Save Required Information"
                    primaryDisabled={!operatorStage || (!fieldDirty && !requiredComplete)}
                    primaryBusy={fieldSaving}
                    cardRef={(el) => {
                        cardRefs.current.required = el;
                    }}
                    onPrimary={() =>
                        void confirmStep("required", async () => {
                            if (!fieldReqRef.current) return;
                            setFieldSaving(true);
                            try {
                                const ok = await fieldReqRef.current.save();
                                if (ok) setFieldDirty(false);
                            } finally {
                                setFieldSaving(false);
                            }
                        })
                    }
                >
                    {operatorStage ? (
                            <LifecycleStageFieldRequirementsEditor
                                ref={fieldReqRef}
                                departmentId={departmentId}
                                activeStage={operatorStage}
                                compact
                                guidedMode
                                prefetchedFieldRequirements={bootstrap?.field_requirements ?? null}
                                onDirtyChange={setFieldDirty}
                            />
                    ) : (
                        <p className="text-xs text-alloy-midnight/50">Requires a platform stage key.</p>
                    )}
                </GuidedCard>

                <GuidedCard
                    stepId="statuses"
                    title="Statuses"
                    status={statusesComplete && !statusesDirty ? "complete" : canSaveStatuses ? "ready" : "pending"}
                    summary="Statuses included in this stage."
                    primaryLabel="Save Statuses"
                    primaryDisabled={!canSaveStatuses}
                    primaryBusy={statusesSaving}
                    cardRef={(el) => {
                        cardRefs.current.statuses = el;
                    }}
                    onPrimary={() => void confirmStep("statuses", onSaveStatuses)}
                >
                        <LifecycleActivationStatusesStep
                            payload={statusesPayload}
                            loading={false}
                            draftKeys={draftStatusKeys}
                            savedKeys={savedStatusKeys}
                            error={statusesError}
                            onToggleStatus={onToggleStatus}
                        />
                </GuidedCard>

                <GuidedCard
                    stepId="queue"
                    title="Work Unit Queue"
                    status={queueComplete ? "complete" : savedStatusKeys.size ? "ready" : "pending"}
                    summary="Queue records by selected statuses."
                    primaryLabel="Save Work Unit Queue"
                    primaryDisabled={!savedStatusKeys.size || !operatorStage}
                    primaryBusy={queueSaving}
                    cardRef={(el) => {
                        cardRefs.current.queue = el;
                    }}
                    onPrimary={() =>
                        void confirmStep("queue", async () => {
                            setQueueSaving(true);
                            try {
                                const ok = (await workUnitRef.current?.save()) ?? false;
                                if (ok) await onPipelineUpdated(pipeline);
                            } finally {
                                setQueueSaving(false);
                            }
                        })
                    }
                >
                    {savedStatusKeys.size > 0 && operatorStage ? (
                        <LifecycleStageWorkUnitCard
                            ref={workUnitRef}
                            departmentId={departmentId}
                            activeStageKey={stageKey}
                            stageLabel={stageKey}
                            stageStatusDisplayLabels={statusDisplayLabels}
                            pipeline={pipeline}
                            loadingPipeline={false}
                            onPipelineUpdated={onPipelineUpdated}
                            guidedMode
                        />
                    ) : (
                        <p className="text-xs text-alloy-midnight/50">Save at least one status first.</p>
                    )}
                </GuidedCard>
            </div>

            <div className="grid items-stretch gap-3" data-testid="lifecycle-guided-row-2">
                <GuidedCard
                    stepId="validation"
                    title="Runtime Validation"
                    status="ready"
                    summary="Workspace visibility checks."
                    primaryLabel="Review validation"
                    hideFooter
                    cardRef={(el) => {
                        cardRefs.current.validation = el;
                    }}
                    onPrimary={() => void confirmStep("validation", async () => {})}
                >
                    {validationSlot}
                </GuidedCard>
            </div>

            <span className="sr-only" data-testid="lifecycle-guided-focused-step">
                {focusedStep}
            </span>
        </div>
    );
}
