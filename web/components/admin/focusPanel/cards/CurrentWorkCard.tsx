"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";

import StageWorkOutcomePicker from "@/components/admin/StageWorkOutcomePicker";
import StageWorkOutcomeConfirm from "@/components/workIntent/StageWorkOutcomeConfirm";
import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import { useWorkIntentOutcomeCompletion } from "@/components/workIntent/useWorkIntentOutcomeCompletion";
import { buildCurrentWorkCardEvidence } from "@/lib/adminV2/runtime/focusPanel/currentWork/buildCurrentWorkCardEvidence";
import { buildOutcomeCompletionSummary } from "@/lib/adminV2/runtime/focusPanel/currentWork/buildOutcomeCompletionSummary";
import type { CurrentWorkChecklistItem } from "@/lib/adminV2/runtime/focusPanel/currentWork/projectCurrentWork";
import { resolveWorkItemHandoff } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolveWorkItemHandoff";
import { handoffOwnerCardForChecklistScope } from "@/lib/adminV2/runtime/focusPanel/currentWork/buildCurrentWorkSurfaceVM";
import type {
    CurrentWorkActionVM,
    CurrentWorkChecklistItemVM,
    CurrentWorkCompletionSummary,
    CurrentWorkSurfaceVM,
} from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkSurfaceTypes";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type {
    FocusPanelCoordination,
    FocusPanelPerspectiveLevel,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import {
    useDismissSignal,
    useReportPerspective,
} from "@/lib/adminV2/runtime/focusPanel/useFocusPanelCoordination";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import { stageWorkOutcomeEffectLines } from "@/lib/workIntent/stageWorkOutcomeEffectLines";

type Props = {
    model: FocusPanelCardModel;
    context: OperationalContext;
    receded?: boolean;
    coordination?: FocusPanelCoordination;
};

type CompletionPhase = "working" | "select_result" | "confirm" | "processing" | "complete";

