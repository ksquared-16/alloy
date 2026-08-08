"use client";

import { useEffect, useRef, type ReactNode } from "react";
import clsx from "clsx";

import StageWorkOutcomePicker from "@/components/admin/StageWorkOutcomePicker";
import StageWorkOutcomeConfirm from "@/components/workIntent/StageWorkOutcomeConfirm";
import CurrentWorkActivityPreview, {
    type CurrentWorkActivityPreviewItem,
} from "@/components/admin/focusPanel/cards/CurrentWorkActivityPreview";
import CurrentWorkTourGroupedActions from "@/components/admin/focusPanel/cards/CurrentWorkTourGroupedActions";
import { isCurrentWorkActionExecutable } from "@/lib/adminV2/runtime/focusPanel/currentWork/executeCurrentWorkAction";
import type {
    CurrentWorkActionVM,
    CurrentWorkChecklistItemVM,
    CurrentWorkCompletionSummary,
    CurrentWorkSurfaceVM,
} from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkSurfaceTypes";
import { stageWorkOutcomeEffectLines } from "@/lib/workIntent/stageWorkOutcomeEffectLines";

export type CurrentWorkWorkspaceCompletionPhase =
    | "working"
    | "select_result"
    | "confirm"
    | "processing"
    | "complete";

type Props = {
    surface: CurrentWorkSurfaceVM;
    completionPhase: CurrentWorkWorkspaceCompletionPhase;
    pendingOutcome: { outcome_key: string; label: string } | null;
    pendingOutcomeKey: string | null;
    primaryWorkItem: CurrentWorkSurfaceVM["primaryWorkItem"];
    busy: boolean;
    error: string | null;
    handoffNotice: string | null;
    activityItems: CurrentWorkActivityPreviewItem[];
    activityPreviewOpen: boolean;
    onToggleActivityPreview: () => void;
    onCloseActivityPreview: () => void;
    onViewFullActivity?: () => void;
    onChecklistItem: (item: CurrentWorkChecklistItemVM) => void;
    onSelectOutcome: (key: string) => void;
    onCancelOutcome: () => void;
    onConfirmOutcome: () => void;
    onCancelPicker: () => void;
    onAction: (action: CurrentWorkActionVM) => void;
    onBack: () => void;
    onOpenFullRecord?: () => void;
    onContinueAfterComplete: () => void;
    completionSummary: CurrentWorkCompletionSummary | null;
    stageLabel?: string | null;
    ownerLabel?: string | null;
    actionPanel?: ReactNode;
};

/**
 * Full Focus Panel Current Work operational workspace.
 * Replaces the summary card grid — not a card-inside-card or modal.
 */
