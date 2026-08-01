"use client";

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
    outcomeAutomationSummaryForOutcome,
    readComposableOutcomeBehaviorDraft,
    upsertComposableOutcomeBehavior,
} from "@/lib/lifecycle/stageOutcomeAutomation";

type Props = {
    outcomeKey: string;
    outcomeLabel: string;
    /** The stage this outcome belongs to — named in the "no transitions" explanation. */
    stageLabel: string;
    rules: StageOutcomeRuleV1[];
    workTemplates: StageWorkTemplateV1[];
    transitionOptions: StageOutcomeTransitionOption[];
    completesWork: boolean;
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
    outcomeLabel,
    stageLabel,
    rules,
    workTemplates,
    transitionOptions,
    completesWork,
    onRulesChange,
}: Props) {
    const draft = readComposableOutcomeBehaviorDraft(outcomeKey, rules);
    const availableTransitions = transitionOptions.filter((transition) => transition.available !== false);
    const apply = (next: typeof draft) =>
        onRulesChange(upsertComposableOutcomeBehavior(rules, outcomeKey, next));
    const summary = outcomeAutomationSummaryForOutcome(outcomeKey, outcomeLabel, rules, {
        workTemplateLabelByKey: Object.fromEntries(workTemplates.map((work) => [work.template_key, work.label])),
        transitionLabelByRef: Object.fromEntries(transitionOptions.map((transition) => [transition.transition_ref, transition.label])),
        completesWork,
    });

    return (
        <div className="mt-2 space-y-3 rounded-md border border-alloy-forge/10 bg-white p-2" data-testid={`stage-outcome-behavior-${outcomeKey}`}>
            <fieldset className="space-y-1">
                <legend className="text-[0.6875rem] font-semibold text-alloy-midnight/70">After recording</legend>
                <label className="mr-3 inline-flex items-center gap-1 text-[0.6875rem]">
                    <input
                        type="radio"
                        name={`movement-${outcomeKey}`}
                        checked={draft.movement === "stay_in_stage"}
                        onChange={() => apply({ ...draft, movement: "stay_in_stage", transition_ref: undefined })}
                    />
                    Stay in stage
                </label>
                <label
                    className={`inline-flex items-center gap-1 text-[0.6875rem] ${
                        availableTransitions.length ? "" : "text-alloy-midnight/40"
                    }`}
                >
                    <input
                        type="radio"
                        name={`movement-${outcomeKey}`}
                        checked={draft.movement === "move_through_transition"}
                        disabled={!availableTransitions.length}
                        data-testid={`stage-outcome-move-through-transition-${outcomeKey}`}
                        onChange={() =>
                            apply({
                                ...draft,
                                movement: "move_through_transition",
                                // Never auto-select. A silently chosen transition is a movement the
                                // operator did not author, and it is how a wrong destination ships.
                                transition_ref: draft.transition_ref,
                            })
                        }
                    />
                    Move through transition
                </label>
                {draft.movement === "move_through_transition" ?
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
                  * A greyed control with no explanation is the defect, not the empty list. Say what
                  * is missing and what to do about it, in the operator's own vocabulary.
                  */}
                {availableTransitions.length ? null : (
                    <p
                        className="mt-1 text-[0.6875rem] leading-snug text-alloy-midnight/50"
                        data-testid={`stage-outcome-no-transitions-${outcomeKey}`}
                    >
                        No outgoing transitions are configured for {stageLabel}. Create a transition
                        before choosing this outcome behaviour.
                    </p>
                )}
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

            <p className="text-[0.6875rem] text-alloy-midnight/50">
                <span className="font-medium">Summary · </span>{summary}
            </p>
        </div>
    );
}
