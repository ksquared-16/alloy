"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import {
    BUSINESS_PROCESS_SECTION_ATTENTION,
    BUSINESS_PROCESS_SECTION_PURPOSE,
} from "@/lib/lifecycle/businessProcessUiLabels";
import {
    newWorkTemplateDraft,
    stageOperatingPlanDraftDirty,
    stageOperatingPlanDraftFromSaved,
    stageOperatingPlanDraftToPersisted,
    type StageOperatingPlanEditorDraft,
} from "@/lib/lifecycle/stageOperatingPlanEditorModel";
import {
    resolveEffectivePrimaryWorkTemplate,
    setPrimaryWorkTemplate,
} from "@/lib/lifecycle/stageOperatingPlanConvergence";
import type { ProcessTracksV1 } from "@/lib/businessProcesses/processConfigTypes";
import type { StageOperatingPlanV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import { STAGE_JOURNEY_SEGMENT_LABELS } from "@/lib/lifecycle/stageOperatingPlanUiLabels";
import LifecycleStageAttentionRulesEditor from "@/components/adminV2/settings/lifecycle/LifecycleStageAttentionRulesEditor";
import LifecycleStageWorkCompletionPolicyEditor from "@/components/adminV2/settings/lifecycle/LifecycleStageWorkCompletionPolicyEditor";
import LifecycleStageWorkTemplateActionsEditor from "@/components/adminV2/settings/lifecycle/LifecycleStageWorkTemplateActionsEditor";
import LifecycleStageOutgoingTransitionsEditor from "@/components/adminV2/settings/lifecycle/LifecycleStageOutgoingTransitionsEditor";
import type { StageActionCatalogV1 } from "@/lib/lifecycle/stageActionCatalogV1";
import type { LifecycleConfiguredActionRow } from "@/lib/lifecycle/lifecycleConfiguredActionRows";
import type { LifecycleBuilderProcessRecord } from "@/lib/lifecycle/lifecycleBuilderConfig";
import { resolveStageOutcomeTransitionOptions } from "@/lib/lifecycle/resolveStageOutcomeTransitionOptions";
import type { OutcomeStatusConfiguredRow } from "@/lib/lifecycle/resolveOutcomeStatusOptions";
import {
    validateStageOperatingPlanOperatingContract,
    type StageOperatingContractIssue,
} from "@/lib/lifecycle/validateStageOperatingPlanOperatingContract";
import {
    assessStageOperatingPlanEdit,
    type StageOperatingPlanDraftSave,
} from "@/lib/lifecycle/stageOperatingPlanDraftDelta";
import {
    WorkItemAttentionSection,
    WorkItemFollowUpSection,
} from "@/components/adminV2/settings/lifecycle/WorkItemOperatingSections";


export type LifecycleStageOperatingPlanEditorHandle = {
    /**
     * The plan to persist, plus a delta-aware verdict on it (D3, drafting half).
     *
     * This used to THROW on any blocking issue, which meant a stage carrying a pre-existing defect
     * could not be saved at all — the throw happened before the request was assembled, so the
     * operator saw a dead button and no explanation. It now always returns; the caller decides,
     * and blocks only on what this edit introduced or worsened.
     */
    getDraftPlan: () => StageOperatingPlanDraftSave | null;
    isDirty: () => boolean;
};

type Props = {
    stageKey: string;
    stageLabel?: string;
    savedPlan: StageOperatingPlanV1 | null;
    onDirtyChange?: (dirty: boolean) => void;
    actionCatalog?: StageActionCatalogV1 | null;
    configuredActions?: LifecycleConfiguredActionRow[];
    processStages?: Array<{ key: string; label: string }>;
    processTracks?: ProcessTracksV1 | null;
    configuredStatuses?: ReadonlyArray<OutcomeStatusConfiguredRow>;
    /** P6.S3 — process record for Command selection gating. */
    process?: LifecycleBuilderProcessRecord | null;
};

function dueDaysFromPolicy(work: StageOperatingPlanEditorDraft["work_templates"][number]): number {
    return work.due_policy.kind === "same_day" ? 0 : work.due_policy.days ?? 1;
}

const LifecycleStageOperatingPlanEditor = forwardRef<
    LifecycleStageOperatingPlanEditorHandle,
    Props
>(function LifecycleStageOperatingPlanEditor(
    {
        stageKey,
        stageLabel,
        savedPlan,
        onDirtyChange,
        actionCatalog,
        configuredActions,
        processStages,
        processTracks,
        configuredStatuses = [],
        process,
    },
    ref,
) {
    const [draft, setDraft] = useState<StageOperatingPlanEditorDraft>(() =>
        stageOperatingPlanDraftFromSaved(savedPlan, stageKey),
    );
    const [selectedWorkKey, setSelectedWorkKey] = useState<string | null>(null);

    useEffect(() => {
        setDraft(stageOperatingPlanDraftFromSaved(savedPlan, stageKey));
    }, [savedPlan, stageKey]);

    useEffect(() => {
        if (!draft.work_templates.length) {
            setSelectedWorkKey(null);
            return;
        }
        // Land on the primary work item rather than an empty pane with "Select a work item…".
        // Operator Work is the dominant editing surface; opening to nothing wastes the fold.
        if (!selectedWorkKey || !draft.work_templates.some((work) => work.template_key === selectedWorkKey)) {
            const primary = draft.work_templates.find((work) => work.primary) ?? draft.work_templates[0]!;
            setSelectedWorkKey(primary.template_key);
        }
    }, [draft.work_templates, selectedWorkKey]);

    const dirty = useMemo(
        () => stageOperatingPlanDraftDirty(savedPlan, draft, stageKey),
        [savedPlan, draft, stageKey],
    );

    useEffect(() => {
        onDirtyChange?.(dirty);
    }, [dirty, onDirtyChange]);

    const entityType = draft.journey_segment === "child" ? "opportunity_customer_members" : "opportunities";

    const stageOperatingPlanForResolver: StageOperatingPlanV1 = useMemo(
        () =>
            stageOperatingPlanDraftToPersisted(draft, stageKey, undefined, { validate: false })
            ?? {
                version: 1,
                lifecycle_key: stageKey,
                stage_key: stageKey,
                journey_segment: draft.journey_segment,
                ...(draft.outgoing_transitions !== undefined
                    ? { outgoing_transitions: draft.outgoing_transitions }
                    : {}),
                work_templates: draft.work_templates,
                outcomes: draft.outcomes,
                outcome_rules: draft.outcome_rules,
                attention_rules: draft.attention_rules,
            },
        [draft, stageKey],
    );

    const transitionOptions = useMemo(
        () =>
            resolveStageOutcomeTransitionOptions({
                currentStageKey: stageKey,
                currentStageLabel: stageLabel,
                stageOperatingPlan: stageOperatingPlanForResolver,
                processTracks: processTracks ?? null,
                processStages: processStages ?? [],
            }),
        [stageKey, stageLabel, stageOperatingPlanForResolver, processTracks, processStages],
    );

    const validPrimaryActionRefs = useMemo(
        () =>
            new Set(
                (configuredActions ?? [])
                    .map((row) => row.key?.trim())
                    .filter((key): key is string => Boolean(key)),
            ),
        [configuredActions],
    );

    const operatingContractContext = useMemo(
        () => ({
            validPrimaryActionRefs,
            transitionOptions,
            configuredStatuses,
            entityType,
            processStageKeys: (processStages ?? []).map((stage) => stage.key),
        }),
        [validPrimaryActionRefs, transitionOptions, configuredStatuses, entityType, processStages],
    );

    const operatingContractIssues: StageOperatingContractIssue[] = useMemo(
        () =>
            validateStageOperatingPlanOperatingContract({
                plan: stageOperatingPlanForResolver,
                ...operatingContractContext,
            }),
        [stageOperatingPlanForResolver, operatingContractContext],
    );

    useImperativeHandle(
        ref,
        () => ({
            getDraftPlan: () => {
                // `validate: false` — the throw is gone; judgement moves to the delta below.
                const plan = stageOperatingPlanDraftToPersisted(draft, stageKey, undefined, {
                    validate: false,
                });
                // No plan means there is nothing to persist for this stage — not a save failure.
                if (!plan) return null;
                // The process as it stands, and as this edit would leave it. Execution-graph
                // findings are only computable across the whole process, so both sides are needed
                // to tell "this edit broke the graph" from "the graph was already broken".
                const processBefore = process ?? undefined;
                const processAfter =
                    process ?
                        {
                            ...process,
                            stages: (process.stages ?? []).map((s) =>
                                s.key === stageKey ? { ...s, stage_operating_plan_v1: plan } : s,
                            ),
                        }
                    :   undefined;

                return {
                    plan,
                    assessment: assessStageOperatingPlanEdit({
                        savedPlan,
                        proposedPlan: plan,
                        operatingContract: operatingContractContext,
                        processBefore,
                        processAfter,
                        stageKey,
                    }),
                };
            },
            isDirty: () => dirty,
        }),
        [draft, dirty, stageKey, savedPlan, operatingContractContext, process],
    );

    const primaryWork = resolveEffectivePrimaryWorkTemplate({ work_templates: draft.work_templates });

    /** Attention the STAGE owns. Work-scoped rules render on their work item instead. */
    const stageOwnedAttentionRules = draft.attention_rules.filter((r) => !(r.template_key ?? "").trim());

    return (
        <div className="space-y-3" data-testid="lifecycle-stage-operating-plan-editor">
            {/* The instructional paragraph that used to sit here ("Configure work items,
                outcomes, and attention…") described the section headings directly beneath it.
                Removed — the page states what it is by being it. */}
            {operatingContractIssues.length > 0 ?
                <ul
                    className="space-y-1 rounded-md border border-amber-200 bg-amber-50/80 px-2.5 py-2"
                    data-testid="stage-operating-plan-contract-issues"
                    role="status"
                >
                    {operatingContractIssues.map((issue) => (
                        <li
                            key={`${issue.controlId}:${issue.code}`}
                            className="text-[0.6875rem] leading-relaxed text-amber-950"
                            data-contract-issue={issue.code}
                            data-control-id={issue.controlId}
                        >
                            {issue.message}
                        </li>
                    ))}
                </ul>
            :   null}

            {/* Purpose and journey are stage framing, not stage work — one row, not two
                full-width blocks pushing Operator Work below the fold. */}
            <div className="stage-grid stage-grid--3">
                <label className="stage-field stage-field--wide">
                    <span className="stage-field__label">{BUSINESS_PROCESS_SECTION_PURPOSE}</span>
                    <textarea
                        className="stage-control"
                        value={draft.purpose}
                        onChange={(e) => setDraft((prev) => ({ ...prev, purpose: e.target.value }))}
                        data-testid="stage-operating-plan-purpose"
                    />
                </label>

                <label className="stage-field">
                    <span className="stage-field__label">Journey</span>
                    <select
                        className="stage-control"
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
            </div>

            {/* Operator Work first — objective 9's reading order is
                Overview → Operator Work → Stage Exit → Attention. What staff DO is the centre of
                the model, so it precedes how families leave. */}
            <div className="stage-panel" data-testid="stage-operating-plan-work-section">
                <details className="group" open data-testid="stage-operating-plan-work-items-collapsible">
                    <summary className="stage-panel__header cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                        <div className="flex items-center gap-2">
                            <span className="stage-section-label">Operator work</span>
                            <span className="stage-count">{draft.work_templates.length}</span>
                        </div>
                        <span className="text-[0.625rem] text-alloy-midnight/40 transition-transform group-open:rotate-90">
                            ›
                        </span>
                    </summary>
                    <div className="stage-panel__body">
            {/* No min-height: an empty region reserved for content that may not exist is the
                "giant empty editing region" the audit measured. The workspace is now as tall as
                what is in it. The queue only appears when there is a choice to make. */}
            <div className="flex flex-col gap-3 lg:flex-row" data-testid="stage-operating-plan-queue-workspace">
                <aside
                    className={`w-full shrink-0 space-y-2 ${draft.work_templates.length > 1 ? "lg:w-40" : "lg:w-auto"}`}
                    data-testid="stage-operating-plan-work-queue"
                >
                    <div className="flex items-center justify-between gap-2">
                        {draft.work_templates.length > 1 ? (
                            <span className="stage-section-label">Work items</span>
                        ) : null}
                        <button
                            type="button"
                            className="text-[0.6875rem] font-semibold text-alloy-pine transition-opacity hover:opacity-70"
                            onClick={() =>
                                setDraft((prev) => {
                                    const next = newWorkTemplateDraft(prev.work_templates.length);
                                    setSelectedWorkKey(next.template_key);
                                    return {
                                        ...prev,
                                        work_templates: [...prev.work_templates, next],
                                    };
                                })
                            }
                            data-testid="stage-operating-plan-add-work"
                        >
                            + Add
                        </button>
                    </div>
                    {/* A one-item picker is not a choice. With a single work item the panel below
                        IS the work item, so the list would be a column of chrome around one row. */}
                    {draft.work_templates.length > 1 ? (
                        <div className="space-y-1.5">
                            {draft.work_templates.map((work) => {
                                const active = work.template_key === selectedWorkKey;
                                return (
                                    <button
                                        key={work.template_key}
                                        type="button"
                                        onClick={() => setSelectedWorkKey(work.template_key)}
                                        className={`process-config-work-view-list-card !py-2 ${active ? "process-config-work-view-list-card--active" : ""}`}
                                        data-testid={`stage-operating-plan-work-queue-${work.template_key}`}
                                    >
                                        <p className="truncate text-left text-[0.8125rem] font-semibold text-alloy-midnight">
                                            {work.label.trim() || "Untitled work item"}
                                        </p>
                                    </button>
                                );
                            })}
                        </div>
                    ) : draft.work_templates.length === 1 ? (
                        // Keeps the selection testable and addressable even without a visible list.
                        <button
                            type="button"
                            className="sr-only"
                            onClick={() => setSelectedWorkKey(draft.work_templates[0]!.template_key)}
                            data-testid={`stage-operating-plan-work-queue-${draft.work_templates[0]!.template_key}`}
                        >
                            {draft.work_templates[0]!.label.trim() || "Untitled work item"}
                        </button>
                    ) : (
                        <p className="stage-field__hint">
                            No work items yet. Add one to describe what staff do in this stage.
                        </p>
                    )}
                </aside>

                <div className="min-w-0 flex-1 space-y-3" data-testid="stage-operating-plan-work-workspace">
                {draft.work_templates.map((work, index) => {
                        if (work.template_key !== selectedWorkKey) return null;
                        const isPrimary =
                            work.primary === true ||
                            (primaryWork?.template_key === work.template_key && !draft.work_templates.some((w) => w.primary));

                        return (
                            <div
                                key={work.template_key}
                                className="stage-panel p-3"
                                data-testid={`stage-operating-plan-work-${work.template_key}`}
                            >
                                {/* Identity and expectations on one grid: name, whether it is
                                    required, and when it is due — the three things an operator
                                    sets first, previously spread across three different rows with
                                    three different label styles. */}
                                <div className="stage-grid stage-grid--4">
                                    <label className="stage-field stage-field--wide">
                                        <span className="stage-field__label">Work item</span>
                                        <input
                                            className="stage-control font-medium"
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
                                    </label>
                                    <div className="stage-field">
                                        <span className="stage-field__label">Expectation</span>
                                        <label className="flex h-8 cursor-pointer items-center gap-1.5 text-[0.75rem] text-alloy-midnight/75">
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
                                    </div>
                                    <div className="stage-field">
                                        <span className="stage-field__label">Due within</span>
                                        <div className="flex h-8 items-center gap-1.5">
                                            <input
                                                type="number"
                                                min={0}
                                                className="stage-control w-14"
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
                                            <span className="text-[0.75rem] text-alloy-midnight/60">
                                                {dueDaysFromPolicy(work) === 0 ? "— same day" : "days"}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <label className="stage-field mt-3">
                                    <span className="stage-field__label">What staff should accomplish</span>
                                    <textarea
                                        className="stage-control"
                                        value={work.description ?? ""}
                                        placeholder="Reach the family, understand their needs, and establish the next step."
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
                                </label>

                                <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-alloy-forge/8 pt-2.5 text-[0.75rem] text-alloy-midnight/65">
                                    <label className="flex cursor-pointer items-center gap-1.5">
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
                                        {/* One statement of what Primary means, replacing a
                                            "Primary" radio sitting beside a "WORK INTENT DRIVER"
                                            badge that said the same thing twice. */}
                                        Primary work {isPrimary ? "— drives Work Intent at runtime" : ""}
                                    </label>
                                    <button
                                        type="button"
                                        className="ml-auto text-[0.6875rem] font-medium text-red-700/80 transition-opacity hover:opacity-70"
                                        onClick={() =>
                                            setDraft((prev) => ({
                                                ...prev,
                                                work_templates: prev.work_templates.filter((_, i) => i !== index),
                                            }))
                                        }
                                    >
                                        Remove work item
                                    </button>
                                </div>

                                <LifecycleStageWorkCompletionPolicyEditor
                                    policy={work.completion_policy}
                                    testIdPrefix={`stage-operating-plan-work-${work.template_key}`}
                                    onChange={(completion_policy) =>
                                        setDraft((prev) => {
                                            const work_templates = [...prev.work_templates];
                                            const next = { ...work, completion_policy };
                                            if (!completion_policy) delete next.completion_policy;
                                            work_templates[index] = next;
                                            return { ...prev, work_templates };
                                        })
                                    }
                                />

                                <LifecycleStageWorkTemplateActionsEditor
                                    work={work}
                                    stageKey={stageKey}
                                    stageLabel={stageLabel}
                                    stageOutcomes={draft.outcomes}
                                    actionCatalog={actionCatalog ?? null}
                                    configuredActions={configuredActions ?? []}
                                    processStages={processStages ?? []}
                                    stageOperatingPlan={stageOperatingPlanForResolver}
                                    processTracks={processTracks ?? null}
                                    stageDefinition={{ journey_segment: draft.journey_segment }}
                                    process={process ?? null}
                                    stageDraft={draft}
                                    transitionOptions={transitionOptions}
                                    configuredStatuses={configuredStatuses}
                                    entityType={entityType}
                                    onStageDraftChange={setDraft}
                                    onChange={(nextWork) =>
                                        setDraft((prev) => {
                                            const work_templates = [...prev.work_templates];
                                            work_templates[index] = nextWork;
                                            return { ...prev, work_templates };
                                        })
                                    }
                                />

                                {/* Follow-up and attention are persisted elsewhere — on outcome
                                    rules and on the stage's flat attention array — but they answer
                                    questions an operator asks while looking at THIS work item.
                                    Composed here, never copied. See WorkItemOperatingSections. */}
                                <div className="space-y-4 border-t border-alloy-forge/8 pt-3">
                                    <WorkItemFollowUpSection plan={stageOperatingPlanForResolver} work={work} />
                                    <WorkItemAttentionSection
                                        templateKey={work.template_key}
                                        workLabel={work.label?.trim() || work.template_key}
                                        rules={draft.attention_rules}
                                        workTemplates={draft.work_templates}
                                        stageLabel={stageLabel?.trim() || stageKey}
                                        onChange={(attention_rules) =>
                                            setDraft((prev) => ({ ...prev, attention_rules }))
                                        }
                                    />
                                </div>
                            </div>
                        );
                    })}
                {!selectedWorkKey ?
                    <p className="text-sm text-alloy-midnight/50">Select a work item to configure purpose, timing, and outcomes.</p>
                :   null}
                </div>
                    </div>
                    </div>
                </details>
            </div>

            <LifecycleStageOutgoingTransitionsEditor
                stageKey={stageKey}
                stageLabel={stageLabel}
                transitions={draft.outgoing_transitions ?? []}
                processStages={processStages ?? []}
                configuredStatuses={configuredStatuses}
                entityType={entityType}
                plan={stageOperatingPlanForResolver}
                onChange={(outgoing_transitions) => setDraft((prev) => ({ ...prev, outgoing_transitions }))}
            />

            <div className="stage-panel" data-testid="stage-operating-plan-attention-section">
                <details className="group" data-testid="stage-operating-plan-attention-collapsible">
                    <summary className="stage-panel__header cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                        <div className="flex items-center gap-2">
                            <span className="stage-section-label">Stage-level attention</span>
                            <span className="stage-count">{stageOwnedAttentionRules.length}</span>
                        </div>
                        <span className="text-[0.625rem] text-alloy-midnight/40 transition-transform group-open:rotate-90">
                            ›
                        </span>
                    </summary>
                    <div className="stage-panel__body">
                        <p className="stage-field__hint mb-2">
                            Signals about the stage itself — ownership, age, missing information.
                            Attention about a specific piece of work lives with that work item above.
                        </p>
                        <LifecycleStageAttentionRulesEditor
                            rules={stageOwnedAttentionRules}
                            workTemplates={draft.work_templates}
                            onChange={(next) =>
                                setDraft((prev) => ({
                                    ...prev,
                                    // Same single array: keep every work-scoped rule untouched and
                                    // replace only the stage-owned slice.
                                    attention_rules: [
                                        ...prev.attention_rules.filter((r) => (r.template_key ?? "").trim()),
                                        ...next,
                                    ],
                                }))
                            }
                            stageLabel={stageLabel?.trim() || stageKey}
                            layout="queue_workspace"
                        />
                    </div>
                </details>
            </div>
        </div>
    );
});

export default LifecycleStageOperatingPlanEditor;