export default function CurrentWorkWorkspace({
    surface,
    completionPhase,
    pendingOutcome,
    pendingOutcomeKey,
    primaryWorkItem,
    busy,
    error,
    handoffNotice,
    activityItems,
    activityPreviewOpen,
    onToggleActivityPreview,
    onCloseActivityPreview,
    onViewFullActivity,
    onChecklistItem,
    onSelectOutcome,
    onCancelOutcome,
    onConfirmOutcome,
    onCancelPicker,
    onAction,
    onBack,
    onOpenFullRecord,
    onContinueAfterComplete,
    completionSummary,
    stageLabel,
    ownerLabel,
    actionPanel,
}: Props) {
    const headingRef = useRef<HTMLHeadingElement>(null);
    const activityTriggerRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        headingRef.current?.focus();
    }, []);

    if (completionPhase === "complete" && completionSummary) {
        return (
            <section
                className="alloy-os-currentwork-workspace"
                data-current-work-workspace="true"
                data-work-completion="complete"
                aria-label="What's Next workspace"
            >
                <WorkspaceChrome onBack={onBack} title={surface.title} statusLabel="Completed" />
                <div className="alloy-os-currentwork__complete" data-work-completion="complete">
                    <span className="alloy-os-card-pill alloy-os-card-pill--complete">Completed</span>
                    <h2 className="alloy-os-currentwork__complete-title">{surface.title}</h2>
                    <p className="alloy-os-currentwork__complete-outcome">{completionSummary.outcomeLabel}</p>
                    <div className="alloy-os-currentwork__complete-changes">
                        {completionSummary.changeLines.map((line) => (
                            <p key={line} className="alloy-os-currentwork__complete-change">
                                ✓ {line}
                            </p>
                        ))}
                        <p className="alloy-os-currentwork__complete-summary">{completionSummary.summary}</p>
                    </div>
                    {completionSummary.nextWorkLabel ?
                        <div className="alloy-os-currentwork__complete-next">
                            <p className="alloy-os-currentwork__supporting-title">What&apos;s next</p>
                            <p className="alloy-os-currentwork__complete-next-label">
                                {completionSummary.nextWorkLabel}
                            </p>
                        </div>
                    :   null}
                    <div className="alloy-os-card-nav" data-work-complete-actions="true">
                        <button
                            type="button"
                            className="alloy-os-ucard__action alloy-os-ucard__action--system5 alloy-os-ucard__action--cta"
                            onClick={onContinueAfterComplete}
                        >
                            {completionSummary.nextWorkLabel ? "Open next work" : "Back to summary"}
                        </button>
                    </div>
                </div>
            </section>
        );
    }

    if (completionPhase === "select_result" && primaryWorkItem) {
        return (
            <section
                className="alloy-os-currentwork-workspace"
                data-current-work-workspace="true"
                data-work-completion="select"
                aria-label="What's Next workspace"
            >
                <WorkspaceChrome
                    onBack={onBack}
                    title={surface.title}
                    statusLabel={surface.statusLabel}
                    reason={surface.readiness.reasonLabel}
                />
                <StageWorkOutcomePicker
                    workTitle={primaryWorkItem.label}
                    outcomes={surface.completionOutcomes}
                    automationPreview={primaryWorkItem.outcome_automation_preview}
                    variant="focus"
                    busy={busy}
                    onSelect={onSelectOutcome}
                    onCancel={onCancelPicker}
                />
            </section>
        );
    }

    if (completionPhase === "confirm" && pendingOutcome && primaryWorkItem) {
        const effectLines = stageWorkOutcomeEffectLines(primaryWorkItem, pendingOutcomeKey!);
        return (
            <section
                className="alloy-os-currentwork-workspace"
                data-current-work-workspace="true"
                data-work-completion="confirm"
                aria-label="What's Next workspace"
            >
                <WorkspaceChrome
                    onBack={onBack}
                    title={surface.title}
                    statusLabel={surface.statusLabel}
                    reason={surface.readiness.reasonLabel}
                />
                <StageWorkOutcomeConfirm
                    workTitle={primaryWorkItem.label}
                    outcomeLabel={pendingOutcome.label}
                    effectLines={effectLines}
                    busy={busy}
                    onConfirm={onConfirmOutcome}
                    onCancel={onCancelOutcome}
                />
            </section>
        );
    }

    if (completionPhase === "processing") {
        return (
            <section
                className="alloy-os-currentwork-workspace"
                data-current-work-workspace="true"
                data-work-completion="processing"
                aria-label="What's Next workspace"
            >
                <WorkspaceChrome onBack={onBack} title={surface.title} statusLabel={surface.statusLabel} />
                <p className="alloy-os-household__row-detail">Applying outcome…</p>
            </section>
        );
    }

    const helpfulActions = [...surface.supportingActions, ...surface.communicationActions].filter(
        isCurrentWorkActionExecutable,
    );
    const transitions = surface.alternatePaths.filter(isCurrentWorkActionExecutable);
    const incomplete =
        surface.readiness.requirements?.items.filter((item) => item.status !== "complete") ?? [];
    const primaryExecutable =
        surface.primaryAction
        && surface.primaryAction.handlerKey !== "expand_work"
        && isCurrentWorkActionExecutable(surface.primaryAction)
            ? surface.primaryAction
            : null;
    const recordOutcome =
        surface.recordOutcomeAction && isCurrentWorkActionExecutable(surface.recordOutcomeAction)
            ? surface.recordOutcomeAction
            : null;
    const outcomeLed =
        surface.execution?.executionMode === "outcome_led"
        || surface.execution?.prominentCta === "record_outcome";
    const showPrimaryAsLeading = Boolean(primaryExecutable) && !outcomeLed;
    const promoteRecordOutcome = Boolean(recordOutcome || surface.completionOutcomes.length > 0) && (
        outcomeLed || !primaryExecutable
    );

    return (
        <section
            className="alloy-os-currentwork-workspace"
            data-current-work-workspace="true"
            data-work-completion="working"
            aria-label="What's Next workspace"
        >
            <header className="alloy-os-currentwork-workspace__header">
                <button
                    type="button"
                    className="alloy-os-currentwork-workspace__back"
                    onClick={onBack}
                    data-work-action="back-to-summary"
                >
                    ← Back to summary
                </button>
                <div className="alloy-os-currentwork-workspace__identity">
                    <h2
                        ref={headingRef}
                        tabIndex={-1}
                        className="alloy-os-currentwork-workspace__title"
                        data-work-workspace-heading="true"
                    >
                        {surface.title}
                    </h2>
                    <p className="alloy-os-currentwork-workspace__meta">
                        <span
                            className={clsx(
                                "alloy-os-card-pill alloy-os-card-pill--subtle",
                                surface.status === "blocked" && "alloy-os-card-pill--blocked",
                                surface.status === "completed" && "alloy-os-card-pill--complete",
                            )}
                        >
                            {surface.statusLabel}
                        </span>
                        {surface.readiness.reasonLabel ?
                            <span className="alloy-os-currentwork-workspace__reason">
                                · {surface.readiness.reasonLabel}
                            </span>
                        :   null}
                    </p>
                </div>
            </header>

            <div className="alloy-os-currentwork-workspace__progress-row" data-work-workspace-progress="true">
                {surface.progress.total > 0 ?
                    <div
                        className="alloy-os-currentwork__progress-block"
                        role="progressbar"
                        aria-valuenow={surface.progress.percent}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`${surface.progress.completed} of ${surface.progress.total} requirements complete, ${surface.progress.percent} percent`}
                    >
                        <div className="alloy-os-currentwork__progress-header">
                            <span>Progress</span>
                            <span>{surface.progress.percent}%</span>
                        </div>
                        <div className="alloy-os-currentwork__progress-bar">
                            <span
                                className="alloy-os-currentwork__progress-bar-fill"
                                style={{ width: `${surface.progress.percent}%` }}
                            />
                        </div>
                        <p className="alloy-os-currentwork__progress-copy">
                            {surface.progress.completed} of {surface.progress.total} requirements complete
                        </p>
                    </div>
                :   null}
                {incomplete.length > 0 ?
                    <div className="alloy-os-currentwork-workspace__waiting" data-work-waiting-on="true">
                        <p className="alloy-os-currentwork__supporting-title">Waiting on</p>
                        <ul>
                            {incomplete.slice(0, 6).map((item) => (
                                <li key={item.key}>
                                    <button
                                        type="button"
                                        className="alloy-os-currentwork-workspace__waiting-item"
                                        onClick={() => onChecklistItem(item as CurrentWorkChecklistItemVM)}
                                    >
                                        {item.label}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                :   null}
            </div>

            <div className="alloy-os-currentwork-workspace__columns">
                <div className="alloy-os-currentwork-workspace__main">
                    <section
                        className="alloy-os-currentwork-workspace__section"
                        data-work-section="next-action"
                        data-execution-mode={surface.execution?.executionMode ?? "unknown"}
                        data-prominent-cta={surface.execution?.prominentCta ?? "none"}
                    >
                        <p className="alloy-os-currentwork-workspace__section-title">
                            {promoteRecordOutcome && !showPrimaryAsLeading ? "Record outcome" : "Next action"}
                        </p>
                        {surface.operatorGuidance?.trim() ?
                            <p className="alloy-os-currentwork-workspace__guidance">{surface.operatorGuidance}</p>
                        : surface.description?.trim() ?
                            <p className="alloy-os-currentwork-workspace__guidance">{surface.description}</p>
                        :   null}
                        {showPrimaryAsLeading ?
                            <button
                                type="button"
                                className="alloy-os-currentwork__work-primary"
                                data-work-primary-action={primaryExecutable!.key}
                                onClick={() => onAction(primaryExecutable!)}
                            >
                                <span className="alloy-os-currentwork__work-primary-label">
                                    {primaryExecutable!.label}
                                </span>
                            </button>
                        : surface.primaryAction && !primaryExecutable && !outcomeLed ?
                            <p className="alloy-os-currentwork__handoff-notice" role="status">
                                {surface.primaryAction.disabledReason
                                    ?? "Primary action is not available for this record."}
                            </p>
                        :   null}
                    </section>

                    {recordOutcome || surface.completionOutcomes.length > 0 ?
                        <section
                            className="alloy-os-currentwork-workspace__section"
                            data-work-section="record-outcome"
                            data-outcome-prominence={promoteRecordOutcome ? "primary" : "secondary"}
                        >
                            {!promoteRecordOutcome || showPrimaryAsLeading ?
                                <p className="alloy-os-currentwork-workspace__section-title">Record outcome</p>
                            :   null}
                            {surface.showOutcomeCompletion && surface.completionOutcomes.length > 0
                                && surface.completionOutcomes.length <= 4 ?
                                <div className="alloy-os-currentwork-workspace__outcome-pills">
                                    {surface.completionOutcomes.map((outcome) => (
                                        <button
                                            key={outcome.outcome_key}
                                            type="button"
                                            className={
                                                promoteRecordOutcome && !showPrimaryAsLeading
                                                    ? "alloy-os-currentwork__work-primary"
                                                    : "alloy-os-currentwork-workspace__outcome-pill"
                                            }
                                            data-work-outcome={outcome.outcome_key}
                                            onClick={() => onSelectOutcome(outcome.outcome_key)}
                                        >
                                            {outcome.label}
                                        </button>
                                    ))}
                                </div>
                            : recordOutcome ?
                                <button
                                    type="button"
                                    className={
                                        promoteRecordOutcome && !showPrimaryAsLeading
                                            ? "alloy-os-currentwork__work-primary"
                                            : "alloy-os-currentwork__record-outcome"
                                    }
                                    data-work-action="record-outcome"
                                    onClick={() => onAction(recordOutcome)}
                                >
                                    {recordOutcome.label}
                                </button>
                            : surface.outcomeCompletionBlockReason ?
                                <p className="alloy-os-currentwork__outcomes-gap" role="status">
                                    {surface.outcomeCompletionBlockReason}
                                </p>
                            :   null}
                        </section>
                    :   null}

                    {incomplete.length > 0 ?
                        <section
                            className="alloy-os-currentwork-workspace__section"
                            data-work-section="requirements"
                        >
                            <p className="alloy-os-currentwork-workspace__section-title">Requirements</p>
                            <ul className="alloy-os-currentwork-workspace__req-list">
                                {incomplete.map((item) => (
                                    <li key={item.key}>
                                        <button
                                            type="button"
                                            className="alloy-os-currentwork-workspace__req-item"
                                            data-work-checklist-item={item.key}
                                            onClick={() => onChecklistItem(item as CurrentWorkChecklistItemVM)}
                                        >
                                            <span>{item.label}</span>
                                            <span className="alloy-os-currentwork-workspace__req-badge">
                                                Required
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    :   null}

                    {helpfulActions.length > 0 ?
                        <section
                            className="alloy-os-currentwork-workspace__section"
                            data-work-section="more-actions"
                        >
                            <p className="alloy-os-currentwork-workspace__section-title">More actions</p>
                            <CurrentWorkTourGroupedActions
                                actions={helpfulActions}
                                onAction={onAction}
                                variant="workspace"
                            />
                        </section>
                    :   null}

                    {handoffNotice ?
                        <p className="alloy-os-currentwork__handoff-notice" role="status">
                            {handoffNotice}
                        </p>
                    :   null}
                    {error ?
                        <p className="alloy-os-currentwork__error" role="alert">
                            {error}
                        </p>
                    :   null}
                    {actionPanel}
                </div>

                <aside className="alloy-os-currentwork-workspace__side">
                    {transitions.length > 0 ?
                        <section
                            className="alloy-os-currentwork-workspace__section"
                            data-work-section="other-transitions"
                        >
                            <p className="alloy-os-currentwork-workspace__section-title">Other transitions</p>
                            <ul className="alloy-os-currentwork-workspace__action-list">
                                {transitions.map((action) => (
                                    <li key={action.key}>
                                        <button
                                            type="button"
                                            className="alloy-os-currentwork-workspace__action-row"
                                            data-work-transition-action={action.key}
                                            disabled={action.disabled}
                                            title={action.disabledReason ?? undefined}
                                            onClick={() => onAction(action)}
                                        >
                                            {action.label}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    :   null}

                    <section
                        className="alloy-os-currentwork-workspace__section"
                        data-work-section="activity"
                    >
                        <p className="alloy-os-currentwork-workspace__section-title">Recent activity</p>
                        {activityItems.length > 0 ?
                            <ul className="alloy-os-currentwork-workspace__activity-list">
                                {activityItems.slice(0, 5).map((item, index) => (
                                    <li
                                        key={`${item.label}-${item.occurredAt ?? index}`}
                                        className="alloy-os-currentwork-workspace__activity-item"
                                    >
                                        <span className="alloy-os-currentwork-workspace__activity-label">
                                            {item.label}
                                        </span>
                                        {item.detail ?
                                            <span className="alloy-os-currentwork-workspace__activity-detail">
                                                {item.detail}
                                            </span>
                                        :   null}
                                        {item.occurredAt ?
                                            <span className="alloy-os-currentwork-workspace__activity-time">
                                                {item.occurredAt}
                                            </span>
                                        :   null}
                                    </li>
                                ))}
                            </ul>
                        :   <p className="alloy-os-household__row-detail">No recent activity</p>}
                        <div className="alloy-os-currentwork-workspace__activity-footer">
                            <button
                                ref={activityTriggerRef}
                                type="button"
                                className="alloy-os-currentwork-workspace__link"
                                onClick={onToggleActivityPreview}
                                aria-expanded={activityPreviewOpen}
                                data-work-action="preview-activity"
                            >
                                Preview activity
                            </button>
                            {onViewFullActivity ?
                                <button
                                    type="button"
                                    className="alloy-os-currentwork-workspace__link"
                                    onClick={onViewFullActivity}
                                    data-work-action="view-all-activity"
                                >
                                    View all activity
                                </button>
                            :   null}
                            <CurrentWorkActivityPreview
                                open={activityPreviewOpen}
                                items={activityItems}
                                onClose={onCloseActivityPreview}
                                onViewFullActivity={onViewFullActivity}
                                triggerRef={activityTriggerRef}
                            />
                        </div>
                    </section>
                </aside>
            </div>

            <footer className="alloy-os-currentwork-workspace__footer" data-work-workspace-footer="true">
                <span>Work template: {surface.title}</span>
                {stageLabel ? <span>Stage: {stageLabel}</span> : null}
                {ownerLabel ? <span>Owner: {ownerLabel}</span> : null}
                {onOpenFullRecord ?
                    <button
                        type="button"
                        className="alloy-os-currentwork-workspace__link"
                        onClick={onOpenFullRecord}
                        data-work-action="open-full-record"
                    >
                        Open full record →
                    </button>
                :   null}
            </footer>
        </section>
    );
}

function WorkspaceChrome({
    onBack,
    title,
    statusLabel,
    reason,
}: {
    onBack: () => void;
    title: string;
    statusLabel: string;
    reason?: string | null;
}) {
    return (
        <header className="alloy-os-currentwork-workspace__header">
            <button
                type="button"
                className="alloy-os-currentwork-workspace__back"
                onClick={onBack}
                data-work-action="back-to-summary"
            >
                ← Back to summary
            </button>
            <div className="alloy-os-currentwork-workspace__identity">
                <h2 className="alloy-os-currentwork-workspace__title">{title}</h2>
                <p className="alloy-os-currentwork-workspace__meta">
                    <span className="alloy-os-card-pill alloy-os-card-pill--subtle">{statusLabel}</span>
                    {reason ? <span className="alloy-os-currentwork-workspace__reason">· {reason}</span> : null}
                </p>
            </div>
        </header>
    );
}
