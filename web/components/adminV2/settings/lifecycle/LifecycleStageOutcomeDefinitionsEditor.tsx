"use client";

import LifecycleStageOutcomeBehaviorEditor from "@/components/adminV2/settings/lifecycle/LifecycleStageOutcomeBehaviorEditor";
import { newOutcomeDraft, type StageOperatingPlanEditorDraft } from "@/lib/lifecycle/stageOperatingPlanEditorModel";
import type { StageOutcomeTransitionOption } from "@/lib/lifecycle/resolveStageOutcomeTransitionOptions";

type Props = {
    draft: StageOperatingPlanEditorDraft;
    transitionOptions: StageOutcomeTransitionOption[];
    onChange: (draft: StageOperatingPlanEditorDraft) => void;
};

export default function LifecycleStageOutcomeDefinitionsEditor({ draft, transitionOptions, onChange }: Props) {
    return (
        <section className="rounded-lg border border-alloy-forge/10 bg-white p-3" data-testid="stage-outcome-definitions-editor">
            <div className="mb-2 flex items-center justify-between">
                <div>
                    <h3 className="text-[11px] font-semibold text-alloy-midnight/75">Outcome Definitions</h3>
                    <p className="text-[10px] text-alloy-midnight/50">
                        Define stage outcomes once. Work Templates select from these Available Outcomes.
                    </p>
                </div>
                <button
                    type="button"
                    className="text-[10px] font-medium text-alloy-pine"
                    onClick={() => {
                        const keys = new Set(draft.outcomes.map((outcome) => outcome.outcome_key));
                        let index = draft.outcomes.length;
                        while (keys.has(`outcome_${index + 1}`)) index += 1;
                        onChange({ ...draft, outcomes: [...draft.outcomes, newOutcomeDraft(index)] });
                    }}
                >
                    + Add outcome
                </button>
            </div>
            <div className="space-y-2">
                {draft.outcomes.map((outcome, index) => (
                    <article key={outcome.outcome_key} className="rounded border border-alloy-forge/10 p-2">
                        <div className="flex flex-wrap items-center gap-2">
                            <input
                                className="min-w-0 flex-1 rounded border border-alloy-forge/15 px-2 py-1 text-xs"
                                value={outcome.label}
                                onChange={(event) => {
                                    const outcomes = [...draft.outcomes];
                                    outcomes[index] = { ...outcome, label: event.target.value };
                                    onChange({ ...draft, outcomes });
                                }}
                            />
                            <label className="flex items-center gap-1 text-[10px]">
                                <input
                                    type="checkbox"
                                    checked={Boolean(outcome.completes_work ?? outcome.successful)}
                                    onChange={(event) => {
                                        const outcomes = [...draft.outcomes];
                                        const next = { ...outcome };
                                        if (event.target.checked) {
                                            next.completes_work = true;
                                            next.successful = true;
                                        } else {
                                            delete next.completes_work;
                                            delete next.successful;
                                        }
                                        outcomes[index] = next;
                                        onChange({ ...draft, outcomes });
                                    }}
                                />
                                Complete current work
                            </label>
                            <button
                                type="button"
                                className="text-[10px] text-red-700"
                                onClick={() =>
                                    onChange({
                                        ...draft,
                                        outcomes: draft.outcomes.filter((row) => row.outcome_key !== outcome.outcome_key),
                                        outcome_rules: draft.outcome_rules.filter((rule) => rule.when_outcome_key !== outcome.outcome_key),
                                        work_templates: draft.work_templates.map((work) => ({
                                            ...work,
                                            ...(work.outcome_refs
                                                ? { outcome_refs: work.outcome_refs.filter((ref) => ref.outcome_ref !== outcome.outcome_key) }
                                                : {}),
                                        })),
                                    })
                                }
                            >
                                Remove
                            </button>
                        </div>
                        <LifecycleStageOutcomeBehaviorEditor
                            outcomeKey={outcome.outcome_key}
                            outcomeLabel={outcome.label}
                            rules={draft.outcome_rules}
                            workTemplates={draft.work_templates}
                            transitionOptions={transitionOptions}
                            completesWork={Boolean(outcome.completes_work ?? outcome.successful)}
                            onRulesChange={(outcome_rules) => onChange({ ...draft, outcome_rules })}
                        />
                    </article>
                ))}
                {!draft.outcomes.length ? <p className="text-[10px] text-alloy-midnight/45">No outcomes defined.</p> : null}
            </div>
        </section>
    );
}
