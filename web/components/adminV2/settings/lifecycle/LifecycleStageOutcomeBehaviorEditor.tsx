"use client";

import type { StageOutcomeRuleV1, StageWorkTemplateV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import type { StageOutcomeTransitionOption } from "@/lib/lifecycle/resolveStageOutcomeTransitionOptions";
import {
    defaultFollowUpDuePolicy,
    outcomeAutomationSummaryForOutcome,
    readComposableOutcomeBehaviorDraft,
    upsertComposableOutcomeBehavior,
} from "@/lib/lifecycle/stageOutcomeAutomation";

type Props = {
    outcomeKey: string;
    outcomeLabel: string;
    rules: StageOutcomeRuleV1[];
    workTemplates: StageWorkTemplateV1[];
    transitionOptions: StageOutcomeTransitionOption[];
    completesWork: boolean;
    onRulesChange: (rules: StageOutcomeRuleV1[]) => void;
};

type ScheduleMode =
    | "immediate"
    | "after_outcome"
    | "before_scheduled_event"
    | "after_scheduled_event"
    | "after_stage_entry";

function scheduleMode(policy: ReturnType<typeof defaultFollowUpDuePolicy>): ScheduleMode {
    if (policy.anchor === "scheduled_event_start") {
        return policy.direction === "before" ? "before_scheduled_event" : "after_scheduled_event";
    }
    if (policy.anchor === "stage_entered_at") return "after_stage_entry";
    return (policy.offset_value ?? 0) === 0 ? "immediate" : "after_outcome";
}

function policyForMode(mode: ScheduleMode, offset: number) {
    if (mode === "immediate") return { ...defaultFollowUpDuePolicy(), offset_value: 0 };
    if (mode === "before_scheduled_event") {
        return { ...defaultFollowUpDuePolicy("scheduled_event_start"), direction: "before" as const, offset_value: offset || 1 };
    }
    if (mode === "after_scheduled_event") {
        return { ...defaultFollowUpDuePolicy("scheduled_event_start"), direction: "after" as const, offset_value: offset || 1 };
    }
    if (mode === "after_stage_entry") {
        return { ...defaultFollowUpDuePolicy("stage_entered_at"), direction: "after" as const, offset_value: offset || 1 };
    }
    return { ...defaultFollowUpDuePolicy(), offset_value: offset || 1 };
}

export default function LifecycleStageOutcomeBehaviorEditor({
    outcomeKey,
    outcomeLabel,
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
        <div className="mt-2 space-y-3 rounded border border-alloy-forge/10 bg-white p-2" data-testid={`stage-outcome-behavior-${outcomeKey}`}>
            <fieldset className="space-y-1">
                <legend className="text-[10px] font-semibold text-alloy-midnight/70">After recording</legend>
                <label className="mr-3 inline-flex items-center gap-1 text-[10px]">
                    <input
                        type="radio"
                        name={`movement-${outcomeKey}`}
                        checked={draft.movement === "stay_in_stage"}
                        onChange={() => apply({ ...draft, movement: "stay_in_stage", transition_ref: undefined })}
                    />
                    Stay in stage
                </label>
                <label className="inline-flex items-center gap-1 text-[10px]">
                    <input
                        type="radio"
                        name={`movement-${outcomeKey}`}
                        checked={draft.movement === "move_through_transition"}
                        disabled={!availableTransitions.length}
                        onChange={() =>
                            apply({
                                ...draft,
                                movement: "move_through_transition",
                                transition_ref: draft.transition_ref ?? availableTransitions[0]?.transition_ref,
                            })
                        }
                    />
                    Move through transition
                </label>
                {draft.movement === "move_through_transition" ?
                    <select
                        className="ml-2 rounded border border-alloy-forge/15 bg-white px-2 py-1 text-[10px]"
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
            </fieldset>

            <section className="space-y-1">
                <div className="flex items-center justify-between">
                    <h5 className="text-[10px] font-semibold text-alloy-midnight/70">Create follow-up work</h5>
                    <button
                        type="button"
                        className="text-[10px] font-medium text-alloy-pine"
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
                {draft.follow_up_work.map((followUp, index) => {
                    const mode = scheduleMode(followUp.due_policy);
                    const offset = followUp.due_policy.offset_value ?? 0;
                    return (
                        <div key={index} className="flex flex-wrap items-center gap-1 rounded bg-alloy-midnight/[0.025] p-1.5">
                            <select
                                value={followUp.template_key}
                                onChange={(event) => {
                                    const next = [...draft.follow_up_work];
                                    next[index] = { ...followUp, template_key: event.target.value };
                                    apply({ ...draft, follow_up_work: next });
                                }}
                                className="rounded border border-alloy-forge/15 bg-white px-1 py-0.5 text-[10px]"
                            >
                                <option value="">Select Work Template…</option>
                                {workTemplates.map((work) => <option key={work.template_key} value={work.template_key}>{work.label}</option>)}
                            </select>
                            <select
                                value={mode}
                                onChange={(event) => {
                                    const next = [...draft.follow_up_work];
                                    next[index] = { ...followUp, due_policy: policyForMode(event.target.value as ScheduleMode, offset) };
                                    apply({ ...draft, follow_up_work: next });
                                }}
                                className="rounded border border-alloy-forge/15 bg-white px-1 py-0.5 text-[10px]"
                            >
                                <option value="immediate">Immediately</option>
                                <option value="after_outcome">After outcome</option>
                                <option value="before_scheduled_event">Before scheduled event</option>
                                <option value="after_scheduled_event">After scheduled event</option>
                                <option value="after_stage_entry">After stage entry</option>
                            </select>
                            {mode !== "immediate" ?
                                <input
                                    type="number"
                                    min={1}
                                    aria-label="Schedule offset days"
                                    className="w-12 rounded border border-alloy-forge/15 px-1 py-0.5 text-[10px]"
                                    value={offset || 1}
                                    onChange={(event) => {
                                        const next = [...draft.follow_up_work];
                                        next[index] = { ...followUp, due_policy: policyForMode(mode, Math.max(1, Number(event.target.value) || 1)) };
                                        apply({ ...draft, follow_up_work: next });
                                    }}
                                />
                            :   null}
                            <button
                                type="button"
                                className="text-[10px] text-red-700"
                                onClick={() => apply({ ...draft, follow_up_work: draft.follow_up_work.filter((_, row) => row !== index) })}
                            >
                                Remove
                            </button>
                        </div>
                    );
                })}
            </section>

            <label className="flex items-center gap-1 text-[10px]">
                <input
                    type="checkbox"
                    checked={draft.attention_enabled}
                    onChange={(event) => apply({ ...draft, attention_enabled: event.target.checked })}
                />
                Create attention
                {draft.attention_enabled ?
                    <input
                        className="min-w-0 flex-1 rounded border border-alloy-forge/15 px-2 py-0.5 text-[10px]"
                        value={draft.attention_reason ?? ""}
                        placeholder="Attention label"
                        onChange={(event) => apply({ ...draft, attention_reason: event.target.value })}
                    />
                :   null}
            </label>

            <p className="text-[10px] text-alloy-midnight/50">
                <span className="font-medium">Summary · </span>{summary}
            </p>
        </div>
    );
}
