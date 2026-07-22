"use client";

/**
 * Slice A — the purpose-built centered configured-work surface.
 *
 * The focused version of the What's Next card: a single-column composition over the GENERIC
 * View Model (Slices E/F/D). It is NOT the legacy two-column workspace body — no progress
 * meter, no requirement counts, no workspace columns, no workflow-engine headings, no legacy
 * navigation. Rendered inside the card's UniversalCard so the grid's centered elevation applies.
 *
 * Anatomy (in order): What's Next → obligation → current state/reason → primary configured
 * action → secondary configured actions → grouped missing information (Slice E) → configured
 * outcomes (Slice D) → eligible configured transitions (Slice D) → relevant recent activity.
 *
 * All execution is runtime-derived: actions gate on the Slice F execution state and resolve to
 * their canonical capability host via the card's dispatcher — no action-name branches here.
 */

import clsx from "clsx";

import { ReadinessSummary } from "@/components/admin/focusPanel/cards/CurrentWorkReadinessSummary";
import type { CurrentWorkActivityPreviewItem } from "@/components/admin/focusPanel/cards/CurrentWorkActivityPreview";
import { isCurrentWorkActionExecutable } from "@/lib/adminV2/runtime/focusPanel/currentWork/executeCurrentWorkAction";
import type {
    CurrentWorkActionVM,
    CurrentWorkChecklistItemVM,
    CurrentWorkSurfaceVM,
} from "@/lib/adminV2/runtime/focusPanel/currentWork/currentWorkSurfaceTypes";
import type { StageCompletionOutcomeV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

type CompletionPhase = "working" | "select_result" | "confirm" | "processing" | "complete";

type Props = {
    surface: CurrentWorkSurfaceVM;
    completionPhase: CompletionPhase;
    pendingOutcome: StageCompletionOutcomeV1 | null;
    pendingOutcomeKey: string | null;
    busy: boolean;
    error: string | null;
    handoffNotice: string | null;
    activityItems: CurrentWorkActivityPreviewItem[];
    onChecklistItem: (item: CurrentWorkChecklistItemVM) => void;
    onAction: (action: CurrentWorkActionVM) => void;
    onSelectOutcome: (outcomeKey: string) => void;
    onCancelOutcome: () => void;
    onConfirmOutcome: () => void;
    onClose: () => void;
    actionPanel: React.ReactNode;
};

export default function CurrentWorkFocusedSurface({
    surface,
    completionPhase,
    pendingOutcome,
    pendingOutcomeKey,
    busy,
    error,
    handoffNotice,
    activityItems,
    onChecklistItem,
    onAction,
    onSelectOutcome,
    onCancelOutcome,
    onConfirmOutcome,
    onClose,
    actionPanel,
}: Props) {
    const reason = surface.readiness.reasonLabel?.trim() || surface.description?.trim() || null;

    // Primary configured command (never invented from the work title). Outcomes lead on their own.
    const primary =
        surface.primaryAction
        && surface.primaryAction.handlerKey !== "expand_work"
        && isCurrentWorkActionExecutable(surface.primaryAction)
            ? surface.primaryAction
            : null;
    const secondary = [
        ...surface.supportingActions,
        ...surface.communicationActions,
    ].filter(isCurrentWorkActionExecutable).slice(0, 4);
    const transitions = surface.alternatePaths.filter(isCurrentWorkActionExecutable);
    const outcomes = surface.showOutcomeCompletion ? surface.completionOutcomes : [];
    const confirmEffect =
        surface.resolutions.find((r) => r.kind === "outcome" && r.key === pendingOutcomeKey)?.effect ?? [];
    const activity = activityItems.slice(0, 3);

    const confirming = completionPhase === "confirm" && pendingOutcome != null;
    const processing = completionPhase === "processing";

    return (
        <div className="alloy-os-currentwork__focused" data-work-focused-surface="true" role="group" aria-label="What's Next">
            <div className="alloy-os-currentwork__focused-header">
                <p className="alloy-os-currentwork__focused-eyebrow">What&apos;s Next</p>
                <button
                    type="button"
                    className="alloy-os-currentwork__focused-close"
                    onClick={onClose}
                    data-work-action="close-focused"
                    aria-label="Close"
                >
                    ✕
                </button>
            </div>
            <h3 className="alloy-os-currentwork__focused-title">{surface.title}</h3>
            {reason ?
                <p className="alloy-os-currentwork__focused-reason" data-work-focused-reason="true">{reason}</p>
            :   null}

            {confirming ?
                <div className="alloy-os-currentwork__focused-confirm" data-work-outcome-confirm="true">
                    <p className="alloy-os-currentwork__focused-section-title">Record outcome</p>
                    <p className="alloy-os-currentwork__focused-confirm-outcome">{pendingOutcome!.label}</p>
                    {confirmEffect.length > 0 ?
                        <ul className="alloy-os-currentwork__focused-effect">
                            {confirmEffect.map((line) => (
                                <li key={line}>{line}</li>
                            ))}
                        </ul>
                    :   null}
                    <div className="alloy-os-currentwork__focused-confirm-controls">
                        <button
                            type="button"
                            className="alloy-os-currentwork__primary-action"
                            data-work-action="confirm-outcome"
                            disabled={busy}
                            onClick={onConfirmOutcome}
                        >
                            {busy ? "Recording…" : "Confirm"}
                        </button>
                        <button
                            type="button"
                            className="alloy-os-currentwork__record-outcome alloy-os-currentwork__record-outcome--summary"
                            data-work-action="cancel-outcome"
                            disabled={busy}
                            onClick={onCancelOutcome}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            : processing ?
                <p className="alloy-os-currentwork__focused-reason" aria-busy="true">Recording…</p>
            :   <>
                    {primary || secondary.length > 0 ?
                        <div className="alloy-os-currentwork__focused-actions" data-work-focused-actions="true">
                            {primary ?
                                <button
                                    type="button"
                                    className="alloy-os-currentwork__primary-action"
                                    data-work-primary-action={primary.key}
                                    onClick={() => onAction(primary)}
                                >
                                    {primary.label}
                                </button>
                            :   null}
                            {secondary.map((action) => (
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
                        </div>
                    :   null}

                    <ReadinessSummary surface={surface} onNavigate={onChecklistItem} />

                    {outcomes.length > 0 ?
                        <div className="alloy-os-currentwork__focused-outcomes" data-work-focused-outcomes="true">
                            <p className="alloy-os-currentwork__focused-section-title">What happened?</p>
                            <div className="alloy-os-currentwork__focused-outcome-pills">
                                {outcomes.map((outcome) => (
                                    <button
                                        key={outcome.outcome_key}
                                        type="button"
                                        className="alloy-os-currentwork__focused-outcome-pill"
                                        data-work-outcome={outcome.outcome_key}
                                        onClick={() => onSelectOutcome(outcome.outcome_key)}
                                    >
                                        {outcome.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    :   null}

                    {transitions.length > 0 ?
                        <div className="alloy-os-currentwork__focused-transitions" data-work-focused-transitions="true">
                            <p className="alloy-os-currentwork__focused-section-title">Then</p>
                            <div className="alloy-os-currentwork__focused-transition-list">
                                {transitions.map((action) => (
                                    <button
                                        key={action.key}
                                        type="button"
                                        className="alloy-os-currentwork__focused-transition"
                                        data-work-transition-action={action.key}
                                        onClick={() => onAction(action)}
                                    >
                                        {action.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    :   null}

                    {activity.length > 0 ?
                        <div className="alloy-os-currentwork__focused-activity" data-work-focused-activity="true">
                            <p className="alloy-os-currentwork__focused-section-title">Recent activity</p>
                            <ul className="alloy-os-currentwork__focused-activity-list">
                                {activity.map((item, index) => (
                                    <li key={`${item.label}-${index}`} className={clsx("alloy-os-currentwork__focused-activity-item")}>
                                        <span>{item.label}</span>
                                        {item.occurredAt ?
                                            <span className="alloy-os-currentwork__focused-activity-when">{item.occurredAt}</span>
                                        :   null}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    :   null}
                </>
            }

            {handoffNotice ?
                <p className="alloy-os-currentwork__handoff-notice" role="status">{handoffNotice}</p>
            :   null}
            {error ?
                <p className="alloy-os-currentwork__error" role="alert">{error}</p>
            :   null}
            {actionPanel}
        </div>
    );
}