export default function CurrentWorkCard({ model, context, receded = false, coordination }: Props) {
    const evidence = useMemo(() => buildCurrentWorkCardEvidence(context), [context]);
    const vm = evidence.viewModel;
    const surface = vm.surface;
    const opportunityId = context.subject.id;
    const { completeOutcome, busy, error, clearError } = useWorkIntentOutcomeCompletion(opportunityId);

    const [focused, setFocused] = useState(false);
    const [completionPhase, setCompletionPhase] = useState<CompletionPhase>("working");
    const [pendingOutcomeKey, setPendingOutcomeKey] = useState<string | null>(null);
    const [completionSummary, setCompletionSummary] = useState<CurrentWorkCompletionSummary | null>(null);
    const [handoffNotice, setHandoffNotice] = useState<string | null>(null);

    const pendingOutcome =
        vm.completionOutcomes.find((row) => row.outcome_key === pendingOutcomeKey) ?? null;

    const resetCompletion = useCallback(() => {
        setCompletionPhase("working");
        setPendingOutcomeKey(null);
        setCompletionSummary(null);
        clearError();
    }, [clearError]);

    const request = coordination?.request;
    const requestNonce = request?.card === "current_work" ? request.nonce : null;
    useEffect(() => {
        if (request?.card !== "current_work") return;
        setFocused(true);
        resetCompletion();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- nonce gates re-apply
    }, [requestNonce]);

    const level: FocusPanelPerspectiveLevel = focused ? "focused" : "base";
    useReportPerspective(coordination, "current_work", level);
    useDismissSignal(coordination, "current_work", () => {
        setFocused(false);
        resetCompletion();
    });

    const openFocus = () => {
        setFocused(true);
        resetCompletion();
    };

    const invokeAction = (action: CurrentWorkActionVM) => {
        if (action.handlerKey === "record_outcome") {
            setCompletionPhase("select_result");
            return;
        }
        if (action.handlerKey === "expand_work") {
            openFocus();
            return;
        }
        const resolved = action.resolved;
        if (resolved && coordination?.invokeHeaderAction) {
            coordination.invokeHeaderAction(resolved);
            return;
        }
        if (coordination?.invokeHeaderAction) {
            coordination.invokeHeaderAction({
                key: action.key,
                label: action.label,
                description: action.description ?? null,
                action_type: "registry",
                icon: action.icon ?? null,
                style: null,
                display_style: "outline",
                payload: {},
                workflow_id: null,
            });
        }
    };

    const handleChecklistItem = (item: CurrentWorkChecklistItemVM) => {
        if (item.status === "complete") return;

        const legacyItem = vm.checklist.find(
            (row) => row.id === item.handoffItemId || row.id === item.key,
        );
        if (legacyItem) {
            handleLegacyChecklistItem(legacyItem);
            return;
        }

        const ownerCard = handoffOwnerCardForChecklistScope(item.scope);
        if (ownerCard && coordination?.requestFocus) {
            setHandoffNotice(null);
            const source = { card: "current_work" as const, focus: null };
            setFocused(false);
            resetCompletion();
            coordination.requestFocus(ownerCard, null, source);
            return;
        }

        if (item.actionRef && coordination?.invokeHeaderAction) {
            invokeAction({
                key: item.actionRef,
                label: item.label,
                category: "supporting",
                placement: "current_work_supporting",
                actionRef: item.actionRef,
            });
        }
    };

    const handleLegacyChecklistItem = (item: CurrentWorkChecklistItem) => {
        if (item.state === "complete") return;

        const plan = resolveWorkItemHandoff(item, coordination);
        if (!plan) return;

        switch (plan.kind) {
            case "blocked":
                setHandoffNotice(plan.message);
                return;
            case "activity":
                setHandoffNotice(null);
                coordination?.openFocusPanelMode?.("activity");
                return;
            case "header_action": {
                const action = coordination?.resolveCommunicationsComposerAction?.();
                if (action && coordination?.invokeHeaderAction) {
                    setHandoffNotice(null);
                    coordination.invokeHeaderAction(action);
                    return;
                }
                setHandoffNotice(
                    "No communications composer is available — open Activity or add Communications to this panel.",
                );
                return;
            }
            case "focus": {
                setHandoffNotice(null);
                const source = { card: "current_work" as const, focus: null };
                setFocused(false);
                resetCompletion();
                coordination?.requestFocus(plan.card, plan.focus, source);
                return;
            }
        }
    };

    const handleConfirmOutcome = useCallback(() => {
        if (!pendingOutcomeKey || !vm.primaryProjection || !vm.primaryWorkItem) return;
        setCompletionPhase("processing");
        void completeOutcome(vm.primaryProjection, pendingOutcomeKey).then(() => {
            const effectLines = stageWorkOutcomeEffectLines(vm.primaryWorkItem!, pendingOutcomeKey);
            setCompletionSummary(
                buildOutcomeCompletionSummary({
                    workItem: vm.primaryWorkItem!,
                    outcomeKey: pendingOutcomeKey,
                    effectLines,
                }),
            );
            setCompletionPhase("complete");
            setPendingOutcomeKey(null);
        });
    }, [completeOutcome, pendingOutcomeKey, vm.primaryProjection, vm.primaryWorkItem]);

    const closeFocus = () => {
        setFocused(false);
        resetCompletion();
    };

    const statusChip = (
        <span className="alloy-os-currentwork__header-meta">
            <span
                className={clsx(
                    "alloy-os-card-pill alloy-os-card-pill--subtle",
                    surface.status === "completed" && "alloy-os-card-pill--complete",
                )}
                data-work-status-pill={focused ? "focused" : "summary"}
            >
                {surface.statusLabel}
            </span>
            {surface.progress.total > 0 ?
                <span className="alloy-os-currentwork__header-percent">{surface.progress.percent}%</span>
            :   null}
        </span>
    );

    const footerAction = evidence.isEmpty ? null : (
        <button
            type="button"
            className="alloy-os-ucard__action alloy-os-ucard__action--system5"
            onClick={focused ? closeFocus : openFocus}
            data-work-action={focused ? "hide-details" : "details"}
        >
            {focused ? "Hide details" : "Details →"}
        </button>
    );

    const body =
        evidence.isEmpty ? (
            <div className="alloy-os-household__summary" data-work-empty="true">
                <p className="alloy-os-household__row-detail">No current work configured</p>
            </div>
        ) : completionPhase === "complete" && completionSummary ?
            <OutcomeCompleteBody
                surface={surface}
                summary={completionSummary}
                onViewActivity={() => coordination?.openFocusPanelMode?.("activity")}
                onContinue={() => {
                    resetCompletion();
                    setFocused(false);
                }}
            />
        : focused ?
            <FocusedBody
                surface={surface}
                completionPhase={completionPhase}
                pendingOutcome={pendingOutcome}
                pendingOutcomeKey={pendingOutcomeKey}
                primaryWorkItem={vm.primaryWorkItem}
                busy={busy}
                error={error}
                onChecklistItem={handleChecklistItem}
                handoffNotice={handoffNotice}
                onSelectOutcome={(key) => {
                    clearError();
                    setPendingOutcomeKey(key);
                    setCompletionPhase("confirm");
                }}
                onCancelOutcome={() => {
                    setPendingOutcomeKey(null);
                    setCompletionPhase("select_result");
                }}
                onConfirmOutcome={handleConfirmOutcome}
                onCancelPicker={() => {
                    setPendingOutcomeKey(null);
                    setCompletionPhase("working");
                }}
                onAction={invokeAction}
            />
        :   <SummaryBody
                surface={surface}
                onChecklistItem={handleChecklistItem}
                onAction={invokeAction}
                onViewActivity={() => coordination?.openFocusPanelMode?.("activity")}
            />;

    return (
        <div
            className="alloy-os-household alloy-os-currentwork"
            data-work-card="true"
            data-work-card-perspective={focused ? "focused" : evidence.isEmpty ? "empty" : "summary"}
            data-current-work-surface="true"
        >
            <UniversalCard
                title={vm.microLabel}
                insight={surface.title}
                supportingInsight={surface.description}
                iconName={model.iconName}
                tier={model.tier}
                archetype="status"
                statusChip={statusChip}
                statusTone={evidence.statusTone}
                density={focused ? "expanded" : "compact"}
                gridSpan={model.span}
                data-universal-card-key={model.key}
                receded={receded}
                footerAction={footerAction}
            >
                {body}
            </UniversalCard>
        </div>
    );
}

