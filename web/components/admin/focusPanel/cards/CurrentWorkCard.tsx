"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";

import StageWorkOutcomePicker from "@/components/admin/StageWorkOutcomePicker";
import StageWorkOutcomeConfirm from "@/components/workIntent/StageWorkOutcomeConfirm";
import UniversalCard from "@/components/admin/focusPanel/UniversalCard";
import { useWorkIntentOutcomeCompletion } from "@/components/workIntent/useWorkIntentOutcomeCompletion";
import {
    buildCurrentWorkCardEvidence,
} from "@/lib/adminV2/runtime/focusPanel/currentWork/buildCurrentWorkCardEvidence";
import type { CurrentWorkChecklistItem } from "@/lib/adminV2/runtime/focusPanel/currentWork/projectCurrentWork";
import {
    isOutreachChecklistItem,
    resolveWorkItemHandoff,
} from "@/lib/adminV2/runtime/focusPanel/currentWork/resolveWorkItemHandoff";
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
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import { stageWorkOutcomeEffectLines } from "@/lib/workIntent/stageWorkOutcomeEffectLines";

type Props = {
    model: FocusPanelCardModel;
    context: OperationalContext;
    receded?: boolean;
    coordination?: FocusPanelCoordination;
};

type CompletionPhase = "working" | "select_result" | "confirm" | "processing";

/**
 * Current Work operational surface (Work-owning archetype).
 * Summary → Focus → completion inside Focus — same grammar as Household.
 *
 * @see docs/platform/operator/current-work-surface.md
 */
