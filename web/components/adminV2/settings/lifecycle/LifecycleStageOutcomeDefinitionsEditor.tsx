"use client";

import LifecycleStageOutcomeBehaviorEditor from "@/components/adminV2/settings/lifecycle/LifecycleStageOutcomeBehaviorEditor";
import { newOutcomeDraft, type StageOperatingPlanEditorDraft } from "@/lib/lifecycle/stageOperatingPlanEditorModel";
import type { StageOutcomeTransitionOption } from "@/lib/lifecycle/resolveStageOutcomeTransitionOptions";
import {
    setWorkTemplateOutcomeRefs,
    workTemplateOutcomeRefs,
} from "@/lib/lifecycle/stageWorkTemplateActionRefs";

type Props = {
    draft: StageOperatingPlanEditorDraft;
    transitionOptions: StageOutcomeTransitionOption[];
    /** Operator-facing stage name, used when explaining that it has no outgoing transitions. */
    stageLabel?: string;
    onChange: (draft: StageOperatingPlanEditorDraft) => void;
    /** When set, only outcomes available on this Work Template are shown/edited. */
    workTemplateKey?: string;
};

export default function LifecycleStageOutcomeDefinitionsEditor({
    draft,
    transitionOptions,
    stageLabel,
    onChange,
    workTemplateKey,
}: Props) {
    const workIndex =
        workTemplateKey ? draft.work_templates.findIndex((work) => work.template_key === workTemplateKey) : -1;
    const work = workIndex >= 0 ? draft.work_templates[workIndex]! : null;
    const scopedRefs = work ? workTemplateOutcomeRefs(work) : draft.outcomes.map((outcome) => outcome.outcome_key);
    const scopedOutcomes = scopedRefs
        .map((ref) => draft.outcomes.find((outcome) => outcome.outcome_key === ref))
        .filter((outcome): outcome is NonNullable<typeof outcome> => Boolean(outcome));

    const addOutcome = () => {
        const keys = new Set(draft.outcomes.map((outcome) => outcome.outcome_key));
        let index = draft.outcomes.length;
        while (keys.has(`outcome_${index + 1}`)) index += 1;
        const created = newOutcomeDraft(index);
        let nextDraft: StageOperatingPlanEditorDraft = {
            ...draft,
            outcomes: [...draft.outcomes, created],
        };
        if (work) {
            const work_templates = [...nextDraft.work_templates];
            work_templates[workIndex] = setWorkTemplateOutcomeRefs(work, [...scopedRefs, created.outcome_key]);
            nextDraft = { ...nextDraft, work_templates };
        }
        onChange(nextDraft);
    };

    return (
        <section
            className={workTemplateKey ? "space-y-2" : "rounded-lg border border-alloy-forge/10 bg-white p-3"}
            data-testid={
                workTemplateKey ?
                    `work-template-outcome-definitions-${workTemplateKey}`
                :   "stage-outcome-definitions-editor"
            }
        >
            <div className="mb-1 flex items-center justify-between gap-2">
                <div>
                    <h3 className="text-[11px] font-semibold text-alloy-midnight/75">Outcome Definitions</h3>
                    <p className="text-[10px] text-alloy-midnight/50">
                        {workTemplateKey ?
                            "Define what operators can record for this work and what happens after."
                        :   "Define outcomes once. Work Templates select from these Available Outcomes."}
                    </p>
                </div>
                <button
                    type="button"
                    className="text-[10px] font-medium text-alloy-pine"
                    onClick={addOutcome}
                    data-testid={
                        workTemplateKey ?
                            `work-template-outcome-definitions-add-${workTemplateKey}`
                        :   "stage-outcome-definitions-add"
                    }
                >
                    + Add outcome
                </button>
            </div>
            <div className="space-y-2">
                {scopedOutcomes.map((outcome) => {
                    const index = draft.outcomes.findIndex((row) => row.outcome_key === outcome.outcome_key);
                    const referencingTemplates = draft.work_templates.filter((row) =>
                        workTemplateOutcomeRefs(row).includes(outcome.outcome_key),
                    );
                    return (
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
                                {work ?
                                    <button
                                        type="button"
                                        className="text-[10px] text-alloy-midnight/70"
                                        data-testid={`outcome-unlink-${outcome.outcome_key}`}
                                        onClick={() => {
                                            // Remove only this Work Template’s reference — retain stage-owned definition.
                                            const work_templates = [...draft.work_templates];
                                            work_templates[workIndex] = setWorkTemplateOutcomeRefs(
                                                work,
                                                scopedRefs.filter((ref) => ref !== outcome.outcome_key),
                                            );
                                            onChange({ ...draft, work_templates });
                                        }}
                                    >
                                        Remove from work
                                    </button>
                                :   null}
                                <button
                                    type="button"
                                    className="text-[10px] text-red-700"
                                    data-testid={`outcome-delete-definition-${outcome.outcome_key}`}
                                    title={
                                        referencingTemplates.length > 0 ?
                                            `Used by: ${referencingTemplates.map((row) => row.label).join(", ")}`
                                        :   "Delete stage Outcome Definition"
                                    }
                                    onClick={() => {
                                        const otherRefs = referencingTemplates.filter(
                                            (row) => !(work && row.template_key === workTemplateKey),
                                        );
                                        if (otherRefs.length > 0) {
                                            window.alert(
                                                `"${outcome.label}" is still used by: ${otherRefs
                                                    .map((row) => row.label)
                                                    .join(", ")}. Remove it from those Work Templates before deleting the definition.`,
                                            );
                                            return;
                                        }
                                        onChange({
                                            ...draft,
                                            outcomes: draft.outcomes.filter(
                                                (row) => row.outcome_key !== outcome.outcome_key,
                                            ),
                                            outcome_rules: draft.outcome_rules.filter(
                                                (rule) => rule.when_outcome_key !== outcome.outcome_key,
                                            ),
                                            work_templates: draft.work_templates.map((row) => ({
                                                ...row,
                                                ...(row.outcome_refs ?
                                                    {
                                                        outcome_refs: row.outcome_refs.filter(
                                                            (ref) => ref.outcome_ref !== outcome.outcome_key,
                                                        ),
                                                    }
                                                :   {}),
                                            })),
                                        });
                                    }}
                                >
                                    Delete definition
                                </button>
                            </div>
                            {referencingTemplates.length === 0 ?
                                <p className="mt-1 text-[10px] text-alloy-midnight/45">
                                    Not used by a Work Template
                                </p>
                            :   null}
                            <LifecycleStageOutcomeBehaviorEditor
                                outcomeKey={outcome.outcome_key}
                                outcomeLabel={outcome.label}
                                stageLabel={stageLabel ?? "this stage"}
                                rules={draft.outcome_rules}
                                workTemplates={draft.work_templates}
                                transitionOptions={transitionOptions}
                                completesWork={Boolean(outcome.completes_work ?? outcome.successful)}
                                onRulesChange={(outcome_rules) => onChange({ ...draft, outcome_rules })}
                            />
                        </article>
                    );
                })}
                {!scopedOutcomes.length ?
                    <p className="text-[10px] text-alloy-midnight/45">
                        {workTemplateKey ? "No Available Outcomes defined for this work yet." : "No outcomes defined."}
                    </p>
                :   null}
            </div>
        </section>
    );
}