function SurfaceProgress({ progress }: { progress: CurrentWorkSurfaceVM["progress"] }) {
    if (progress.total <= 0) return null;
    return (
        <div className="alloy-os-currentwork__progress-block" data-work-progress="true">
            <div className="alloy-os-currentwork__progress-bar" aria-hidden>
                <span
                    className="alloy-os-currentwork__progress-bar-fill"
                    style={{ width: `${progress.percent}%` }}
                />
            </div>
            <p className="alloy-os-currentwork__progress-copy">
                {progress.completed} of {progress.total} complete
            </p>
        </div>
    );
}

function ChecklistStepper({
    items,
    onNavigate,
}: {
    items: CurrentWorkChecklistItemVM[];
    onNavigate: (item: CurrentWorkChecklistItemVM) => void;
}) {
    if (items.length === 0) return null;
    return (
        <ol className="alloy-os-currentwork__stepper" data-work-checklist="true">
            {items.map((item, index) => {
                const navigable =
                    item.status !== "complete"
                    && (item.actionRef != null || item.handoffItemId != null || item.targetLabel != null);
                const mark =
                    item.status === "complete" ? "✓"
                    : item.status === "blocked" ? "!"
                    : "○";
                const content = (
                    <>
                        <span
                            className={clsx(
                                "alloy-os-currentwork__stepper-mark",
                                item.status === "complete" && "alloy-os-currentwork__stepper-mark--complete",
                            )}
                            aria-hidden
                        >
                            {mark}
                        </span>
                        <span className="alloy-os-currentwork__stepper-label">{item.label}</span>
                        {navigable && item.targetLabel ?
                            <span className="alloy-os-currentwork__stepper-target">{item.targetLabel} →</span>
                        :   null}
                    </>
                );
                return (
                    <li key={item.key} className="alloy-os-currentwork__stepper-item">
                        {navigable ?
                            <button
                                type="button"
                                className="alloy-os-currentwork__stepper-button"
                                data-work-checklist-item={item.key}
                                onClick={() => onNavigate(item)}
                            >
                                {content}
                            </button>
                        :   <div className="alloy-os-currentwork__stepper-static" data-work-checklist-state={item.status}>
                                {content}
                            </div>
                        }
                        {index < items.length - 1 ?
                            <span className="alloy-os-currentwork__stepper-connector" aria-hidden />
                        :   null}
                    </li>
                );
            })}
        </ol>
    );
}