export default function CurrentWorkCard({ model, context, receded = false, coordination }: Props) {
    const evidence = useMemo(() => buildCurrentWorkCardEvidence(context), [context]);
    const vm = evidence.viewModel;
    const opportunityId = context.subject.id;
    const { completeOutcome, busy, error, clearError } = useWorkIntentOutcomeCompletion(opportunityId);

    const [focused, setFocused] = useState(false);
    const [completionPhase, setCompletionPhase] = useState<CompletionPhase>("working");
    const [pendingOutcomeKey, setPendingOutcomeKey] = useState<string | null>(null);
    const [handoffNotice, setHandoffNotice] = useState<string | null>(null);

    const pendingOutcome =
        vm.completionOutcomes.find((row) => row.outcome_key === pendingOutcomeKey) ?? null;

    const resetCompletion = useCallback(() => {
        setCompletionPhase("working");
        setPendingOutcomeKey(null);
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

    const openFocusOnly = () => {
        setFocused(true);
        resetCompletion();
    };

    const handleChecklistItem = (item: CurrentWorkChecklistItem) => {
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
        if (!pendingOutcomeKey || !vm.primaryProjection) return;
        setCompletionPhase("processing");
        void completeOutcome(vm.primaryProjection, pendingOutcomeKey).then(() => {
            resetCompletion();
            setCompletionPhase("working");
        });
    }, [completeOutcome, pendingOutcomeKey, resetCompletion, vm.primaryProjection]);

    const closeFocus = () => {
        setFocused(false);
        resetCompletion();
    };

    // Focus footer: Back left · configured completion CTA right (dominant filled action).
    // Summary: Complete CTA when outcomes exist; otherwise quiet Open → to Focus.
    const footerAction =
        evidence.isEmpty ? null
        : focused && completionPhase === "working" ?
            <div className="alloy-os-card-nav" data-work-focus-footer="true">
                <button
                    type="button"
                    className="alloy-os-ucard__action alloy-os-ucard__action--system5"
                    onClick={closeFocus}
                    data-work-action="back"
                >
                    ← Back to panel
                </button>
                {vm.showOutcomeCompletion && vm.primaryActionLabel ?
                    <button
                        type="button"
                        className="alloy-os-ucard__action alloy-os-ucard__action--system5"
                        onClick={() => setCompletionPhase("select_result")}
                        data-work-action="complete"
                    >
                        {vm.primaryActionLabel} →
                    </button>
                :   <button
                        type="button"
                        className="alloy-os-ucard__action alloy-os-ucard__action--system5"
                        disabled
                        data-work-action="complete-unavailable"
                        title={vm.outcomeCompletionBlockReason ?? "No completion outcomes configured"}
                    >
                        {vm.outcomeCompletionBlockReason ?? "No completion outcomes configured"}
                    </button>
                }
            </div>
        : focused ? null
        :   <button
              type="button"
              className="alloy-os-ucard__action alloy-os-ucard__action--system5"
              onClick={openFocusOnly}
              data-work-action="open"
          >
              {vm.primaryActionLabel ? `${vm.primaryActionLabel} →` : "Open work →"}
          </button>;

    const body =
        evidence.isEmpty ? (
            <div className="alloy-os-household__summary" data-work-empty="true">
                <p className="alloy-os-household__row-detail">No current work configured</p>
            </div>
        ) : focused ? (
            <FocusedBody
                vm={vm}
                completionPhase={completionPhase}
                pendingOutcome={pendingOutcome}
                pendingOutcomeKey={pendingOutcomeKey}
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
                onBack={closeFocus}
                onCancelPicker={() => {
                    setPendingOutcomeKey(null);
                    setCompletionPhase("working");
                }}
                onSupportingAction={(action) => coordination?.invokeHeaderAction?.(action)}
            />
        ) : null;

    return (
        <div
            className="alloy-os-household alloy-os-currentwork"
            data-work-card="true"
            data-work-card-perspective={focused ? "focused" : evidence.isEmpty ? "empty" : "summary"}
            data-current-work-surface="true"
        >
            <UniversalCard
                title={vm.microLabel}
                insight={evidence.answerLine}
                supportingInsight={evidence.supportingLine}
                iconName={model.iconName}
                tier={model.tier}
                archetype="status"
                statusChip={
                    focused ?
                        <span className="alloy-os-card-pill alloy-os-card-pill--work" data-work-status-pill="open">
                            Open work
                        </span>
                    :   evidence.statusChip
                }
                statusTone={focused ? "ready" : evidence.statusTone}
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

function FocusedBody({
    vm,
    completionPhase,
    pendingOutcome,
    pendingOutcomeKey,
    busy,
    error,
    onChecklistItem,
    handoffNotice,
    onSelectOutcome,
    onCancelOutcome,
    onConfirmOutcome,
    onBack,
    onCancelPicker,
    onSupportingAction,
}: {
    vm: ReturnType<typeof buildCurrentWorkCardEvidence>["viewModel"];
    completionPhase: CompletionPhase;
    pendingOutcome: { outcome_key: string; label: string } | null;
    pendingOutcomeKey: string | null;
    busy: boolean;
    error: string | null;
    onChecklistItem: (item: CurrentWorkChecklistItem) => void;
    handoffNotice: string | null;
    onSelectOutcome: (key: string) => void;
    onCancelOutcome: () => void;
    onConfirmOutcome: () => void;
    onBack: () => void;
    onCancelPicker: () => void;
    onSupportingAction: (action: ResolvedActionForClient) => void;
}) {
    if (completionPhase === "select_result" && vm.primaryWorkItem) {
        return (
            <div className="alloy-os-currentwork__focus" data-work-completion="select">
                <StageWorkOutcomePicker
                    workTitle={vm.primaryWorkItem.label}
                    outcomes={vm.completionOutcomes}
                    automationPreview={vm.primaryWorkItem.outcome_automation_preview}
                    variant="focus"
                    busy={busy}
                    onSelect={onSelectOutcome}
                    onCancel={onCancelPicker}
                />
            </div>
        );
    }

    if (completionPhase === "confirm" && pendingOutcome && vm.primaryWorkItem) {
        return (
            <div className="alloy-os-currentwork__focus" data-work-completion="confirm">
                <StageWorkOutcomeConfirm
                    outcomeLabel={pendingOutcome.label}
                    effectLines={stageWorkOutcomeEffectLines(vm.primaryWorkItem, pendingOutcomeKey!)}
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
                <p className="alloy-os-household__row-detail">Finishing up…</p>
            </div>
        );
    }

    return (
        <div className="alloy-os-currentwork__focus" data-work-completion="working">
            {vm.purpose ?
                <p className="alloy-os-household__row-detail alloy-os-currentwork__purpose">{vm.purpose}</p>
            :   null}
            {vm.progressLabel ?
                <p className="alloy-os-currentwork__progress">
                    <span>{vm.progressLabel}</span>
                    {vm.progressVerdict ?
                        <span className="alloy-os-currentwork__progress-verdict">{vm.progressVerdict}</span>
                    :   null}
                </p>
            :   null}
            {vm.blockers.length > 0 ?
                <div className="alloy-os-currentwork__blockers" data-work-blockers>
                    <p className="alloy-os-currentwork__blockers-title">You can&apos;t finish until…</p>
                    {vm.blockers.map((blocker) => (
                        <p key={blocker.label} className="alloy-os-currentwork__blocker">
                            {blocker.label}
                        </p>
                    ))}
                </div>
            :   null}
            {vm.checklist.length > 0 ?
                <ul className="alloy-os-currentwork__checklist" data-work-checklist>
                    {vm.checklist.map((item) => (
                        <ChecklistRow key={item.id} item={item} onNavigate={onChecklistItem} />
                    ))}
                </ul>
            :   null}
            {handoffNotice ?
                <p className="alloy-os-currentwork__handoff-notice" role="status" data-work-handoff-blocked="true">
                    {handoffNotice}
                </p>
            :   null}
            {!vm.showOutcomeCompletion && vm.outcomeCompletionBlockReason ?
                <p className="alloy-os-currentwork__outcomes-gap" data-work-outcomes-gap="true" role="status">
                    {vm.outcomeCompletionBlockReason}
                </p>
            :   null}
            {vm.supportingActions.length > 0 ?
                <div className="alloy-os-currentwork__supporting" data-work-supporting>
                    <p className="alloy-os-currentwork__supporting-title">Supporting</p>
                    <ul className="alloy-os-currentwork__supporting-list">
                        {vm.supportingActions.map((action) => (
                            <li key={action.key}>
                                <button
                                    type="button"
                                    className="alloy-os-currentwork__supporting-action"
                                    data-work-supporting-action={action.key}
                                    onClick={() => onSupportingAction(action)}
                                >
                                    {action.label}
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            :   null}
            {error ?
                <p className="alloy-os-currentwork__error" role="alert">
                    {error}
                </p>
            :   null}
        </div>
    );
}

function ChecklistRow({
    item,
    onNavigate,
}: {
    item: CurrentWorkChecklistItem;
    onNavigate: (item: CurrentWorkChecklistItem) => void;
}) {
    const isAction = isOutreachChecklistItem(item);
    const navigable = item.state !== "complete" && (item.ownerCard != null || isAction);
    const inner = (
        <>
            <span
                className={clsx(
                    "alloy-os-household__avatar",
                    item.state === "complete" ? "alloy-os-card-lead--positive" : "alloy-os-card-lead--work",
                )}
                aria-hidden
            >
                {item.state === "complete" ? "✓" : isAction ? "↗" : "→"}
            </span>
            <span className="alloy-os-household__row-main min-w-0">
                <span className="alloy-os-household__row-name">
                    {item.label}
                    {isAction ?
                        <span className="alloy-os-card-pill alloy-os-card-pill--work" data-work-action-pill="true">
                            Action
                        </span>
                    :   null}
                </span>
                {item.description ?
                    <span className="alloy-os-household__row-detail">{item.description}</span>
                :   null}
            </span>
            {navigable ?
                <span className="alloy-os-readiness__pointer" aria-hidden>
                    {item.ownerCard === "household" ? "Household"
                    : item.ownerCard === "children" ? "Children"
                    : item.ownerCard === "communications" || isAction ? "Communications"
                    : item.ownerCard === "documents" ? "Documents"
                    : "Open"} →
                </span>
            :   null}
        </>
    );

    if (navigable) {
        return (
            <li>
                <button
                    type="button"
                    className={clsx(
                        "alloy-os-household__row alloy-os-currentwork__row",
                        isAction && "alloy-os-currentwork__row--action",
                    )}
                    data-work-checklist-item={item.id}
                    data-work-handoff-kind={item.handoffKind ?? undefined}
                    onClick={() => onNavigate(item)}
                >
                    {inner}
                </button>
            </li>
        );
    }

    return (
        <li>
            <div
                className="alloy-os-household__row alloy-os-currentwork__row"
                data-work-checklist-item={item.id}
                data-work-checklist-state={item.state}
            >
                {inner}
            </div>
        </li>
    );
}
