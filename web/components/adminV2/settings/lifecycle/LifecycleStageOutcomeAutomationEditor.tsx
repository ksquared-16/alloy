"use client";

import type { ProcessTracksV1 } from "@/lib/businessProcesses/processConfigTypes";
import type { StageOutcomeRuleV1, StageOperatingPlanV1, StageWorkTemplateV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import {
    FOLLOW_UP_DUE_ANCHOR_OPTIONS,
    type StageFollowUpDueAnchor,
} from "@/lib/lifecycle/stageFollowUpWorkDuePolicy";
import {
    OUTCOME_AUTOMATION_OPTIONS,
    defaultFollowUpDuePolicy,
    outcomeAutomationSummaryForOutcome,
    readOutcomeAutomationDraft,
    resolveStageOutcomeTransitionOptions,
    summarizeRepeatWorkDraft,
    upsertOutcomeAutomationRule,
    type OutcomeAutomationDraft,
    type OutcomeAutomationKind,
} from "@/lib/lifecycle/stageOutcomeAutomation";
import {
    resolveOutcomeStatusOptions,
    type OutcomeStatusConfiguredRow,
} from "@/lib/lifecycle/resolveOutcomeStatusOptions";

type Props = {
    outcomeKey: string;
    outcomeLabel: string;
    rules: StageOutcomeRuleV1[];
    workTemplates: StageWorkTemplateV1[];
    stageKey: string;
    stageLabel?: string;
    processStages?: Array<{ key: string; label: string }>;
    stageOperatingPlan?: StageOperatingPlanV1 | null;
    processTracks?: ProcessTracksV1 | null;
    defaultRepeatTemplateKey?: string | null;
    completesWork?: boolean;
    configuredStatuses?: ReadonlyArray<OutcomeStatusConfiguredRow>;
    entityType?: string;
    onRulesChange: (rules: StageOutcomeRuleV1[]) => void;
};

export default function LifecycleStageOutcomeAutomationEditor({
    outcomeKey,
    outcomeLabel,
    rules,
    workTemplates,
    stageKey,
    stageLabel,
    processStages = [],
    stageOperatingPlan,
    processTracks,
    defaultRepeatTemplateKey,
    completesWork,
    configuredStatuses = [],
    entityType = "opportunities",
    onRulesChange,
}: Props) {
    const transitionOptions = resolveStageOutcomeTransitionOptions({
        currentStageKey: stageKey,
        currentStageLabel: stageLabel,
        stageOperatingPlan: stageOperatingPlan ?? null,
        processTracks: processTracks ?? null,
        processStages,
    });
    const transitionLabelByRef = Object.fromEntries(
        transitionOptions.map((opt) => [opt.transition_ref, opt.label]),
    );
    const hasOutgoingTransitions = transitionOptions.length > 0;

    const draft = readOutcomeAutomationDraft(outcomeKey, rules, { transitionOptions });
    const statusResolution = resolveOutcomeStatusOptions({
        configuredStatuses,
        purpose: "close_record",
        entityType,
        selectedStatusKey: draft.status_key,
    });
    const closeAvailable = statusResolution.available;

    const templateLabels = Object.fromEntries(workTemplates.map((t) => [t.template_key, t.label]));
    const summary = outcomeAutomationSummaryForOutcome(outcomeKey, outcomeLabel, rules, {
        workTemplateLabelByKey: templateLabels,
        transitionLabelByRef,
        completesWork: completesWork ?? draft.completes_work,
    });

    const applyDraft = (next: OutcomeAutomationDraft) => {
        onRulesChange(
            upsertOutcomeAutomationRule(rules, outcomeKey, next, { transitionOptions }),
        );
    };

    const setKind = (kind: OutcomeAutomationKind) => {
        if (kind === "none") {
            onRulesChange(rules.filter((r) => r.when_outcome_key !== outcomeKey));
            return;
        }
        if (kind === "move_to_stage" && !hasOutgoingTransitions) return;
        if (kind === "close_record" && !closeAvailable) return;

        const defaultTransition = transitionOptions[0];
        applyDraft({
            ...draft,
            kind,
            transition_ref: draft.transition_ref ?? defaultTransition?.transition_ref,
            stage_key:
                draft.stage_key
                ?? defaultTransition?.target_stage_key,
            status_key:
                kind === "close_record"
                    ? (statusResolution.selectedStatusKey
                        ?? statusResolution.options[0]?.status_key
                        ?? draft.status_key
                        ?? undefined)
                    : draft.status_key,
            repeat_template_key:
                draft.repeat_template_key
                ?? defaultRepeatTemplateKey
                ?? workTemplates[0]?.template_key,
            repeat_due_days: draft.repeat_due_days ?? 2,
            follow_up_due_policy:
                draft.follow_up_due_policy
                ?? defaultFollowUpDuePolicy(kind === "repeat_work" ? "outcome_recorded_at" : "outcome_recorded_at"),
            attention_reason: draft.attention_reason ?? outcomeLabel,
            completes_work: draft.completes_work ?? completesWork,
        });
    };

    const duePolicy = draft.follow_up_due_policy ?? defaultFollowUpDuePolicy("outcome_recorded_at");

    const setDuePolicy = (patch: Partial<typeof duePolicy>) => {
        applyDraft({
            ...draft,
            follow_up_due_policy: { ...duePolicy, ...patch },
            repeat_due_days:
                patch.offset_value != null && (patch.offset_unit ?? duePolicy.offset_unit) === "days"
                && (patch.direction ?? duePolicy.direction) !== "before"
                && (patch.anchor ?? duePolicy.anchor) === "outcome_recorded_at"
                    ? patch.offset_value
                    : draft.repeat_due_days,
        });
    };

    const repeatSummary = summarizeRepeatWorkDraft(draft, templateLabels);
    const selectedTransition = transitionOptions.find((o) => o.transition_ref === draft.transition_ref);

    return (
        <div
            className="mt-2 space-y-2 rounded border border-alloy-forge/10 bg-white px-2 py-1.5"
            data-testid={`stage-outcome-automation-${outcomeKey}`}
        >
            <div className="space-y-1">
                <p className="text-[10px] font-medium text-alloy-midnight/70">Outcome Definitions</p>
                <p className="text-[10px] text-alloy-midnight/45">
                    Define what this outcome means and what happens after recording it.
                </p>
            </div>

            <label className="flex flex-wrap items-center gap-2 text-[10px] text-alloy-midnight/65">
                After recording
                <select
                    className="min-w-[10rem] rounded border border-alloy-forge/15 bg-white px-2 py-0.5 text-[10px]"
                    value={draft.kind}
                    onChange={(e) => setKind(e.target.value as OutcomeAutomationKind)}
                    data-testid={`stage-outcome-automation-kind-${outcomeKey}`}
                >
                    {OUTCOME_AUTOMATION_OPTIONS.map((opt) => {
                        const disabled =
                            (opt.value === "move_to_stage" && !hasOutgoingTransitions)
                            || (opt.value === "close_record" && !closeAvailable);
                        return (
                            <option key={opt.value} value={opt.value} disabled={disabled}>
                                {opt.label}
                                {opt.value === "move_to_stage" && !hasOutgoingTransitions
                                    ? " (no outgoing transitions)"
                                    : ""}
                                {opt.value === "close_record" && !closeAvailable
                                    ? " (no closed statuses)"
                                    : ""}
                            </option>
                        );
                    })}
                </select>
            </label>

            {draft.kind === "move_to_stage" ?
                <div className="space-y-1">
                    <label className="flex flex-wrap items-center gap-2 text-[10px] text-alloy-midnight/65">
                        Transition
                        <select
                            className="min-w-[12rem] rounded border border-alloy-forge/15 bg-white px-2 py-0.5 text-[10px]"
                            value={draft.transition_ref ?? ""}
                            disabled={!hasOutgoingTransitions}
                            onChange={(e) => {
                                const transition_ref = e.target.value;
                                const match = transitionOptions.find((opt) => opt.transition_ref === transition_ref);
                                applyDraft({
                                    ...draft,
                                    transition_ref,
                                    stage_key: match?.target_stage_key ?? draft.stage_key,
                                });
                            }}
                            data-testid={`stage-outcome-automation-transition-${outcomeKey}`}
                        >
                            {!hasOutgoingTransitions ?
                                <option value="">No outgoing transitions configured</option>
                            :   <option value="">Select a transition…</option>}
                            {transitionOptions.map((opt) => (
                                <option key={opt.transition_ref} value={opt.transition_ref}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    </label>
                    {selectedTransition ?
                        <p className="text-[10px] text-alloy-midnight/45" data-testid={`stage-outcome-automation-transition-detail-${outcomeKey}`}>
                            {(stageLabel?.trim() || stageKey)}
                            {" → "}
                            {selectedTransition.target_stage_label}
                        </p>
                    : draft.transition_ref && !selectedTransition ?
                        <p className="text-[10px] text-amber-800" role="status">
                            Selected transition is not a valid outgoing edge — repair it.
                        </p>
                    : !hasOutgoingTransitions ?
                        <p className="text-[10px] text-amber-800" role="status">
                            Configure outgoing process transitions before using Move through transition.
                        </p>
                    :   null}
                </div>
            :   null}

            {draft.kind === "close_record" ?
                <div className="space-y-1" data-testid={`stage-outcome-automation-close-${outcomeKey}`}>
                    <label className="flex flex-wrap items-center gap-2 text-[10px] text-alloy-midnight/65">
                        Configured closed status
                        <select
                            className="min-w-[12rem] rounded border border-alloy-forge/15 bg-white px-2 py-0.5 text-[10px]"
                            value={statusResolution.selectedStatusKey ?? ""}
                            disabled={!closeAvailable}
                            onChange={(e) =>
                                applyDraft({
                                    ...draft,
                                    status_key: e.target.value ? e.target.value : undefined,
                                })
                            }
                            data-testid={`stage-outcome-automation-status-${outcomeKey}`}
                        >
                            {!closeAvailable ?
                                <option value="">No configured closed statuses</option>
                            :   <option value="">Select a closed status…</option>}
                            {statusResolution.options.map((opt) => (
                                <option key={opt.status_key} value={opt.status_key}>
                                    {opt.status_label}
                                </option>
                            ))}
                        </select>
                    </label>
                    {statusResolution.invalidSelectedStatusKey ?
                        <p className="text-[10px] text-amber-800" role="status">
                            Status &quot;{statusResolution.invalidSelectedStatusKey}&quot; is not a configured
                            closed status — repair it. Raw status text is not accepted.
                        </p>
                    : !closeAvailable ?
                        <p className="text-[10px] text-amber-800" role="status">
                            {statusResolution.unavailableReason}
                        </p>
                    :   <p className="text-[10px] text-alloy-midnight/45">
                            Choose a configured closed status. Status identity is owned by the status model.
                        </p>}
                </div>
            :   null}

            {draft.kind === "repeat_work" ?
                <div className="space-y-2 text-[10px] text-alloy-midnight/65">
                    <label className="flex flex-wrap items-center gap-2">
                        Work Template
                        <select
                            className="min-w-[10rem] rounded border border-alloy-forge/15 bg-white px-2 py-0.5 text-[10px]"
                            value={draft.repeat_template_key ?? defaultRepeatTemplateKey ?? ""}
                            onChange={(e) => applyDraft({ ...draft, repeat_template_key: e.target.value })}
                            data-testid={`stage-outcome-automation-work-template-${outcomeKey}`}
                        >
                            <option value="">Select a Work Template…</option>
                            {workTemplates.map((t) => (
                                <option key={t.template_key} value={t.template_key}>
                                    {t.label}
                                </option>
                            ))}
                        </select>
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                        <label className="flex items-center gap-1">
                            Due anchor
                            <select
                                className="rounded border border-alloy-forge/15 bg-white px-2 py-0.5 text-[10px]"
                                value={duePolicy.anchor}
                                onChange={(e) =>
                                    setDuePolicy({
                                        anchor: e.target.value as StageFollowUpDueAnchor,
                                        direction:
                                            e.target.value === "scheduled_event_start" ? "before" : "after",
                                    })
                                }
                            >
                                {FOLLOW_UP_DUE_ANCHOR_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                    </option>
                                ))}
                            </select>
                        </label>
                        {duePolicy.anchor === "field_value" ?
                            <label className="flex items-center gap-1">
                                Field
                                <input
                                    className="rounded border border-alloy-forge/15 px-2 py-0.5 text-[10px]"
                                    value={duePolicy.field_ref ?? ""}
                                    onChange={(e) => setDuePolicy({ field_ref: e.target.value })}
                                    placeholder="field_ref"
                                />
                            </label>
                        :   null}
                        <label className="flex items-center gap-1">
                            <select
                                className="rounded border border-alloy-forge/15 bg-white px-2 py-0.5 text-[10px]"
                                value={duePolicy.direction ?? "after"}
                                onChange={(e) =>
                                    setDuePolicy({
                                        direction: e.target.value as "before" | "after",
                                    })
                                }
                            >
                                <option value="after">after</option>
                                <option value="before">before</option>
                            </select>
                        </label>
                        <label className="flex items-center gap-1">
                            <input
                                type="number"
                                min={0}
                                className="w-12 rounded border border-alloy-forge/15 px-1 py-0.5"
                                value={duePolicy.offset_value ?? 0}
                                onChange={(e) =>
                                    setDuePolicy({
                                        offset_value: Math.max(0, Number(e.target.value) || 0),
                                    })
                                }
                            />
                            <select
                                className="rounded border border-alloy-forge/15 bg-white px-2 py-0.5 text-[10px]"
                                value={duePolicy.offset_unit ?? "days"}
                                onChange={(e) =>
                                    setDuePolicy({
                                        offset_unit: e.target.value as "minutes" | "hours" | "days",
                                    })
                                }
                            >
                                <option value="minutes">minutes</option>
                                <option value="hours">hours</option>
                                <option value="days">days</option>
                            </select>
                        </label>
                    </div>
                    {repeatSummary ?
                        <p className="text-alloy-midnight/50">{repeatSummary}</p>
                    :   null}
                </div>
            :   null}

            {draft.kind === "mark_needs_attention" ?
                <label className="flex flex-wrap items-center gap-2 text-[10px] text-alloy-midnight/65">
                    Attention label
                    <input
                        className="min-w-0 flex-1 rounded border border-alloy-forge/15 px-2 py-0.5 text-[10px]"
                        value={draft.attention_reason ?? outcomeLabel}
                        onChange={(e) => applyDraft({ ...draft, attention_reason: e.target.value })}
                    />
                </label>
            :   null}

            {draft.kind === "stay_in_stage" ?
                <p className="text-[10px] text-alloy-midnight/45">
                    Remain in the current stage. No transition or status mutation is authored here.
                </p>
            :   null}

            <p className="text-[10px] text-alloy-midnight/50" data-testid={`stage-outcome-automation-summary-${outcomeKey}`}>
                <span className="font-medium text-alloy-midnight/65">Summary · </span>
                {summary}
            </p>
        </div>
    );
}