function WorkPrimaryCard({
    action,
    onAction,
}: {
    action: CurrentWorkActionVM;
    onAction: (action: CurrentWorkActionVM) => void;
}) {
    return (
        <button
            type="button"
            className="alloy-os-currentwork__work-primary"
            data-work-primary-action={action.key}
            onClick={() => onAction(action)}
        >
            <span className="alloy-os-currentwork__work-primary-label">{action.label}</span>
            {action.description ?
                <span className="alloy-os-currentwork__work-primary-desc">{action.description}</span>
            :   null}
        </button>
    );
}

function SupportingGrid({
    actions,
    onAction,
}: {
    actions: CurrentWorkActionVM[];
    onAction: (action: CurrentWorkActionVM) => void;
}) {
    if (actions.length === 0) return null;
    return (
        <div className="alloy-os-currentwork__supporting-grid" data-work-supporting-grid="true">
            <p className="alloy-os-currentwork__actions-eyebrow">Helpful actions</p>
            <div className="alloy-os-currentwork__supporting-grid-items">
                {actions.map((action) => (
                    <button
                        key={action.key}
                        type="button"
                        className="alloy-os-currentwork__grid-action"
                        data-work-supporting-action={action.key}
                        onClick={() => onAction(action)}
                    >
                        {action.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

function ActivityFooter({
    surface,
    onViewActivity,
}: {
    surface: CurrentWorkSurfaceVM;
    onViewActivity?: () => void;
}) {
    return (
        <div className="alloy-os-currentwork__activity-footer" data-work-activity-footer="true">
            {surface.lastActivity ?
                <p className="alloy-os-currentwork__last-activity">
                    Last contact: {surface.lastActivity.occurredAt ?? "—"}
                    {surface.lastActivity.detail ?
                        <span> · {surface.lastActivity.detail}</span>
                    : surface.lastActivity.label ?
                        <span> · {surface.lastActivity.label}</span>
                    :   null}
                </p>
            :   null}
            {onViewActivity ?
                <button type="button" className="alloy-os-currentwork__activity-link" onClick={onViewActivity}>
                    View all activity →
                </button>
            :   null}
        </div>
    );
}

function SummaryBody({
    surface,
    onChecklistItem,
    onAction,
    onViewActivity,
}: {
    surface: CurrentWorkSurfaceVM;
    onChecklistItem: (item: CurrentWorkChecklistItemVM) => void;
    onAction: (action: CurrentWorkActionVM) => void;
    onViewActivity?: () => void;
}) {
    const helpfulActions = [...surface.supportingActions, ...surface.communicationActions];
    return (
        <div className="alloy-os-currentwork__summary" data-work-summary="true">
            <SurfaceProgress progress={surface.progress} />
            <ChecklistStepper items={surface.checklist} onNavigate={onChecklistItem} />
            {surface.primaryAction ?
                <WorkPrimaryCard action={surface.primaryAction} onAction={onAction} />
            :   null}
            <SupportingGrid actions={helpfulActions} onAction={onAction} />
            <ActivityFooter surface={surface} onViewActivity={onViewActivity} />
        </div>
    );
}

function FocusedBody({
    surface,
    completionPhase,
    pendingOutcome,
    pendingOutcomeKey,
    primaryWorkItem,
    busy,
    error,
    onChecklistItem,
    handoffNotice,
    onSelectOutcome,
    onCancelOutcome,
    onConfirmOutcome,
    onCancelPicker,
    onAction,
}: {
    surface: CurrentWorkSurfaceVM;
    completionPhase: CompletionPhase;
    pendingOutcome: { outcome_key: string; label: string } | null;
    pendingOutcomeKey: string | null;
    primaryWorkItem: CurrentWorkSurfaceVM["primaryWorkItem"];
    busy: boolean;
    error: string | null;
    onChecklistItem: (item: CurrentWorkChecklistItemVM) => void;
    handoffNotice: string | null;
    onSelectOutcome: (key: string) => void;
    onCancelOutcome: () => void;
    onConfirmOutcome: () => void;
    onCancelPicker: () => void;
    onAction: (action: CurrentWorkActionVM) => void;
}) {
    if (completionPhase === "select_result" && primaryWorkItem) {
        return (
            <div className="alloy-os-currentwork__focus" data-work-completion="select">
                <StageWorkOutcomePicker
                    workTitle={primaryWorkItem.label}
                    outcomes={surface.completionOutcomes}
                    automationPreview={primaryWorkItem.outcome_automation_preview}
                    variant="focus"
                    busy={busy}
                    onSelect={onSelectOutcome}
                    onCancel={onCancelPicker}
                />
            </div>
        );
    }

    if (completionPhase === "confirm" && pendingOutcome && primaryWorkItem) {
        const effectLines = stageWorkOutcomeEffectLines(primaryWorkItem, pendingOutcomeKey!);
        return (
            <div className="alloy-os-currentwork__focus" data-work-completion="confirm">
                <StageWorkOutcomeConfirm
                    workTitle={primaryWorkItem.label}
                    outcomeLabel={pendingOutcome.label}
                    effectLines={effectLines}
                    busy={busy}
                    onConfirm={onConfirmOutcome}
                    onCancel={onCancelOutcome}
                />
            </div>
        );
    }

    if (completionPhase === "processing") {
        return (
            <div className="alloy-os-currentwork__focus" data-work-completion="processing">
                <p className="alloy-os-household__row-detail">Applying outcome…</p>
            </div>
        );
    }

    const helpfulActions = [...surface.supportingActions, ...surface.communicationActions];

    return (
        <div className="alloy-os-currentwork__focus" data-work-completion="working">
            <SurfaceProgress progress={surface.progress} />
            <ChecklistStepper items={surface.checklist} onNavigate={onChecklistItem} />
            {handoffNotice ?
                <p className="alloy-os-currentwork__handoff-notice" role="status" data-work-handoff-blocked="true">
                    {handoffNotice}
                </p>
            :   null}
            <div className="alloy-os-currentwork__expanded-grid">
                <div className="alloy-os-currentwork__expanded-main">
                    {surface.primaryAction ?
                        <WorkPrimaryCard action={surface.primaryAction} onAction={onAction} />
                    :   null}
                    {surface.recordOutcomeAction ?
                        <button
                            type="button"
                            className="alloy-os-currentwork__record-outcome"
                            data-work-action="record-outcome"
                            onClick={() => onAction(surface.recordOutcomeAction!)}
                        >
                            {surface.recordOutcomeAction.label}
                        </button>
                    :   null}
                    {!surface.showOutcomeCompletion && surface.outcomeCompletionBlockReason ?
                        <p className="alloy-os-currentwork__outcomes-gap" data-work-outcomes-gap="true" role="status">
                            {surface.outcomeCompletionBlockReason}
                        </p>
                    :   null}
                    <SupportingGrid actions={helpfulActions} onAction={onAction} />
                </div>
                {surface.alternatePaths.length > 0 || surface.bosRecommendations.length > 0 ?
                    <div className="alloy-os-currentwork__expanded-side">
                        {surface.alternatePaths.length > 0 ?
                            <div className="alloy-os-currentwork__path-list" data-work-section="alternate">
                                <p className="alloy-os-currentwork__supporting-title">Other paths</p>
                                <ul className="alloy-os-currentwork__path-items">
                                    {surface.alternatePaths.map((action) => (
                                        <li key={action.key}>
                                            <button
                                                type="button"
                                                className="alloy-os-currentwork__path-action"
                                                onClick={() => onAction(action)}
                                            >
                                                {action.label}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        :   null}
                        {surface.bosRecommendations.length > 0 ?
                            <div className="alloy-os-currentwork__path-list" data-work-section="bos">
                                <p className="alloy-os-currentwork__supporting-title">Recommended</p>
                                <ul className="alloy-os-currentwork__path-items">
                                    {surface.bosRecommendations.map((action) => (
                                        <li key={action.key}>
                                            <button
                                                type="button"
                                                className="alloy-os-currentwork__path-action"
                                                onClick={() => onAction(action)}
                                            >
                                                {action.label}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        :   null}
                    </div>
                :   null}
            </div>
            {error ?
                <p className="alloy-os-currentwork__error" role="alert">
                    {error}
                </p>
            :   null}
        </div>
    );
}

function OutcomeCompleteBody({
    surface,
    summary,
    onViewActivity,
    onContinue,
}: {
    surface: CurrentWorkSurfaceVM;
    summary: CurrentWorkCompletionSummary;
    onViewActivity?: () => void;
    onContinue: () => void;
}) {
    return (
        <div className="alloy-os-currentwork__complete" data-work-completion="complete">
            <p className="alloy-os-currentwork__complete-eyebrow">Current Work</p>
            <span className="alloy-os-card-pill alloy-os-card-pill--complete">Completed</span>
            <h3 className="alloy-os-currentwork__complete-title">{surface.title}</h3>
            <p className="alloy-os-currentwork__complete-outcome">{summary.outcomeLabel}</p>
            <div className="alloy-os-currentwork__complete-changes">
                {summary.changeLines.map((line) => (
                    <p key={line} className="alloy-os-currentwork__complete-change">
                        ✓ {line}
                    </p>
                ))}
                <p className="alloy-os-currentwork__complete-summary">{summary.summary}</p>
            </div>
            {summary.nextReminderLabel ?
                <p className="alloy-os-currentwork__complete-reminder">{summary.nextReminderLabel}</p>
            :   null}
            {summary.nextWorkLabel ?
                <div className="alloy-os-currentwork__complete-next">
                    <p className="alloy-os-currentwork__supporting-title">What&apos;s next</p>
                    <p className="alloy-os-currentwork__complete-next-label">{summary.nextWorkLabel}</p>
                </div>
            :   null}
            <div className="alloy-os-card-nav" data-work-complete-actions="true">
                {onViewActivity ?
                    <button type="button" className="alloy-os-ucard__action alloy-os-ucard__action--system5" onClick={onViewActivity}>
                        View Activity
                    </button>
                :   null}
                <button
                    type="button"
                    className="alloy-os-ucard__action alloy-os-ucard__action--system5 alloy-os-ucard__action--cta"
                    onClick={onContinue}
                >
                    Continue Work
                </button>
            </div>
        </div>
    );
}
