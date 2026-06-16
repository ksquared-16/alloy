"use client";

import type { StageOutcomeRuleV1, StageWorkTemplateV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import {
    OUTCOME_AUTOMATION_OPTIONS,
    enrollmentStageOptions,
    outcomeAutomationSummaryForOutcome,
    readOutcomeAutomationDraft,
    upsertOutcomeAutomationRule,
    type OutcomeAutomationDraft,
    type OutcomeAutomationKind,
} from "@/lib/lifecycle/stageOutcomeAutomation";

type Props = {
    outcomeKey: string;
    outcomeLabel: string;
    rules: StageOutcomeRuleV1[];
    workTemplates: StageWorkTemplateV1[];
    defaultRepeatTemplateKey?: string | null;
    onRulesChange: (rules: StageOutcomeRuleV1[]) => void;
};

export default function LifecycleStageOutcomeAutomationEditor({
    outcomeKey,
    outcomeLabel,
    rules,
    workTemplates,
    defaultRepeatTemplateKey,
    onRulesChange,
}: Props) {
    const draft = readOutcomeAutomationDraft(outcomeKey, rules);
    const templateLabels = Object.fromEntries(workTemplates.map((t) => [t.template_key, t.label]));
    const summary = outcomeAutomationSummaryForOutcome(outcomeKey, outcomeLabel, rules, {
        workTemplateLabelByKey: templateLabels,
    });

    const applyDraft = (next: OutcomeAutomationDraft) => {
        onRulesChange(upsertOutcomeAutomationRule(rules, outcomeKey, next));
    };

    const setKind = (kind: OutcomeAutomationKind) => {
        if (kind === "none") {
            onRulesChange(rules.filter((r) => r.when_outcome_key !== outcomeKey));
            return;
        }
        applyDraft({
            ...draft,
            kind,
            stage_key: draft.stage_key ?? "qualification",
            status_key: draft.status_key,
            repeat_template_key: draft.repeat_template_key ?? defaultRepeatTemplateKey ?? workTemplates[0]?.template_key,
            repeat_due_days: draft.repeat_due_days ?? 2,
            attention_reason: draft.attention_reason ?? outcomeLabel,
        });
    };

    return (
        <div className="mt-2 space-y-2 rounded border border-alloy-forge/10 bg-[#FAFBFC] px-2 py-1.5" data-testid={`stage-outcome-automation-${outcomeKey}`}>
            <label className="flex flex-wrap items-center gap-2 text-[10px] text-alloy-midnight/65">
                Automation
                <select
                    className="min-w-[10rem] rounded border border-alloy-forge/15 bg-white px-2 py-0.5 text-[10px]"
                    value={draft.kind}
                    onChange={(e) => setKind(e.target.value as OutcomeAutomationKind)}
                    data-testid={`stage-outcome-automation-kind-${outcomeKey}`}
                >
                    {OUTCOME_AUTOMATION_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                            {opt.label}
                        </option>
                    ))}
                </select>
            </label>

            {draft.kind === "move_to_stage" ?
                <label className="flex flex-wrap items-center gap-2 text-[10px] text-alloy-midnight/65">
                    Target stage
                    <select
                        className="rounded border border-alloy-forge/15 bg-white px-2 py-0.5 text-[10px]"
                        value={draft.stage_key ?? "qualification"}
                        onChange={(e) => applyDraft({ ...draft, stage_key: e.target.value })}
                    >
                        {enrollmentStageOptions().map((s) => (
                            <option key={s.key} value={s.key}>
                                {s.label}
                            </option>
                        ))}
                    </select>
                </label>
            :   null}

            {draft.kind === "close_record" ?
                <label className="flex flex-wrap items-center gap-2 text-[10px] text-alloy-midnight/65">
                    Close status
                    <input
                        className="rounded border border-alloy-forge/15 px-2 py-0.5 text-[10px]"
                        value={draft.status_key ?? "closed"}
                        onChange={(e) => applyDraft({ ...draft, status_key: e.target.value })}
                        placeholder="closed"
                    />
                </label>
            :   null}

            {draft.kind === "repeat_work" ?
                <div className="flex flex-wrap items-center gap-2 text-[10px] text-alloy-midnight/65">
                    <label className="flex items-center gap-1">
                        Work item
                        <select
                            className="rounded border border-alloy-forge/15 bg-white px-2 py-0.5 text-[10px]"
                            value={draft.repeat_template_key ?? defaultRepeatTemplateKey ?? ""}
                            onChange={(e) => applyDraft({ ...draft, repeat_template_key: e.target.value })}
                        >
                            {workTemplates.map((t) => (
                                <option key={t.template_key} value={t.template_key}>
                                    {t.label}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label className="flex items-center gap-1">
                        Due in
                        <input
                            type="number"
                            min={1}
                            className="w-12 rounded border border-alloy-forge/15 px-1 py-0.5"
                            value={draft.repeat_due_days ?? 2}
                            onChange={(e) =>
                                applyDraft({
                                    ...draft,
                                    repeat_due_days: Math.max(1, Number(e.target.value) || 1),
                                })
                            }
                        />
                        days
                    </label>
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

            <p className="text-[10px] text-alloy-midnight/50" data-testid={`stage-outcome-automation-summary-${outcomeKey}`}>
                {summary}
            </p>
        </div>
    );
}
