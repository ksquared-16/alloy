"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import {
    BUSINESS_PROCESS_SECTION_ATTENTION,
    BUSINESS_PROCESS_SECTION_PURPOSE,
} from "@/lib/lifecycle/businessProcessUiLabels";
import {
    newOutcomeDraft,
    newWorkTemplateDraft,
    stageOperatingPlanDraftDirty,
    stageOperatingPlanDraftFromSaved,
    stageOperatingPlanDraftToPersisted,
    type StageOperatingPlanEditorDraft,
} from "@/lib/lifecycle/stageOperatingPlanEditorModel";
import {
    outcomeAutomationSummaries,
    outcomesForWorkTemplate,
    resolveEffectivePrimaryWorkTemplate,
    setPrimaryWorkTemplate,
    unattachedStageOutcomes,
    workTemplateLabelMap,
} from "@/lib/lifecycle/stageOperatingPlanConvergence";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import { STAGE_JOURNEY_SEGMENT_LABELS } from "@/lib/lifecycle/stageOperatingPlanUiLabels";
import LifecycleStageAttentionRulesEditor from "@/components/adminV2/settings/lifecycle/LifecycleStageAttentionRulesEditor";

export type LifecycleStageOperatingPlanEditorHandle = {
    getDraftPlan: () => StageOperatingPlanV1 | null;
    isDirty: () => boolean;
};

type Props = {
    stageKey: string;
    stageLabel?: string;
    savedPlan: StageOperatingPlanV1 | null;
    onDirtyChange?: (dirty: boolean) => void;
};

function dueDaysFromPolicy(work: StageOperatingPlanEditorDraft["work_templates"][number]): number {
    return work.due_policy.kind === "same_day" ? 0 : work.due_policy.days ?? 1;
}

const LifecycleStageOperatingPlanEditor = forwardRef<
    LifecycleStageOperatingPlanEditorHandle,
    Props
