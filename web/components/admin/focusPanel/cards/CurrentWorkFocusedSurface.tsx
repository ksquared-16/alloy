"use client";

/**
 * Slice A — the purpose-built centered configured-work surface.
 *
 * The focused version of the What's Next card: a single-column composition over the GENERIC
 * View Model (Slices E/F/D). NOT the legacy two-column workspace body — no progress meter, no
 * requirement counts, no workspace columns, no legacy navigation. Rendered inside the card's
 * UniversalCard so the grid's centered elevation applies.
 *
 * Two modes:
 *  - actions (default): obligation reason → primary action → subordinate actions → missing info →
 *    subordinate "Record outcome" affordance → transitions → recent activity. The full outcome
 *    collection is NOT shown alongside the commands.
 *  - outcome: a dedicated decision mode — compact context, "Back to actions", configured outcomes
 *    as premium full-width selection rows (label + configured effect), then one dominant Confirm.
 *
 * When a hosted capability (composer / tour) is active it becomes the primary content: the context
 * header stays compact and the capability fills the remaining height with its own internal scroll.
 * All labels/effects/transitions are runtime-derived (no hardcoded enrollment language).
 */

import { useState } from "react";
import clsx from "clsx";

import { ReadinessSummary } from "@/components/admin/focusPanel/cards/CurrentWorkReadinessSummary";
import CurrentWorkActionButtonContent from "@/components/admin/focusPanel/cards/CurrentWorkActionButtonContent";
import CurrentWorkContextStrip from "@/components/admin/focusPanel/cards/CurrentWorkContextStrip";
import CurrentWorkTourGroupedActions from "@/components/admin/focusPanel/cards/CurrentWorkTourGroupedActions";
import {
    currentWorkActivityRowKey,
    type CurrentWorkActivityPreviewItem,
} from "@/components/admin/focusPanel/cards/CurrentWorkActivityPreview";
import { isCurrentWorkActionExecutable } from "@/lib/adminV2/runtime/focusPanel/currentWork/executeCurrentWorkAction";
import { resolveCurrentWorkActionButtons } from "@/lib/adminV2/runtime/focusPanel/currentWork/resolveCurrentWorkActionButtons";
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
    truth?: Record<string, unknown> | null;
    onChecklistItem: (item: CurrentWorkChecklistItemVM) => void;
    onAction: (action: CurrentWorkActionVM) => void;
    onWarm: (action: CurrentWorkActionVM) => void;
    onSelectOutcome: (outcomeKey: string) => void;
    onCancelOutcome: () => void;
    onConfirmOutcome: () => void;
    onClose: () => void;
    /**
     * Return from an open command destination to the launcher list WITHOUT collapsing the card.
     * Distinct from `onClose`, which dismisses the whole elevated surface — the two were the same
     * gesture until R-014, which is why every command destination was a dead end.
     */
    onDismissPanel?: () => void;
    actionPanel: React.ReactNode;
    /**
     * Per-child paths for a template configuring `participant_decisions`.
     *
     * Rendered as persistent context for the open work rather than inside outcome mode, because
     * `completeStageWorkWithOutcome` refuses the outcome while any child is undecided — the operator
     * needs to meet the paths BEFORE being told no, and `outcomeCompletionBlockReason` (rendered in
     * outcome mode) is the message that would otherwise have no corresponding control.
     */
    participantDecisions?: React.ReactNode;
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
    truth = null,
    onChecklistItem,
    onAction,
    onWarm,
    onSelectOutcome,
    onCancelOutcome,
    onConfirmOutcome,
    onClose,
    onDismissPanel,
    actionPanel,
    participantDecisions,
}: Props) {
    // Record-outcome is a dedicated decision MODE, not a section shown next to the commands.
    // Opening via "Record outcome" from the summary (select_result) enters outcome mode directly.
    const [outcomeModeClicked, setOutcomeModeClicked] = useState(false);
    const inOutcomeMode =
        outcomeModeClicked || completionPhase === "select_result" || completionPhase === "confirm";

    const reason = surface.readiness.reasonLabel?.trim() || surface.description?.trim() || null;

    // SAME action buttons as the summary card (one shared derivation) so "View details" never shows
    // a different action set. Record outcome enters the dedicated outcome mode instead of dispatching.
    const { dominant, helpful, subordinateOutcome, recordOutcome, dominantIsOutcome } =
        resolveCurrentWorkActionButtons(surface);
    const transitions = surface.alternatePaths.filter(isCurrentWorkActionExecutable);
    const outcomes = surface.showOutcomeCompletion ? surface.completionOutcomes : [];
    const outcomeEffect = (key: string): string[] =>
        surface.resolutions.find((r) => r.kind === "outcome" && r.key === key)?.effect ?? [];

    /**
     * Why outcomes cannot be recorded — the sentence the runtime already computed.
     *
     * `outcomeCompletionBlockReason` has always been on the surface and was never rendered: when
     * `showOutcomeCompletion` is false the outcome list silently became `[]` and the card showed a
     * bare "Blocked" chip with no tooltip, no reason and nothing to click. Rendering it is the
     * whole fix — no new logic, no new state.
     */
    const outcomeBlockReason =
        !surface.showOutcomeCompletion ? surface.outcomeCompletionBlockReason?.trim() || null : null;
    const activity = activityItems.slice(0, 3);

    const processing = completionPhase === "processing";
    const hasPanel = Boolean(actionPanel);

    const runCommand = (action: CurrentWorkActionVM) => {
        setOutcomeModeClicked(false);
        onAction(action);
    };
    // Record outcome is a dedicated decision MODE here (we are already in the focused surface), so its
    // button enters outcome mode directly instead of dispatching like the other commands.
    const onActionButton = (action: CurrentWorkActionVM) => {
        if (recordOutcome && action === recordOutcome) {
            setOutcomeModeClicked(true);
            return;
        }
        runCommand(action);
    };
    const exitOutcomeMode = () => {
        setOutcomeModeClicked(false);
        onCancelOutcome();
    };

    return (
        <div
            className="alloy-os-currentwork__focused"
            data-work-focused-surface="true"
            data-has-panel={hasPanel ? "true" : undefined}
            data-outcome-mode={inOutcomeMode && !hasPanel ? "true" : undefined}
            role="group"
            aria-label="What's Next"
        >
            {/* The topbar is the card's only always-present exit, so it renders in EVERY mode.
                In capability mode it collapses to a single compact row and trades the reason for
                the return control: a command destination replaces the launcher row entirely, so
                without this the operator's only escape is the backdrop or browser navigation
                (defect register R-014). Message, Send form and every Tour ▾ item resolve to the
                same `activePanelAction` slot, so ONE control here is the return grammar for all of
                them — the same "← Back to actions" wording outcome mode already uses. */}
            <div
                className="alloy-os-currentwork__focused-topbar"
                data-work-topbar-mode={hasPanel ? "panel" : "default"}
            >
                {hasPanel && onDismissPanel ?
                    <button
                        type="button"
                        className="alloy-os-currentwork__focused-back"
                        data-work-action="back-to-actions"
                        onClick={onDismissPanel}
                    >
                        ← Back to actions
                    </button>
                : reason ?
                    <p className="alloy-os-currentwork__focused-reason" data-work-focused-reason="true">{reason}</p>
                :   <span />}
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

            {/* Not while a capability panel owns the surface — that panel is the primary content and
                fills the remaining height. */}
            {participantDecisions && !hasPanel ? participantDecisions : null}

            {hasPanel ?
                // Active capability (composer / tour) is the primary content: it fills the remaining
                // height and scrolls internally; the context header above stays compact.
                <div className="alloy-os-currentwork__focused-panel-host">{actionPanel}</div>
            : processing ?
                <p className="alloy-os-currentwork__focused-reason" aria-busy="true">Recording…</p>
            : inOutcomeMode ?
                <div className="alloy-os-currentwork__focused-outcome-mode" data-work-outcome-mode="true">
                    <button
                        type="button"
                        className="alloy-os-currentwork__focused-back"
                        data-work-action="back-to-actions"
                        onClick={exitOutcomeMode}
                    >
                        ← Back to actions
                    </button>
                    <p className="alloy-os-currentwork__focused-section-title">What happened?</p>
                    {outcomeBlockReason ?
                        <p className="alloy-os-currentwork__outcome-blocked" data-work-outcome-blocked="true" role="status">
                            {outcomeBlockReason}
                        </p>
                    :   null}
                    <ul className="alloy-os-currentwork__outcome-list" role="radiogroup" aria-label="Outcome">
                        {outcomes.map((outcome) => {
                            const selected = pendingOutcomeKey === outcome.outcome_key;
                            const effect = outcomeEffect(outcome.outcome_key);
                            return (
                                <li key={outcome.outcome_key}>
                                    <button
                                        type="button"
                                        role="radio"
                                        aria-checked={selected}
                                        className={clsx(
                                            "alloy-os-currentwork__outcome-row",
                                            selected && "alloy-os-currentwork__outcome-row--selected",
                                        )}
                                        data-work-outcome={outcome.outcome_key}
                                        data-selected={selected ? "true" : undefined}
                                        onClick={() => onSelectOutcome(outcome.outcome_key)}
                                    >
                                        <span className="alloy-os-currentwork__outcome-radio" aria-hidden />
                                        <span className="alloy-os-currentwork__outcome-text">
                                            <span className="alloy-os-currentwork__outcome-label">{outcome.label}</span>
                                            {effect.length > 0 ?
                                                <span className="alloy-os-currentwork__outcome-effect">{effect.join(" · ")}</span>
                                            :   null}
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                    {pendingOutcome ?
                        <button
                            type="button"
                            className="alloy-os-currentwork__primary-action alloy-os-currentwork__outcome-confirm"
                            data-work-action="confirm-outcome"
                            disabled={busy}
                            onClick={onConfirmOutcome}
                        >
                            {busy ? "Recording…" : "Confirm outcome"}
                        </button>
                    :   null}
                </div>
            :   <>
                    <div className="alloy-os-currentwork__context-action-row" data-work-context-action-row="true">
                        <CurrentWorkContextStrip surface={surface} truth={truth} />
                        {dominant ?
                            <button
                                type="button"
                                className="alloy-os-currentwork__primary-action"
                                data-work-primary-action={dominant.key}
                                data-work-action={dominantIsOutcome ? "record-outcome" : undefined}
                                onClick={() => onActionButton(dominant)}
                                onMouseEnter={() => onWarm(dominant)}
                                onFocus={() => onWarm(dominant)}
                            >
                                <CurrentWorkActionButtonContent action={dominant} />
                            </button>
                        :   null}
                    </div>
                    {helpful.length > 0 || subordinateOutcome ?
                        <div className="alloy-os-currentwork__primary-stack" data-work-focused-actions="true" data-work-supporting-row="true">
                            {helpful.length > 0 ?
                                <div className="alloy-os-currentwork__helpful-row" data-work-helpful-row="true">
                                    <CurrentWorkTourGroupedActions
                                        actions={helpful}
                                        onAction={onActionButton}
                                        onWarm={onWarm}
                                        variant="summary"
                                    />
                                </div>
                            :   null}
                            {subordinateOutcome ?
                                <button
                                    type="button"
                                    className="alloy-os-currentwork__record-outcome alloy-os-currentwork__record-outcome--summary"
                                    data-work-action="record-outcome"
                                    onClick={() => onActionButton(subordinateOutcome)}
                                >
                                    <CurrentWorkActionButtonContent action={subordinateOutcome} />
                                </button>
                            :   null}
                        </div>
                    :   null}

                    {/* The dead end, explained — here, where the operator is looking for the
                        button that isn't there, rather than as a bare "Blocked" chip. */}
                    {outcomeBlockReason ?
                        <p className="alloy-os-currentwork__outcome-blocked" data-work-outcome-blocked="true" role="status">
                            {outcomeBlockReason}
                        </p>
                    :   null}

                    <div className="alloy-os-currentwork__still-activity-row" data-work-still-activity-row="true">
                        <ReadinessSummary surface={surface} onNavigate={onChecklistItem} />
                        {activity.length > 0 ?
                            <div className="alloy-os-currentwork__focused-activity" data-work-focused-activity="true">
                                <p className="alloy-os-currentwork__focused-section-title">Recent activity</p>
                                <ul className="alloy-os-currentwork__focused-activity-list">
                                    {activity.map((item, index) => (
                                        <li key={currentWorkActivityRowKey(item, index)} className="alloy-os-currentwork__focused-activity-item">
                                            <span>{item.label}</span>
                                            {item.occurredAt ?
                                                <span className="alloy-os-currentwork__focused-activity-when">{item.occurredAt}</span>
                                            :   null}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        :   null}
                    </div>

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
                                        onClick={() => runCommand(action)}
                                    >
                                        {action.label}
                                    </button>
                                ))}
                            </div>
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
        </div>
    );
}
