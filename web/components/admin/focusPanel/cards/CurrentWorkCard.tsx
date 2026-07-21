"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";

import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import CurrentWorkActionPanel from "@/components/admin/focusPanel/cards/CurrentWorkActionPanel";
import CurrentWorkActivityPreview, {
    type CurrentWorkActivityPreviewItem,
} from "@/components/admin/focusPanel/cards/CurrentWorkActivityPreview";
import CurrentWorkWorkspace from "@/components/admin/focusPanel/cards/CurrentWorkWorkspace";
import { useWorkIntentOutcomeCompletion } from "@/components/workIntent/useWorkIntentOutcomeCompletion";
import { buildCurrentWorkActivityPreviewItemsFromContext } from "@/lib/adminV2/runtime/focusPanel/currentWork/buildCurrentWorkActivityPreviewItems";
import { buildCurrentWorkCardEvidence } from "@/lib/adminV2/runtime/focusPanel/currentWork/buildCurrentWorkCardEvidence";
import { buildOutcomeCompletionSummary } from "@/lib/adminV2/runtime/focusPanel/currentWork/buildOutcomeCompletionSummary";
import type { CurrentWorkChecklistItem } from "@/lib/adminV2/runtime/focusPanel/currentWork/projectCurrentWork";
import { resolveWorkItemHandoff } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolveWorkItemHandoff";
import { handoffOwnerCardForChecklistScope } from "@/lib/adminV2/runtime/focusPanel/currentWork/buildCurrentWorkSurfaceVM";
import {
    isCurrentWorkActionExecutable,
    planCurrentWorkActionExecution,
} from "@/lib/adminV2/runtime/focusPanel/currentWork/executeCurrentWorkAction";
import type {
    CurrentWorkActionVM,
    CurrentWorkChecklistItemVM,
    CurrentWorkCompletionSummary,
    CurrentWorkSurfaceVM,
} from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkSurfaceTypes";
import type { FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { FocusPanelCoordination } from "@/lib/adminV2/runtime/focusPanel/focusPanelCoordinationModel";
import type { FocusPanelMutation } from "@/lib/adminV2/runtime/focusPanel/focusPanelMutation";
import type { OperationalContext } from "@/lib/adminV2/runtime/operationalContext/types";
import { ADMIN_V2_OPPORTUNITY_FOCUS_CURRENT_WORK } from "@/lib/workItems/workItemsNavigation";
import { stageWorkOutcomeEffectLines } from "@/lib/workIntent/stageWorkOutcomeEffectLines";

type Props = {
    model: FocusPanelCardModel;
    context: OperationalContext;
    receded?: boolean;
    coordination?: FocusPanelCoordination;
    mutation?: FocusPanelMutation;
    /** Summary card in the identity grid, or full Focus Panel workspace takeover. */
    presentation?: "summary" | "workspace";
};

type CompletionPhase = "working" | "select_result" | "confirm" | "processing" | "complete";

export default function CurrentWorkCard({
    model,
    context,
    receded = false,
    coordination,
    mutation,
    presentation = "summary",
}: Props) {
    const evidence = useMemo(() => buildCurrentWorkCardEvidence(context), [context]);
    const vm = evidence.viewModel;
    const surface = vm.surface;
    const opportunityId = context.subject.id;
    const { completeOutcome, busy, error, clearError } = useWorkIntentOutcomeCompletion(opportunityId);
    const isWorkspace = presentation === "workspace";
    // Tier-2 stage work still resolving — hold a neutral loading treatment in the region's final
    // geometry. A pending projection must NEVER render as "No active work" (false-empty).
    const stageWorkPending = context.stageWorkPending === true;

    const [completionPhase, setCompletionPhase] = useState<CompletionPhase>("working");
    const [pendingOutcomeKey, setPendingOutcomeKey] = useState<string | null>(null);
    const [completionSummary, setCompletionSummary] = useState<CurrentWorkCompletionSummary | null>(null);
    const [handoffNotice, setHandoffNotice] = useState<string | null>(null);
    const [activePanelAction, setActivePanelAction] = useState<CurrentWorkActionVM | null>(null);
    const [activityPreviewOpen, setActivityPreviewOpen] = useState(false);
    const openWorkspaceTriggerRef = useRef<HTMLButtonElement>(null);

    const activityPreviewItems = useMemo(
        () => buildCurrentWorkActivityPreviewItemsFromContext(context, {
            currentWorkId: vm.primaryWorkItem?.work_id ?? undefined,
            workTemplateKey: vm.primaryWorkItem?.template_key ?? undefined,
        }),
        [context, vm.primaryWorkItem?.template_key, vm.primaryWorkItem?.work_id],
    );

    const closeActionPanel = useCallback(() => {
        setActivePanelAction(null);
    }, []);

    const handleViewFullActivity = useCallback(() => {
        setActivityPreviewOpen(false);
        coordination?.openFocusPanelMode?.("activity");
    }, [coordination]);

    const handleCloseActivityPreview = useCallback(() => {
        setActivityPreviewOpen(false);
    }, []);

    const handleActionPanelComplete = useCallback(() => {
        closeActionPanel();
    }, [closeActionPanel]);

    const pendingOutcome =
        vm.completionOutcomes.find((row) => row.outcome_key === pendingOutcomeKey) ?? null;

    const resetCompletion = useCallback(() => {
        setCompletionPhase("working");
        setPendingOutcomeKey(null);
        setCompletionSummary(null);
        clearError();
    }, [clearError]);

    const openWorkspace = useCallback(
        (intent: NonNullable<Parameters<NonNullable<FocusPanelCoordination["openCurrentWorkWorkspace"]>>[0]> = {
            kind: "drill_in",
        }) => {
            resetCompletion();
            closeActionPanel();
            coordination?.openCurrentWorkWorkspace?.(intent);
        },
        [closeActionPanel, coordination, resetCompletion],
    );

    const closeWorkspace = useCallback(() => {
        resetCompletion();
        closeActionPanel();
        setActivityPreviewOpen(false);
        coordination?.closeCurrentWorkWorkspace?.();
        queueMicrotask(() => openWorkspaceTriggerRef.current?.focus());
    }, [closeActionPanel, coordination, resetCompletion]);

    useEffect(() => {
        const onFocusCurrentWork = (event: Event) => {
            const detail = (event as CustomEvent<{ opportunity_id?: string; task_id?: string | null }>).detail;
            if (detail?.opportunity_id !== opportunityId) return;
            openWorkspace({ kind: "drill_in" });
        };
        window.addEventListener(ADMIN_V2_OPPORTUNITY_FOCUS_CURRENT_WORK, onFocusCurrentWork as EventListener);
        return () => window.removeEventListener(ADMIN_V2_OPPORTUNITY_FOCUS_CURRENT_WORK, onFocusCurrentWork as EventListener);
    }, [openWorkspace, opportunityId]);

    // Consume one-shot workspace intents (action panel / record outcome) after mount.
    const workspaceIntent = coordination?.currentWorkWorkspace?.intent ?? null;
    const workspaceIntentKind = workspaceIntent?.kind ?? null;
    const workspaceIntentActionKey =
        workspaceIntent && workspaceIntent.kind === "action" ? workspaceIntent.actionKey : null;
    useEffect(() => {
        if (!isWorkspace || !workspaceIntentKind) return;
        if (workspaceIntentKind === "record_outcome") {
            setCompletionPhase("select_result");
        } else if (workspaceIntentKind === "action" && workspaceIntentActionKey) {
            const allActions = [
                surface.primaryAction,
                surface.recordOutcomeAction,
                ...surface.supportingActions,
                ...surface.communicationActions,
                ...surface.alternatePaths,
            ].filter(Boolean) as CurrentWorkActionVM[];
            const match = allActions.find(
                (action) =>
                    action.key === workspaceIntentActionKey
                    || action.actionRef === workspaceIntentActionKey
                    || action.handlerKey === workspaceIntentActionKey,
            );
            if (match) setActivePanelAction(match);
        }
        coordination?.clearCurrentWorkWorkspaceIntent?.();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- consume intent once per open
    }, [isWorkspace, workspaceIntentKind, workspaceIntentActionKey]);

    const invokeHeaderDelegate = (action: CurrentWorkActionVM) => {
        const resolved = action.resolved;
        if (resolved && coordination?.invokeHeaderAction) {
            coordination.invokeHeaderAction(resolved);
            return;
        }
        if (coordination?.invokeHeaderAction) {
            coordination.invokeHeaderAction({
                key: action.handlerKey ?? action.key,
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

    const invokeCommunicationsComposer = () => {
        const composer = coordination?.resolveCommunicationsComposerAction?.();
        if (composer && coordination?.invokeHeaderAction) {
            setHandoffNotice(null);
            coordination.invokeHeaderAction(composer);
            return;
        }
        if (coordination?.focusTargets?.has("communications") && coordination.requestFocus) {
            setHandoffNotice(null);
            coordination.requestFocus("communications", null, { card: "current_work", focus: null });
            return;
        }
        setHandoffNotice(
            "No communications composer is available — open Activity or add Communications to this panel.",
        );
    };

    const invokeAction = (action: CurrentWorkActionVM) => {
        const plan = planCurrentWorkActionExecution(action);
        switch (plan.kind) {
            case "blocked":
                setHandoffNotice(plan.reason);
                return;
            case "unsupported":
                setHandoffNotice(plan.reason);
                return;
            case "record_outcome":
                if (!isWorkspace) {
                    openWorkspace({ kind: "record_outcome" });
                    return;
                }
                closeActionPanel();
                setCompletionPhase("select_result");
                return;
            case "open_workspace":
                openWorkspace({ kind: "drill_in" });
                return;
            case "open_inline_panel":
                setHandoffNotice(null);
                if (!isWorkspace) {
                    openWorkspace({ kind: "action", actionKey: plan.action.key });
                    return;
                }
                setActivePanelAction(plan.action);
                return;
            case "process_transition":
                setHandoffNotice(null);
                if (!isWorkspace) {
                    openWorkspace({ kind: "action", actionKey: plan.action.key });
                    return;
                }
                setActivePanelAction(plan.action);
                return;
            case "communications_composer":
                invokeCommunicationsComposer();
                return;
            case "header_delegate":
                setHandoffNotice(null);
                invokeHeaderDelegate(plan.action);
                return;
            default:
                setHandoffNotice("This action is not available from Current Work.");
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
            if (isWorkspace) coordination.closeCurrentWorkWorkspace?.();
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
                setActivityPreviewOpen(true);
                return;
            case "header_action": {
                const composerAction = coordination?.resolveCommunicationsComposerAction?.();
                if (composerAction && coordination?.invokeHeaderAction) {
                    setHandoffNotice(null);
                    coordination.invokeHeaderAction(composerAction);
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
                if (isWorkspace) coordination?.closeCurrentWorkWorkspace?.();
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

    const statusChip = (
        <span
            className={clsx(
                "alloy-os-card-pill alloy-os-card-pill--subtle alloy-os-currentwork__status-chip",
                surface.status === "completed" && "alloy-os-card-pill--complete",
                surface.status === "blocked" && "alloy-os-card-pill--blocked",
            )}
            data-work-status-pill="summary"
        >
            {surface.statusLabel}
        </span>
    );

    const footerAction = null;
    const stageLabel = context.businessProcess?.stageKey ?? null;
    const ownerLabel = null;

    if (isWorkspace) {
        if (stageWorkPending) {
            return (
                <section
                    className="alloy-os-currentwork-workspace"
                    data-current-work-workspace="true"
                    data-work-pending="true"
                    aria-busy="true"
                >
                    <button
                        type="button"
                        className="alloy-os-currentwork-workspace__back"
                        onClick={closeWorkspace}
                        data-work-action="back-to-summary"
                    >
                        ← Back to summary
                    </button>
                    <p className="alloy-os-household__row-detail alloy-os-currentwork__pending" aria-label="Loading current work">
                        Loading current work…
                    </p>
                </section>
            );
        }
        if (evidence.isEmpty) {
            return (
                <section className="alloy-os-currentwork-workspace" data-current-work-workspace="true" data-work-empty="true">
                    <button
                        type="button"
                        className="alloy-os-currentwork-workspace__back"
                        onClick={closeWorkspace}
                        data-work-action="back-to-summary"
                    >
                        ← Back to summary
                    </button>
                    <p className="alloy-os-household__row-detail">No active work</p>
                </section>
            );
        }
        return (
            <CurrentWorkWorkspace
                surface={surface}
                completionPhase={completionPhase}
                pendingOutcome={pendingOutcome}
                pendingOutcomeKey={pendingOutcomeKey}
                primaryWorkItem={vm.primaryWorkItem}
                busy={busy}
                error={error}
                handoffNotice={handoffNotice}
                activityItems={activityPreviewItems}
                activityPreviewOpen={activityPreviewOpen}
                onToggleActivityPreview={() => setActivityPreviewOpen((open) => !open)}
                onCloseActivityPreview={handleCloseActivityPreview}
                onViewFullActivity={handleViewFullActivity}
                onChecklistItem={handleChecklistItem}
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
                onBack={closeWorkspace}
                onContinueAfterComplete={() => {
                    if (completionSummary?.nextWorkLabel) {
                        resetCompletion();
                        return;
                    }
                    closeWorkspace();
                }}
                completionSummary={completionSummary}
                stageLabel={stageLabel}
                ownerLabel={ownerLabel}
                actionPanel={
                    activePanelAction ?
                        <CurrentWorkActionPanel
                            action={activePanelAction}
                            context={context}
                            mutation={mutation}
                            onClose={closeActionPanel}
                            onComplete={handleActionPanelComplete}
                        />
                    :   null
                }
            />
        );
    }

    const body =
        stageWorkPending ? (
            <div className="alloy-os-household__summary" data-work-pending="true" aria-busy="true">
                <p className="alloy-os-household__row-detail alloy-os-currentwork__pending" aria-label="Loading current work">
                    Loading current work…
                </p>
            </div>
        ) : evidence.isEmpty ? (
            <div className="alloy-os-household__summary" data-work-empty="true">
                <p className="alloy-os-household__row-detail">No current work configured</p>
            </div>
        ) : completionPhase === "complete" && completionSummary ?
            <OutcomeCompleteBody
                surface={surface}
                summary={completionSummary}
                activityPreviewOpen={activityPreviewOpen}
                onToggleActivityPreview={() => setActivityPreviewOpen((open) => !open)}
                onCloseActivityPreview={handleCloseActivityPreview}
                onViewFullActivity={handleViewFullActivity}
                activityPreviewItems={activityPreviewItems}
                onContinue={() => {
                    resetCompletion();
                }}
            />
        :   <SummaryBody
                surface={surface}
                onChecklistItem={handleChecklistItem}
                onAction={invokeAction}
            />;

    return (
        <div
            className="alloy-os-household alloy-os-currentwork"
            data-work-card="true"
            data-work-card-perspective={stageWorkPending ? "pending" : evidence.isEmpty ? "empty" : "summary"}
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
                statusTone={surface.progress.total > 0 ? "neutral" : evidence.statusTone}
                density="compact"
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

/**
 * What's Next readiness — a CONCISE summary, not the full field checklist. Shows only the OUTSTANDING
 * requirements ("Still needed"); the complete/satisfied field inventory is owned by the Required
 * Information card and is deliberately not reproduced here (that dump is where duplicate labels and
 * internal identifiers leaked). Deduplicates by label and caps, with a handoff to Required Information
 * for the rest. Derives entirely from the View Model — no new runtime, no new field.
 */
export function ReadinessSummary({
    surface,
    onNavigate,
}: {
    surface: CurrentWorkSurfaceVM;
    onNavigate: (item: CurrentWorkChecklistItemVM) => void;
}) {
    const items: CurrentWorkChecklistItemVM[] = surface.readiness.requirements?.items ?? [];
    const seen = new Set<string>();
    const stillNeeded = items.filter((item) => {
        if (item.status === "complete") return false;
        const key = item.label.trim().toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
    if (stillNeeded.length === 0) return null;
    const CAP = 4;
    const visible = stillNeeded.slice(0, CAP);
    const overflow = stillNeeded.length - visible.length;
    return (
        <div className="alloy-os-currentwork__readiness-block" data-work-readiness="true" data-work-readiness-group="still-needed">
            <p className="alloy-os-currentwork__readiness-reason">Still needed</p>
            <ChecklistStepper items={visible} onNavigate={onNavigate} />
            {overflow > 0 ?
                <p className="alloy-os-currentwork__disclosure-overflow">
                    +{overflow} more in Required information
                </p>
            :   null}
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

function SummaryBody({
    surface,
    onChecklistItem,
    onAction,
}: {
    surface: CurrentWorkSurfaceVM;
    onChecklistItem: (item: CurrentWorkChecklistItemVM) => void;
    onAction: (action: CurrentWorkActionVM) => void;
}) {
    const primary =
        surface.primaryAction
        && surface.primaryAction.handlerKey !== "expand_work"
        && isCurrentWorkActionExecutable(surface.primaryAction)
            ? surface.primaryAction
            : null;
    const recordOutcome =
        surface.recordOutcomeAction && isCurrentWorkActionExecutable(surface.recordOutcomeAction)
            ? surface.recordOutcomeAction
            : null;
    // ONE dominant action = the configured command; when work is outcome-led (no command), declaring
    // the outcome IS the obligation, so it leads. Everything else (helpful actions, outcome access)
    // stays visually subordinate. Runtime-derived — labels are never invented here.
    const dominant = primary ?? recordOutcome;
    const subordinateOutcome = primary ? recordOutcome : null;
    const helpful = surface.supportingActions.filter(isCurrentWorkActionExecutable).slice(0, 2);

    return (
        <div
            className="alloy-os-currentwork__summary"
            data-work-summary="true"
            role="group"
            aria-label="What's Next summary"
        >
            <div className="alloy-os-currentwork__summary-controls">
                {dominant ?
                    <div className="alloy-os-currentwork__primary-row" data-work-primary-row="true">
                        <button
                            type="button"
                            className="alloy-os-currentwork__primary-action"
                            data-work-primary-action={dominant.key}
                            data-work-action={dominant === recordOutcome ? "record-outcome" : undefined}
                            onClick={() => onAction(dominant)}
                        >
                            {dominant.label}
                        </button>
                        {helpful.map((action) => (
                            <button
                                key={action.key}
                                type="button"
                                className="alloy-os-currentwork__record-outcome alloy-os-currentwork__record-outcome--summary"
                                data-work-supporting-action={action.key}
                                onClick={() => onAction(action)}
                            >
                                {action.label}
                            </button>
                        ))}
                        {subordinateOutcome ?
                            <button
                                type="button"
                                className="alloy-os-currentwork__record-outcome alloy-os-currentwork__record-outcome--summary"
                                data-work-action="record-outcome"
                                onClick={() => onAction(subordinateOutcome)}
                            >
                                {subordinateOutcome.label}
                            </button>
                        :   null}
                    </div>
                :   null}
                {/* WHAT'S NEXT — obligation-first. Obligation + one concise why live in the card header;
                    the body leads with ONE dominant action, keeps secondary actions and outcome access
                    visually subordinate, and shows a concise "Still needed" readiness summary. Detailed
                    completeness is owned by the Required Information card and is not reproduced here. */}
                <ReadinessSummary surface={surface} onNavigate={onChecklistItem} />
            </div>
        </div>
    );
}

function OutcomeCompleteBody({
    surface,
    summary,
    activityPreviewOpen,
    onToggleActivityPreview,
    onCloseActivityPreview,
    onViewFullActivity,
    activityPreviewItems,
    onContinue,
}: {
    surface: CurrentWorkSurfaceVM;
    summary: CurrentWorkCompletionSummary;
    activityPreviewOpen: boolean;
    onToggleActivityPreview: () => void;
    onCloseActivityPreview: () => void;
    onViewFullActivity?: () => void;
    activityPreviewItems: CurrentWorkActivityPreviewItem[];
    onContinue: () => void;
}) {
    const triggerRef = useRef<HTMLButtonElement>(null);

    return (
        <div className="alloy-os-currentwork__complete" data-work-completion="complete">
            <p className="alloy-os-currentwork__complete-eyebrow">What's Next</p>
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
                <div className="alloy-os-currentwork__activity-link-wrap">
                    <button
                        ref={triggerRef}
                        type="button"
                        className="alloy-os-ucard__action alloy-os-ucard__action--system5"
                        onClick={onToggleActivityPreview}
                        aria-expanded={activityPreviewOpen}
                        data-work-action="preview-activity"
                    >
                        View recent activity
                    </button>
                    <CurrentWorkActivityPreview
                        open={activityPreviewOpen}
                        items={activityPreviewItems}
                        onClose={onCloseActivityPreview}
                        onViewFullActivity={onViewFullActivity}
                        triggerRef={triggerRef}
                    />
                </div>
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