>(function LifecycleStageOperatingPlanEditor({ stageKey, stageLabel, savedPlan, onDirtyChange }, ref) {
    const [draft, setDraft] = useState<StageOperatingPlanEditorDraft>(() =>
        stageOperatingPlanDraftFromSaved(savedPlan, stageKey),
    );

    useEffect(() => {
        setDraft(stageOperatingPlanDraftFromSaved(savedPlan, stageKey));
    }, [savedPlan, stageKey]);

    const dirty = useMemo(
        () => stageOperatingPlanDraftDirty(savedPlan, draft, stageKey),
        [savedPlan, draft, stageKey],
    );

    useEffect(() => {
        onDirtyChange?.(dirty);
    }, [dirty, onDirtyChange]);

    useImperativeHandle(
        ref,
        () => ({
            getDraftPlan: () => stageOperatingPlanDraftToPersisted(draft, stageKey),
            isDirty: () => dirty,
        }),
        [draft, dirty, stageKey],
    );

    const primaryWork = resolveEffectivePrimaryWorkTemplate({ work_templates: draft.work_templates });
    const templateLabels = workTemplateLabelMap(draft.work_templates);
    const legacyOutcomes = unattachedStageOutcomes(draft.outcomes);

    return (
        <div className="space-y-4" data-testid="lifecycle-stage-operating-plan-editor">
            <p className="text-[11px] text-alloy-midnight/55">
                Configure work items, outcomes, and attention for this stage. Primary work drives Work Intent
                runtime when saved.
            </p>

            <label className="block space-y-1">
                <span className="text-[11px] font-medium text-alloy-midnight/70">{BUSINESS_PROCESS_SECTION_PURPOSE}</span>
                <textarea
                    className="min-h-[52px] w-full rounded-md border border-alloy-forge/20 bg-white px-2 py-1.5 text-xs"
                    value={draft.purpose}
                    onChange={(e) => setDraft((prev) => ({ ...prev, purpose: e.target.value }))}
                    data-testid="stage-operating-plan-purpose"
                />
            </label>

            <label className="block space-y-1">
                <span className="text-[11px] font-medium text-alloy-midnight/70">Journey</span>
                <select
                    className="w-full rounded-md border border-alloy-forge/20 bg-white px-2 py-1.5 text-xs"
                    value={draft.journey_segment}
                    onChange={(e) =>
                        setDraft((prev) => ({
                            ...prev,
                            journey_segment: e.target.value as "family" | "child",
                        }))
                    }
                    data-testid="stage-operating-plan-journey"
                >
                    <option value="family">{STAGE_JOURNEY_SEGMENT_LABELS.family}</option>
                    <option value="child">{STAGE_JOURNEY_SEGMENT_LABELS.child}</option>
                </select>
            </label>

            <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                    <div>
                        <span className="text-[11px] font-semibold text-alloy-midnight/75">Work items</span>
                        <p className="text-[10px] text-alloy-midnight/50">
                            One primary work item per stage. If none is marked, the first required item is
                            treated as primary.
                        </p>
                    </div>
                    <button
                        type="button"
                        className="text-[10px] font-medium text-alloy-pine"
                        onClick={() =>
                            setDraft((prev) => ({
                                ...prev,
                                work_templates: [
                                    ...prev.work_templates,
                                    newWorkTemplateDraft(prev.work_templates.length),
                                ],
                            }))
                        }
                        data-testid="stage-operating-plan-add-work"
                    >
                        + Add work item
                    </button>
                </div>

                <ul className="space-y-2" data-testid="stage-operating-plan-work-list">
                    {draft.work_templates.map((work, index) => {
                        const workOutcomes = outcomesForWorkTemplate(draft.outcomes, work.template_key);
                        const isPrimary =
                            work.primary === true ||
                            (primaryWork?.template_key === work.template_key && !draft.work_templates.some((w) => w.primary));

                        return (
                            <li
                                key={work.template_key}
                                className={`rounded-md border p-2.5 ${
                                    isPrimary ?
                                        "border-alloy-pine/30 bg-alloy-pine/[0.04]"
                                    :   "border-alloy-forge/12"
                                }`}
                                data-testid={`stage-operating-plan-work-${work.template_key}`}
                            >
                                <div className="mb-2 flex flex-wrap items-center gap-2">
                                    <input
                                        className="min-w-0 flex-1 rounded border border-alloy-forge/15 px-2 py-1 text-xs font-medium"
                                        value={work.label}
                                        placeholder="Work item name"
                                        onChange={(e) =>
                                            setDraft((prev) => {
                                                const work_templates = [...prev.work_templates];
                                                work_templates[index] = { ...work, label: e.target.value };
                                                return { ...prev, work_templates };
                                            })
                                        }
                                    />
                                    <label className="flex items-center gap-1 rounded-full border border-alloy-forge/15 px-2 py-0.5 text-[10px]">
                                        <input
                                            type="radio"
                                            name="primary-work-item"
                                            checked={isPrimary}
                                            onChange={() =>
                                                setDraft((prev) => ({
                                                    ...prev,
                                                    work_templates: setPrimaryWorkTemplate(
                                                        prev.work_templates,
                                                        work.template_key,
                                                    ),
                                                }))
                                            }
                                            data-testid={`stage-operating-plan-primary-${work.template_key}`}
                                        />
                                        Primary
                                    </label>
                                    {isPrimary ?
                                        <span className="rounded-full bg-alloy-pine/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-alloy-pine">
                                            Work Intent driver
                                        </span>
                                    :   null}
                                </div>

                                <textarea
                                    className="mb-2 min-h-[40px] w-full rounded border border-alloy-forge/15 px-2 py-1 text-xs"
                                    value={work.description ?? ""}
                                    placeholder="Description (what staff should accomplish)"
                                    onChange={(e) =>
                                        setDraft((prev) => {
                                            const work_templates = [...prev.work_templates];
                                            work_templates[index] = {
                                                ...work,
                                                description: e.target.value,
                                            };
                                            return { ...prev, work_templates };
                                        })
                                    }
                                />

                                <div className="flex flex-wrap items-center gap-3 text-[10px] text-alloy-midnight/65">
                                    <label className="flex items-center gap-1">
                                        <input
                                            type="checkbox"
                                            checked={work.required}
                                            onChange={(e) =>
                                                setDraft((prev) => {
                                                    const work_templates = [...prev.work_templates];
                                                    work_templates[index] = {
                                                        ...work,
                                                        required: e.target.checked,
                                                    };
                                                    return { ...prev, work_templates };
                                                })
                                            }
                                        />
                                        Required
                                    </label>
                                    <label className="flex items-center gap-1">
                                        Due
                                        <input
                                            type="number"
                                            min={0}
                                            className="w-12 rounded border border-alloy-forge/15 px-1 py-0.5"
                                            value={dueDaysFromPolicy(work)}
                                            onChange={(e) => {
                                                const days = Math.max(0, Number(e.target.value) || 0);
                                                setDraft((prev) => {
                                                    const work_templates = [...prev.work_templates];
                                                    work_templates[index] = {
                                                        ...work,
                                                        due_policy:
                                                            days === 0
                                                                ? { kind: "same_day" }
                                                                : { kind: "offset_days", days },
                                                    };
                                                    return { ...prev, work_templates };
                                                });
                                            }}
                                        />
                                        days
                                    </label>
                                    <button
                                        type="button"
                                        className="text-red-700/80"
                                        onClick={() =>
                                            setDraft((prev) => ({
                                                ...prev,
                                                work_templates: prev.work_templates.filter((_, i) => i !== index),
                                                outcomes: prev.outcomes.filter(
                                                    (o) => o.work_template_key !== work.template_key,
                                                ),
                                            }))
                                        }
                                    >
                                        Remove work item
                                    </button>
                                </div>

                                <div className="mt-3 border-t border-alloy-forge/10 pt-2">
                                    <div className="mb-1 flex items-center justify-between gap-2">
                                        <span className="text-[10px] font-semibold text-alloy-midnight/70">
                                            Outcomes for {work.label || "this work"}
                                        </span>
                                        <button
                                            type="button"
                                            className="text-[10px] font-medium text-alloy-pine"
                                            onClick={() =>
                                                setDraft((prev) => ({
                                                    ...prev,
                                                    outcomes: [
                                                        ...prev.outcomes,
                                                        newOutcomeDraft(prev.outcomes.length, {
                                                            work_template_key: work.template_key,
                                                        }),
                                                    ],
                                                }))
                                            }
                                        >
                                            + Add outcome
                                        </button>
                                    </div>
                                    <ul className="space-y-1.5">
                                        {workOutcomes.map((outcome) => {
                                            const outcomeIndex = draft.outcomes.findIndex(
                                                (o) => o.outcome_key === outcome.outcome_key,
                                            );
                                            const automations = outcomeAutomationSummaries(
                                                outcome.outcome_key,
                                                draft.outcome_rules,
                                                { workTemplateLabelByKey: templateLabels },
                                            );
                                            return (
                                                <li
                                                    key={outcome.outcome_key}
                                                    className="rounded border border-alloy-forge/10 bg-white/80 px-2 py-1.5"
                                                    data-testid={`stage-operating-plan-outcome-${outcome.outcome_key}`}
                                                >
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <input
                                                            className="min-w-0 flex-1 rounded border border-alloy-forge/15 px-2 py-1 text-xs"
                                                            value={outcome.label}
                                                            onChange={(e) =>
                                                                setDraft((prev) => {
                                                                    const outcomes = [...prev.outcomes];
                                                                    outcomes[outcomeIndex] = {
                                                                        ...outcome,
                                                                        label: e.target.value,
                                                                    };
                                                                    return { ...prev, outcomes };
                                                                })
                                                            }
                                                        />
                                                        <label className="flex items-center gap-1 text-[10px] text-alloy-midnight/65">
                                                            <input
                                                                type="checkbox"
                                                                checked={Boolean(outcome.successful)}
                                                                onChange={(e) =>
                                                                    setDraft((prev) => {
                                                                        const outcomes = [...prev.outcomes];
                                                                        const next = { ...outcome };
                                                                        if (e.target.checked) next.successful = true;
                                                                        else delete next.successful;
                                                                        outcomes[outcomeIndex] = next;
                                                                        return { ...prev, outcomes };
                                                                    })
                                                                }
                                                            />
                                                            Success
                                                        </label>
                                                        <button
                                                            type="button"
                                                            className="text-[10px] text-red-700/80"
                                                            onClick={() =>
                                                                setDraft((prev) => ({
                                                                    ...prev,
                                                                    outcomes: prev.outcomes.filter(
                                                                        (o) => o.outcome_key !== outcome.outcome_key,
                                                                    ),
                                                                }))
                                                            }
                                                        >
                                                            Remove
                                                        </button>
                                                    </div>
                                                    <p
                                                        className="mt-1 text-[10px] text-alloy-midnight/50"
                                                        data-testid={`stage-outcome-automation-${outcome.outcome_key}`}
                                                    >
                                                        {automations.length ?
                                                            automations.map((line) => `→ ${line}`).join(" · ")
                                                        :   "No automation attached"}
                                                    </p>
                                                </li>
                                            );
                                        })}
                                        {!workOutcomes.length ?
                                            <li className="text-[10px] text-alloy-midnight/45">No outcomes yet.</li>
                                        :   null}
                                    </ul>
                                </div>
                            </li>
                        );
                    })}
                    {!draft.work_templates.length ?
                        <li className="text-xs text-alloy-midnight/50">No work items configured yet.</li>
                    :   null}
                </ul>
            </div>

            {legacyOutcomes.length ?
                <div className="space-y-1.5 rounded-md border border-dashed border-alloy-forge/15 p-2">
                    <span className="text-[11px] font-semibold text-alloy-midnight/75">
                        Stage-level outcomes (legacy)
                    </span>
                    <p className="text-[10px] text-alloy-midnight/50">
                        These outcomes are not attached to a work item. Runtime still reads them from the stage
                        plan.
                    </p>
                    <ul className="space-y-1">
                        {legacyOutcomes.map((outcome) => {
                            const outcomeIndex = draft.outcomes.findIndex(
                                (o) => o.outcome_key === outcome.outcome_key,
                            );
                            const automations = outcomeAutomationSummaries(
                                outcome.outcome_key,
                                draft.outcome_rules,
                                { workTemplateLabelByKey: templateLabels },
                            );
                            return (
                                <li key={outcome.outcome_key} className="flex flex-wrap items-center gap-2">
                                    <input
                                        className="min-w-0 flex-1 rounded border border-alloy-forge/15 px-2 py-1 text-xs"
                                        value={outcome.label}
                                        onChange={(e) =>
                                            setDraft((prev) => {
                                                const outcomes = [...prev.outcomes];
                                                outcomes[outcomeIndex] = { ...outcome, label: e.target.value };
                                                return { ...prev, outcomes };
                                            })
                                        }
                                    />
                                    <span className="text-[10px] text-alloy-midnight/45">
                                        {automations.length ?
                                            automations.map((line) => `→ ${line}`).join(" · ")
                                        :   "No automation attached"}
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            :   null}

            <div className="border-t border-alloy-forge/8 pt-3">
                <h5 className="mb-2 text-[11px] font-semibold text-alloy-midnight/75">
                    {BUSINESS_PROCESS_SECTION_ATTENTION}
                </h5>
                <LifecycleStageAttentionRulesEditor
                    rules={draft.attention_rules}
                    workTemplates={draft.work_templates}
                    onChange={(attention_rules) => setDraft((prev) => ({ ...prev, attention_rules }))}
                    stageLabel={stageLabel?.trim() || stageKey}
                />
            </div>
        </div>
    );
});

export default LifecycleStageOperatingPlanEditor;
