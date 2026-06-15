"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import {
    BUSINESS_PROCESS_SECTION_EXPECTED_WORK_SUMMARY,
    BUSINESS_PROCESS_SECTION_PURPOSE,
    BUSINESS_PROCESS_SECTION_SUCCESS,
    BUSINESS_PROCESS_SECTION_SUCCESS_SUMMARY,
    OPERATING_PLAN_EDITOR_RUNTIME_NOTE,
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
    outcomeAutomationIndicators,
    operatingPlanOutcomeSaveWarnings,
} from "@/lib/lifecycle/stageOperatingPlanOutcomeValidation";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import { STAGE_JOURNEY_SEGMENT_LABELS } from "@/lib/lifecycle/stageOperatingPlanUiLabels";

export type LifecycleStageOperatingPlanEditorHandle = {
    getDraftPlan: () => StageOperatingPlanV1 | null;
    isDirty: () => boolean;
};

type Props = {
    stageKey: string;
    savedPlan: StageOperatingPlanV1 | null;
    onDirtyChange?: (dirty: boolean) => void;
};

const LifecycleStageOperatingPlanEditor = forwardRef<
    LifecycleStageOperatingPlanEditorHandle,
    Props
>(function LifecycleStageOperatingPlanEditor({ stageKey, savedPlan, onDirtyChange }, ref) {
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

    const outcomeIndicators = useMemo(() => outcomeAutomationIndicators(draft), [draft]);
    const saveWarnings = useMemo(() => operatingPlanOutcomeSaveWarnings(draft), [draft]);

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

    return (
        <div className="space-y-3" data-testid="lifecycle-stage-operating-plan-editor">
            <p className="rounded-md border border-sky-200/50 bg-sky-50/60 px-2.5 py-2 text-[11px] leading-relaxed text-sky-950/85">
                {OPERATING_PLAN_EDITOR_RUNTIME_NOTE}
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

            <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-alloy-midnight/75">Expected work</span>
                    <button
                        type="button"
                        className="text-[10px] font-medium text-alloy-pine"
                        onClick={() =>
                            setDraft((prev) => ({
                                ...prev,
                                work_templates: [...prev.work_templates, newWorkTemplateDraft(prev.work_templates.length)],
                            }))
                        }
                        data-testid="stage-operating-plan-add-work"
                    >
                        + Add work
                    </button>
                </div>
                <p className="text-[10px] text-alloy-midnight/50">{BUSINESS_PROCESS_SECTION_EXPECTED_WORK_SUMMARY}</p>
                <ul className="space-y-1.5" data-testid="stage-operating-plan-work-list">
                    {draft.work_templates.map((work, index) => (
                        <li
                            key={work.template_key}
                            className="rounded-md border border-alloy-forge/12 p-2"
                            data-testid={`stage-operating-plan-work-${work.template_key}`}
                        >
                            <input
                                className="mb-1 w-full rounded border border-alloy-forge/15 px-2 py-1 text-xs"
                                value={work.label}
                                onChange={(e) =>
                                    setDraft((prev) => {
                                        const work_templates = [...prev.work_templates];
                                        work_templates[index] = { ...work, label: e.target.value };
                                        return { ...prev, work_templates };
                                    })
                                }
                            />
                            <textarea
                                className="mb-1 min-h-[36px] w-full rounded border border-alloy-forge/15 px-2 py-1 text-[11px] text-alloy-midnight/70"
                                placeholder="Description (optional — shown on drawer Work card)"
                                value={work.description ?? ""}
                                onChange={(e) =>
                                    setDraft((prev) => {
                                        const work_templates = [...prev.work_templates];
                                        const description = e.target.value.trim();
                                        work_templates[index] = {
                                            ...work,
                                            ...(description ? { description } : {}),
                                        };
                                        if (!description) delete work_templates[index]!.description;
                                        return { ...prev, work_templates };
                                    })
                                }
                            />
                            <div className="flex flex-wrap items-center gap-3 text-[10px] text-alloy-midnight/65">
                                <label className="flex items-center gap-1">
                                    <input
                                        type="checkbox"
                                        checked={work.primary === true}
                                        onChange={(e) =>
                                            setDraft((prev) => {
                                                const work_templates = prev.work_templates.map((t, i) => {
                                                    if (i === index) {
                                                        return e.target.checked
                                                            ? { ...t, primary: true, required: true }
                                                            : { ...t, primary: undefined };
                                                    }
                                                    const next = { ...t };
                                                    delete next.primary;
                                                    return next;
                                                });
                                                return { ...prev, work_templates };
                                            })
                                        }
                                    />
                                    Primary (drawer Work card)
                                </label>
                                <label className="flex items-center gap-1">
                                    <input
                                        type="checkbox"
                                        checked={work.required}
                                        onChange={(e) =>
                                            setDraft((prev) => {
                                                const work_templates = [...prev.work_templates];
                                                work_templates[index] = { ...work, required: e.target.checked };
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
                                        value={
                                            work.due_policy.kind === "same_day" ? 0 : (work.due_policy.days ?? 1)
                                        }
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
                                        }))
                                    }
                                >
                                    Remove
                                </button>
                            </div>
                        </li>
                    ))}
                    {!draft.work_templates.length ?
                        <li className="text-xs text-alloy-midnight/50">No work configured yet.</li>
                    :   null}
                </ul>
            </div>

            <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-alloy-midnight/75">{BUSINESS_PROCESS_SECTION_SUCCESS}</span>
                    <button
                        type="button"
                        className="text-[10px] font-medium text-alloy-pine"
                        onClick={() =>
                            setDraft((prev) => ({
                                ...prev,
                                outcomes: [...prev.outcomes, newOutcomeDraft(prev.outcomes.length)],
                            }))
                        }
                        data-testid="stage-operating-plan-add-outcome"
                    >
                        + Add outcome
                    </button>
                </div>
                <p className="text-[10px] text-alloy-midnight/50">{BUSINESS_PROCESS_SECTION_SUCCESS_SUMMARY}</p>
                <ul className="space-y-1.5" data-testid="stage-operating-plan-outcome-list">
                    {draft.outcomes.map((outcome, index) => {
                        const indicator = outcomeIndicators.find((i) => i.outcome_key === outcome.outcome_key);
                        return (
                            <li
                                key={outcome.outcome_key}
                                className="rounded-md border border-alloy-forge/10 px-2 py-1.5"
                            >
                                <div className="flex flex-wrap items-center gap-2">
                                    <input
                                        className="min-w-0 flex-1 rounded border border-alloy-forge/15 px-2 py-1 text-xs"
                                        value={outcome.label}
                                        onChange={(e) =>
                                            setDraft((prev) => {
                                                const outcomes = [...prev.outcomes];
                                                outcomes[index] = { ...outcome, label: e.target.value };
                                                return { ...prev, outcomes };
                                            })
                                        }
                                        data-testid={`stage-operating-plan-outcome-${outcome.outcome_key}`}
                                    />
                                    <label className="flex items-center gap-1 text-[10px] text-alloy-midnight/65">
                                        <input
                                            type="checkbox"
                                            checked={Boolean(outcome.successful)}
                                            onChange={(e) =>
                                                setDraft((prev) => {
                                                    const outcomes = [...prev.outcomes];
                                                    outcomes[index] = {
                                                        ...outcome,
                                                        ...(e.target.checked ? { successful: true } : {}),
                                                    };
                                                    if (!e.target.checked) delete outcomes[index]!.successful;
                                                    return { ...prev, outcomes };
                                                })
                                            }
                                        />
                                        Counts as success
                                    </label>
                                </div>
                                <p
                                    className={
                                        indicator?.has_automation
                                            ? "mt-1 text-[10px] text-alloy-pine"
                                            : "mt-1 text-[10px] text-amber-800/80"
                                    }
                                >
                                    {indicator?.has_automation
                                        ? `Automation attached${indicator.rule_summaries.length ? `: ${indicator.rule_summaries.join("; ")}` : ""}`
                                        : "No automation attached"}
                                </p>
                            </li>
                        );
                    })}
                </ul>
            </div>

            {saveWarnings.length > 0 ?
                <ul
                    className="space-y-1 rounded-md border border-amber-200/60 bg-amber-50/70 px-2.5 py-2 text-[10px] text-amber-950/90"
                    data-testid="stage-operating-plan-save-warnings"
                >
                    {saveWarnings.map((warning) => (
                        <li key={`${warning.kind}-${warning.outcome_key ?? warning.rule_key}`}>{warning.message}</li>
                    ))}
                </ul>
            :   null}
        </div>
    );
});

export default LifecycleStageOperatingPlanEditor;
