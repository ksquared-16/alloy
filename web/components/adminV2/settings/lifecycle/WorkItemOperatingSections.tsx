"use client";

/**
 * The parts of a Work Item that live elsewhere in the database but belong together on screen.
 *
 * PRESENTATION vs PERSISTENCE — the whole point of this file.
 *
 * Attention rules are persisted as ONE flat `attention_rules` array on the stage, each row
 * carrying an optional `template_key`. That is the correct normalization and it does not change:
 * a rule scoped to `contact_family` is a stage row that names a work item, not a child of one.
 *
 * What was wrong was only the *rendering*. An operator configuring Contact Family had to scroll
 * to a separate "Attention" panel at the bottom of the page, work out which of four rules applied
 * to the work item in front of them, and hold the mapping in their head. So this composes the
 * existing editor with a filtered view: it receives the whole array, shows the slice belonging to
 * one work item, and splices edits back into that same array. No data is copied, no ownership
 * moves, and deleting a work item still leaves its rules exactly where the stage put them.
 *
 * Follow-up is the same story from the other direction. It is configured as `create_next_work`
 * targets on outcome rules — outcome configuration, correctly. But "what happens after Left
 * Message?" is the question an operator asks while looking at the work item, so the answer is
 * shown here, derived, read-only, pointing at the outcome that owns it.
 */

import LifecycleStageAttentionRulesEditor from "@/components/adminV2/settings/lifecycle/LifecycleStageAttentionRulesEditor";
import { summarizeWorkItem } from "@/lib/lifecycle/stageOperatingPlanSummary";
import type { StageAttentionRuleV1, StageOperatingPlanV1, StageWorkTemplateV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

/**
 * Attention for one work item, edited in place.
 *
 * `rules` is the stage's entire array and `onChange` returns the entire array — the filtering is
 * a lens, not a split. A rule created here is stamped with this work item's `template_key` so it
 * lands in the right slice without the operator choosing a scope from a dropdown.
 */
export function WorkItemAttentionSection({
    templateKey,
    workLabel,
    rules,
    workTemplates,
    onChange,
    stageLabel,
}: {
    templateKey: string;
    workLabel: string;
    rules: StageAttentionRuleV1[];
    workTemplates: StageWorkTemplateV1[];
    onChange: (next: StageAttentionRuleV1[]) => void;
    stageLabel: string;
}) {
    const mine = rules.filter((r) => (r.template_key ?? "").trim() === templateKey);

    return (
        <section className="space-y-2" data-testid={`work-item-attention-${templateKey}`}>
            <div>
                <h4 className="text-[0.6875rem] font-semibold uppercase tracking-wide text-alloy-midnight/50">
                    Attention for this work
                </h4>
                <p className="mt-0.5 text-[0.6875rem] leading-relaxed text-alloy-midnight/45">
                    Raised when {workLabel} needs someone to look at it. Stage-wide signals stay with the stage.
                </p>
            </div>

            {mine.length ? (
                <LifecycleStageAttentionRulesEditor
                    rules={mine}
                    workTemplates={workTemplates}
                    stageLabel={stageLabel}
                    layout="queue_workspace"
                    onChange={(next) => {
                        // Splice the edited slice back into the stage's single array, preserving
                        // the order and identity of every rule this work item does not own.
                        const others = rules.filter((r) => (r.template_key ?? "").trim() !== templateKey);
                        onChange([
                            ...others,
                            ...next.map((r) => (r.template_key ? r : { ...r, template_key: templateKey })),
                        ]);
                    }}
                />
            ) : (
                <p className="text-[0.6875rem] text-alloy-midnight/45" data-testid={`work-item-attention-empty-${templateKey}`}>
                    No attention rules for {workLabel} yet. Add one from the stage attention section to have Alloy
                    flag this work when it goes quiet or runs late.
                </p>
            )}
        </section>
    );
}

/**
 * What happens after each outcome — derived, read-only, and adjacent to the outcomes themselves.
 *
 * Deliberately not an editor: follow-up is a `create_next_work` target on an outcome rule, and
 * duplicating that control here would give two places to change one thing. This answers the
 * question and names where the answer is configured.
 */
export function WorkItemFollowUpSection({
    plan,
    work,
}: {
    plan: StageOperatingPlanV1;
    work: StageWorkTemplateV1;
}) {
    const summary = summarizeWorkItem(plan, work);
    const withFollowUp = summary.outcomes.filter((o) => o.createsFollowUp);

    return (
        <section className="space-y-2" data-testid={`work-item-follow-up-${work.template_key}`}>
            <div>
                <h4 className="text-[0.6875rem] font-semibold uppercase tracking-wide text-alloy-midnight/50">
                    What happens next
                </h4>
                <p className="mt-0.5 text-[0.6875rem] leading-relaxed text-alloy-midnight/45">
                    Set on each outcome above. Shown here so the chain is visible in one place.
                </p>
            </div>

            {withFollowUp.length ? (
                <ul className="space-y-1">
                    {withFollowUp.map((o) => (
                        <li
                            key={o.outcomeKey}
                            className="flex flex-wrap items-baseline gap-x-1.5 text-[0.75rem]"
                            data-testid={`work-item-follow-up-${work.template_key}-${o.outcomeKey}`}
                        >
                            <span className="font-medium text-alloy-midnight/80">{o.label}</span>
                            <span className="text-alloy-midnight/35">→</span>
                            <span className="text-alloy-midnight/65">{followUpPhrase(o.createsFollowUp!)}</span>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="text-[0.6875rem] text-alloy-midnight/45">
                    No outcome creates follow-up work. Staff finish {summary.label} and nothing is scheduled after it.
                </p>
            )}

            {summary.exitOutcome ? (
                <p
                    className="pt-1 text-[0.75rem] text-alloy-midnight/65"
                    data-testid={`work-item-exit-${work.template_key}`}
                >
                    <span className="font-medium text-alloy-midnight/80">{summary.exitOutcome.label}</span>
                    <span className="mx-1.5 text-alloy-midnight/35">→</span>
                    moves the family on
                    {summary.exitOutcome.automatic ? ", automatically when the booking is made" : ""}.
                </p>
            ) : null}
        </section>
    );
}

/** "Follow up tomorrow" reads better than "creates follow-up work due in 1 day". */
function followUpPhrase(followUp: { dueInDays: number | null; whileAttemptsUnder: number | null }): string {
    const when =
        followUp.dueInDays == null
            ? "Follow up"
            : followUp.dueInDays === 0
              ? "Follow up the same day"
              : followUp.dueInDays === 1
                ? "Follow up tomorrow"
                : `Follow up in ${followUp.dueInDays} days`;
    return followUp.whileAttemptsUnder != null
        ? `${when}, retrying until ${followUp.whileAttemptsUnder} attempts — then escalate`
        : when;
}
