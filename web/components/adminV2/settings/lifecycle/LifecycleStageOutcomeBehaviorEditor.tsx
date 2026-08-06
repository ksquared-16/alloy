"use client";

import { useState } from "react";

import type { StageOutcomeRuleV1, StageWorkTemplateV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import type { StageOutcomeTransitionOption } from "@/lib/lifecycle/resolveStageOutcomeTransitionOptions";
import {
    FOLLOW_UP_DUE_ANCHOR_OPTIONS,
    FOLLOW_UP_OFFSET_UNIT_OPTIONS,
    formatScheduleTimingSummary,
    policyFromScheduleTimingUi,
    scheduleTimingUiFromPolicy,
    type ScheduleTimingUi,
    type StageFollowUpWorkDuePolicyV1,
} from "@/lib/lifecycle/stageFollowUpWorkDuePolicy";
import {
    defaultFollowUpDuePolicy,
    readComposableOutcomeBehaviorDraft,
    upsertComposableOutcomeBehavior,
} from "@/lib/lifecycle/stageOutcomeAutomation";
import { CASE_CLOSE_REASONS } from "@/lib/lifecycle/caseCloseReasonVocabulary";

type Props = {
    outcomeKey: string;
    /** The stage this outcome belongs to — named when explaining what a missing path means. */
    stageLabel: string;
    rules: StageOutcomeRuleV1[];
    workTemplates: StageWorkTemplateV1[];
    transitionOptions: StageOutcomeTransitionOption[];
    /** Stages a new exit path may target. Absent when this surface cannot author transitions. */
    transitionDestinations?: Array<{ key: string; label: string }>;
    /** Configured closed case statuses. Resolved by the parent from `status_definitions`. */
    closedStatusOptions?: ReadonlyArray<{ status_key: string; status_label: string }>;
    /**
     * Creates the exit path to `targetStageKey` AND points this outcome at it, in one draft edit.
     * The caller owns both halves on purpose — doing them as two writes here dropped the path.
     */
    onCreateTransition?: (targetStageKey: string) => void;
    onRulesChange: (rules: StageOutcomeRuleV1[]) => void;
};

function ScheduleTimingControls({
    policy,
    onChange,
    testIdPrefix,
}: {
    policy: StageFollowUpWorkDuePolicyV1;
    onChange: (policy: StageFollowUpWorkDuePolicyV1) => void;
    testIdPrefix: string;
}) {
    const timing = scheduleTimingUiFromPolicy(policy);
    const applyTiming = (next: ScheduleTimingUi) => onChange(policyFromScheduleTimingUi(next));

    return (
        <div className="flex flex-wrap items-center gap-1" data-testid={testIdPrefix}>
            <select
                value={timing.mode}
                aria-label="Schedule timing"
                onChange={(event) =>
                    applyTiming({
                        ...timing,
                        mode: event.target.value as ScheduleTimingUi["mode"],
                        offset_value: event.target.value === "immediate" ? 0 : Math.max(1, timing.offset_value || 1),
                    })
                }
                className="rounded-md border border-alloy-forge/15 bg-white px-1 py-0.5 text-[0.6875rem]"
            >
                <option value="immediate">Immediately</option>
                <option value="before">Before</option>
                <option value="after">After</option>
            </select>
            {timing.mode !== "immediate" ?
                <>
                    <input
                        type="number"
                        min={1}
                        aria-label="Schedule offset value"
                        className="w-12 rounded-md border border-alloy-forge/15 px-1 py-0.5 text-[0.6875rem]"
                        value={timing.offset_value || 1}
                        onChange={(event) =>
                            applyTiming({
                                ...timing,
                                offset_value: Math.max(1, Number(event.target.value) || 1),
                            })
                        }
                    />
                    <select
                        value={timing.offset_unit}
                        aria-label="Schedule offset unit"
                        onChange={(event) =>
                            applyTiming({
                                ...timing,
                                offset_unit: event.target.value as ScheduleTimingUi["offset_unit"],
                            })
                        }
                        className="rounded-md border border-alloy-forge/15 bg-white px-1 py-0.5 text-[0.6875rem]"
                    >
                        {FOLLOW_UP_OFFSET_UNIT_OPTIONS.map((unit) => (
                            <option key={unit.value} value={unit.value}>{unit.label}</option>
                        ))}
                    </select>
                    <select
                        value={timing.anchor}
                        aria-label="Schedule anchor"
                        onChange={(event) =>
                            applyTiming({
                                ...timing,
                                anchor: event.target.value as ScheduleTimingUi["anchor"],
                            })
                        }
                        className="rounded-md border border-alloy-forge/15 bg-white px-1 py-0.5 text-[0.6875rem]"
                    >
                        {FOLLOW_UP_DUE_ANCHOR_OPTIONS.map((anchor) => (
                            <option key={anchor.value} value={anchor.value}>{anchor.label}</option>
                        ))}
                    </select>
                </>
            :   null}
            <span className="text-[0.6875rem] text-alloy-midnight/45">{formatScheduleTimingSummary(policy)}</span>
        </div>
    );
}

export default function LifecycleStageOutcomeBehaviorEditor({
    outcomeKey,
    stageLabel,
    rules,
    workTemplates,
    transitionOptions,
    transitionDestinations,
    closedStatusOptions,
    onCreateTransition,
    onRulesChange,
}: Props) {
    const draft = readComposableOutcomeBehaviorDraft(outcomeKey, rules);
    const availableTransitions = transitionOptions.filter((transition) => transition.available !== false);
    const apply = (next: typeof draft) =>
        onRulesChange(upsertComposableOutcomeBehavior(rules, outcomeKey, next));

    /**
     * Can this outcome author its own way out?
     *
     * "Move through transition" used to be disabled whenever the stage had no exit path, while the
     * only nearby text told the operator to create one — the control that needed a transition was
     * the control that refused to let them make it. When authoring is wired up the radio stays
     * live and asks the one question that resolves it: which stage does this move to?
     */
    const canCreateTransition = Boolean(onCreateTransition && transitionDestinations?.length);
    const [newDestinationKey, setNewDestinationKey] = useState("");

    /**
     * "I want this to move" is UI intent until a destination exists to satisfy it.
     *
     * `upsertComposableOutcomeBehavior` deliberately refuses to write a `move_to_stage` target
     * without a `transition_ref` — a movement with no destination is not a movement, and that
     * invariant is right. But it also means `draft.movement` cannot latch on the radio alone: the
     * write is dropped and the next read derives `stay_in_stage`, so the radio silently sprang
     * back and the operator never reached the question that would resolve it.
     *
     * Holding the intent here keeps the persisted rule honest — nothing is written until the path
     * exists — while letting the editor ask "moves to where?".
     */
    const [wantsMovement, setWantsMovement] = useState(false);
    const movement =
        draft.movement === "move_through_transition" || wantsMovement
            ? "move_through_transition"
            : "stay_in_stage";

    /**
     * Closing is a THIRD thing an outcome can do, not a flavour of moving.
     *
     * `update_family_case_status` writes durable case state and `move_to_stage` writes process
     * position; they are separate authorities and a terminal outcome sets both. Presenting only
     * "stay" and "move" forced closure to hide inside a movement, which is how Closed Lost ended
     * up able to point at Tour. Recognised by the status resolving as CLOSED in the configured
     * catalog — `reached_qualified` also carries a case status (`open`) and is not a closure.
     */
    const closedStatusKeys = new Set((closedStatusOptions ?? []).map((row) => row.status_key));
    const draftClosesCase = Boolean(
        draft.case_status?.status_key && closedStatusKeys.has(draft.case_status.status_key),
    );
    const [wantsClose, setWantsClose] = useState(false);
    const canClose = (closedStatusOptions?.length ?? 0) > 0;
    const mode: "stay" | "move" | "close" =
        wantsClose || draftClosesCase ? "close"
        : movement === "move_through_transition" ? "move"
        : "stay";

    const defaultClosedStatusKey = closedStatusOptions?.[0]?.status_key ?? "";
    /** Apply a close, keeping every other part of the draft — including movement — intact. */
    const applyClose = (patch: { status_key?: string; close_reason_key?: string }) => {
        setWantsClose(true);
        apply({
            ...draft,
            case_status: {
                status_key: patch.status_key ?? draft.case_status?.status_key ?? defaultClosedStatusKey,
                ...(patch.close_reason_key ?? draft.case_status?.close_reason_key
                    ? {
                          close_reason_key:
                              patch.close_reason_key ?? draft.case_status?.close_reason_key,
                      }
                    : {}),
            },
        });
    };
    const needsFirstTransition = !availableTransitions.length && canCreateTransition;

    return (
        <div className="mt-2 space-y-3 rounded-md border border-alloy-forge/10 bg-white p-2" data-testid={`stage-outcome-behavior-${outcomeKey}`}>
            <fieldset className="space-y-1">
                <legend className="text-[0.6875rem] font-semibold text-alloy-midnight/70">After recording</legend>
                <label className="mr-3 inline-flex items-center gap-1 text-[0.6875rem]">
                    <input
                        type="radio"
                        name={`movement-${outcomeKey}`}
                        checked={mode === "stay"}
                        data-testid={`stage-outcome-remain-${outcomeKey}`}
                        onChange={() => {
                            setWantsMovement(false);
                            setWantsClose(false);
                            apply({
                                ...draft,
                                movement: "stay_in_stage",
                                transition_ref: undefined,
                                ...(draftClosesCase ? { case_status: undefined } : {}),
                            });
                        }}
                    />
                    Remain in {stageLabel}
                </label>
                <label
                    className={`inline-flex items-center gap-1 text-[0.6875rem] ${
                        availableTransitions.length || canCreateTransition ? "" : "text-alloy-midnight/40"
                    }`}
                >
                    <input
                        type="radio"
                        name={`movement-${outcomeKey}`}
                        checked={mode === "move"}
                        disabled={!availableTransitions.length && !canCreateTransition}
                        data-testid={`stage-outcome-move-through-transition-${outcomeKey}`}
                        onChange={() => {
                            setWantsMovement(true);
                            setWantsClose(false);
                            apply({
                                ...draft,
                                movement: "move_through_transition",
                                // Never auto-select. A silently chosen transition is a movement the
                                // operator did not author, and it is how a wrong destination ships.
                                transition_ref: draft.transition_ref,
                            });
                        }}
                    />
                    Move to another stage
                </label>
                {canClose ? (
                    <label className="ml-3 inline-flex items-center gap-1 text-[0.6875rem]">
                        <input
                            type="radio"
                            name={`movement-${outcomeKey}`}
                            checked={mode === "close"}
                            data-testid={`stage-outcome-close-case-${outcomeKey}`}
                            onChange={() => {
                                setWantsMovement(false);
                                applyClose({});
                            }}
                        />
                        Close this lead
                    </label>
                ) : null}

                {/*
                  * Closure states both authorities at once, in business language: the durable case
                  * result, why it ended, and where the record comes to rest. The destination list is
                  * the ordinary transition list — a terminal close still moves through a configured
                  * path, so nothing here is a second movement model or a direct stage write.
                  */}
                {mode === "close" ? (
                    <div
                        className="mt-1.5 space-y-1.5 rounded-md bg-alloy-midnight/[0.025] p-1.5"
                        data-testid={`stage-outcome-close-panel-${outcomeKey}`}
                    >
                        <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[0.6875rem] text-alloy-midnight/70">Why it closed</span>
                            <select
                                className="rounded-md border border-alloy-forge/15 bg-white px-2 py-1 text-[0.6875rem]"
                                value={draft.case_status?.close_reason_key ?? ""}
                                aria-label="Close reason"
                                data-testid={`stage-outcome-close-reason-${outcomeKey}`}
                                onChange={(event) => applyClose({ close_reason_key: event.target.value })}
                            >
                                <option value="">Select a reason…</option>
                                {CASE_CLOSE_REASONS.map((reason) => (
                                    <option key={reason.key} value={reason.key}>{reason.label}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[0.6875rem] text-alloy-midnight/70">Case becomes</span>
                            <select
                                className="rounded-md border border-alloy-forge/15 bg-white px-2 py-1 text-[0.6875rem]"
                                value={draft.case_status?.status_key ?? defaultClosedStatusKey}
                                aria-label="Closed case status"
                                data-testid={`stage-outcome-close-status-${outcomeKey}`}
                                onChange={(event) => applyClose({ status_key: event.target.value })}
                            >
                                {(closedStatusOptions ?? []).map((status) => (
                                    <option key={status.status_key} value={status.status_key}>
                                        {status.status_label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[0.6875rem] text-alloy-midnight/70">Record comes to rest in</span>
                            {availableTransitions.length ? (
                                <select
                                    className="rounded-md border border-alloy-forge/15 bg-white px-2 py-1 text-[0.6875rem]"
                                    value={draft.transition_ref ?? ""}
                                    aria-label="Closing destination"
                                    data-testid={`stage-outcome-close-destination-${outcomeKey}`}
                                    onChange={(event) =>
                                        apply({
                                            ...draft,
                                            movement: event.target.value
                                                ? "move_through_transition"
                                                : "stay_in_stage",
                                            transition_ref: event.target.value || undefined,
                                        })
                                    }
                                >
                                    <option value="">{stageLabel} (no move)</option>
                                    {availableTransitions.map((transition) => (
                                        <option key={transition.transition_ref} value={transition.transition_ref}>
                                            {transition.label}
                                        </option>
                                    ))}
                                </select>
                            ) : needsFirstTransition ? (
                                <>
                                    <select
                                        className="rounded-md border border-alloy-forge/15 bg-white px-2 py-1 text-[0.6875rem]"
                                        value={newDestinationKey}
                                        aria-label="Closing destination stage"
                                        data-testid={`stage-outcome-close-new-destination-${outcomeKey}`}
                                        onChange={(event) => setNewDestinationKey(event.target.value)}
                                    >
                                        <option value="">Select stage…</option>
                                        {(transitionDestinations ?? []).map((stage) => (
                                            <option key={stage.key} value={stage.key}>{stage.label}</option>
                                        ))}
                                    </select>
                                    <button
                                        type="button"
                                        className="rounded-md bg-alloy-pine px-2 py-1 text-[0.6875rem] font-medium text-white disabled:opacity-40"
                                        disabled={!newDestinationKey}
                                        data-testid={`stage-outcome-close-create-destination-${outcomeKey}`}
                                        onClick={() => {
                                            onCreateTransition?.(newDestinationKey);
                                            setNewDestinationKey("");
                                        }}
                                    >
                                        Create way out
                                    </button>
                                </>
                            ) : (
                                <span className="text-[0.6875rem] text-alloy-midnight/50">
                                    {stageLabel} — no way out configured
                                </span>
                            )}
                        </div>

                        <p className="text-[0.6875rem] leading-snug text-alloy-midnight/55">
                            {draft.completes_stage_work
                                ? "Current work is completed."
                                : "Current work is left open."}
                            {draft.follow_up_work.length
                                ? " Follow-up work is created."
                                : " No follow-up work is created."}
                        </p>
                    </div>
                ) : null}

                {mode === "move" && availableTransitions.length ?
                    <select
                        className="ml-2 rounded-md border border-alloy-forge/15 bg-white px-2 py-1 text-[0.6875rem]"
                        value={draft.transition_ref ?? ""}
                        onChange={(event) => apply({ ...draft, transition_ref: event.target.value || undefined })}
                        data-testid={`stage-outcome-transition-${outcomeKey}`}
                    >
                        <option value="">Select transition…</option>
                        {availableTransitions.map((transition) => (
                            <option key={transition.transition_ref} value={transition.transition_ref}>
                                {transition.label}
                            </option>
                        ))}
                    </select>
                :   null}

                {/*
                  * The dead end, resolved in place. The operator picks a destination and the exit
                  * path is authored on the stage — the same `outgoing_transitions` entry the
                  * "Ways out of this stage" panel writes — then selected for this outcome. The
                  * selector above replaces this block on the next render, because the stage draft
                  * now has a path and `transitionOptions` is derived from that draft.
                  */}
                {mode === "move" && needsFirstTransition ?
                    <div
                        className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded-md bg-alloy-midnight/[0.025] p-1.5"
                        data-testid={`stage-outcome-create-transition-${outcomeKey}`}
                    >
                        <span className="text-[0.6875rem] text-alloy-midnight/70">Moves to</span>
                        <select
                            className="rounded-md border border-alloy-forge/15 bg-white px-2 py-1 text-[0.6875rem]"
                            value={newDestinationKey}
                            aria-label={`Destination stage for ${stageLabel}`}
                            data-testid={`stage-outcome-new-transition-destination-${outcomeKey}`}
                            onChange={(event) => setNewDestinationKey(event.target.value)}
                        >
                            <option value="">Select stage…</option>
                            {(transitionDestinations ?? []).map((stage) => (
                                <option key={stage.key} value={stage.key}>
                                    {stage.label}
                                </option>
                            ))}
                        </select>
                        <button
                            type="button"
                            className="rounded-md bg-alloy-pine px-2 py-1 text-[0.6875rem] font-medium text-white disabled:opacity-40"
                            disabled={!newDestinationKey}
                            data-testid={`stage-outcome-create-transition-confirm-${outcomeKey}`}
                            onClick={() => {
                                onCreateTransition?.(newDestinationKey);
                                setWantsMovement(false);
                                setNewDestinationKey("");
                            }}
                        >
                            Create way out
                        </button>
                    </div>
                :   null}

                {/*
                  * Only when this surface genuinely cannot author a path. A greyed control with no
                  * explanation is a defect, but so is explaining a control the operator can now
                  * simply use. The stage-level fact is reported once, by `stage_transition_missing`.
                  */}
                {!availableTransitions.length && !canCreateTransition ? (
                    <p
                        className="mt-1 text-[0.6875rem] leading-snug text-alloy-midnight/50"
                        data-testid={`stage-outcome-no-transitions-${outcomeKey}`}
                    >
                        Add a way out of {stageLabel} to use this.
                    </p>
                ) : null}
            </fieldset>

            <section className="space-y-1">
                <div className="flex items-center gap-2">
                    <h5 className="text-[0.6875rem] font-semibold text-alloy-midnight/70">Create follow-up work</h5>
                    <button
                        type="button"
                        className="text-[0.6875rem] font-medium text-alloy-pine"
                        data-testid={`stage-outcome-follow-up-add-${outcomeKey}`}
                        onClick={() =>
                            apply({
                                ...draft,
                                follow_up_work: [
                                    ...draft.follow_up_work,
                                    { template_key: workTemplates[0]?.template_key ?? "", due_policy: defaultFollowUpDuePolicy() },
                                ],
                            })
                        }
                    >
                        + Add
                    </button>
                </div>
                {draft.follow_up_work.map((followUp, index) => (
                    <div key={index} className="space-y-1 rounded-md bg-alloy-midnight/[0.025] p-1.5">
                        <div className="flex flex-wrap items-center gap-1">
                            <select
                                value={followUp.template_key}
                                onChange={(event) => {
                                    const next = [...draft.follow_up_work];
                                    next[index] = { ...followUp, template_key: event.target.value };
                                    apply({ ...draft, follow_up_work: next });
                                }}
                                className="rounded-md border border-alloy-forge/15 bg-white px-1 py-0.5 text-[0.6875rem]"
                            >
                                <option value="">Select Work Template…</option>
                                {workTemplates.map((work) => (
                                    <option key={work.template_key} value={work.template_key}>{work.label}</option>
                                ))}
                            </select>
                            <button
                                type="button"
                                className="text-[0.6875rem] text-red-700"
                                onClick={() =>
                                    apply({
                                        ...draft,
                                        follow_up_work: draft.follow_up_work.filter((_, row) => row !== index),
                                    })
                                }
                            >
                                Remove
                            </button>
                        </div>
                        <ScheduleTimingControls
                            policy={followUp.due_policy}
                            testIdPrefix={`stage-outcome-follow-up-timing-${outcomeKey}-${index}`}
                            onChange={(due_policy) => {
                                const next = [...draft.follow_up_work];
                                next[index] = { ...followUp, due_policy };
                                apply({ ...draft, follow_up_work: next });
                            }}
                        />
                    </div>
                ))}
            </section>

            <section className="space-y-1">
                <div className="flex items-center gap-2">
                    <h5 className="text-[0.6875rem] font-semibold text-alloy-midnight/70">Create attention</h5>
                    <button
                        type="button"
                        className="text-[0.6875rem] font-medium text-alloy-pine"
                        data-testid={`stage-outcome-attention-add-${outcomeKey}`}
                        onClick={() =>
                            apply({
                                ...draft,
                                attention_items: [
                                    ...draft.attention_items,
                                    { reason: "Needs attention", due_policy: defaultFollowUpDuePolicy() },
                                ],
                            })
                        }
                    >
                        + Add
                    </button>
                </div>
                {draft.attention_items.map((attention, index) => (
                    <div key={index} className="space-y-1 rounded-md bg-alloy-midnight/[0.025] p-1.5">
                        <div className="flex flex-wrap items-center gap-1">
                            <input
                                className="min-w-0 flex-1 rounded-md border border-alloy-forge/15 px-2 py-0.5 text-[0.6875rem]"
                                value={attention.reason}
                                placeholder="Attention label"
                                onChange={(event) => {
                                    const next = [...draft.attention_items];
                                    next[index] = { ...attention, reason: event.target.value };
                                    apply({ ...draft, attention_items: next });
                                }}
                            />
                            <button
                                type="button"
                                className="text-[0.6875rem] text-red-700"
                                onClick={() =>
                                    apply({
                                        ...draft,
                                        attention_items: draft.attention_items.filter((_, row) => row !== index),
                                    })
                                }
                            >
                                Remove
                            </button>
                        </div>
                        <ScheduleTimingControls
                            policy={attention.due_policy}
                            testIdPrefix={`stage-outcome-attention-timing-${outcomeKey}-${index}`}
                            onChange={(due_policy) => {
                                const next = [...draft.attention_items];
                                next[index] = { ...attention, due_policy };
                                apply({ ...draft, attention_items: next });
                            }}
                        />
                    </div>
                ))}
            </section>

        </div>
    );
}
