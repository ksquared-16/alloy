"use client";

import { useState } from "react";

import LifecycleStageOutcomeBehaviorEditor from "@/components/adminV2/settings/lifecycle/LifecycleStageOutcomeBehaviorEditor";
import {
    ensureOutgoingTransitionToStage,
    newOutcomeDraft,
    type StageOperatingPlanEditorDraft,
} from "@/lib/lifecycle/stageOperatingPlanEditorModel";
import {
    outcomeAutomationSummaryForOutcome,
    readComposableOutcomeBehaviorDraft,
    upsertComposableOutcomeBehavior,
} from "@/lib/lifecycle/stageOutcomeAutomation";
import type { StageOutcomeTransitionOption } from "@/lib/lifecycle/resolveStageOutcomeTransitionOptions";
import type { OutcomeStatusConfiguredRow } from "@/lib/lifecycle/resolveOutcomeStatusOptions";
import { resolveOutcomeStatusOptions } from "@/lib/lifecycle/resolveOutcomeStatusOptions";
import { resolveStageGrain } from "@/lib/lifecycle/stageGrainResolution";
import {
    setWorkTemplateOutcomeRefs,
    workTemplateOutcomeRefs,
} from "@/lib/lifecycle/stageWorkTemplateActionRefs";

type Props = {
    draft: StageOperatingPlanEditorDraft;
    transitionOptions: StageOutcomeTransitionOption[];
    /** Operator-facing stage name, used when explaining that it has no outgoing transitions. */
    stageLabel?: string;
    /** Stage that owns these outcomes. With `processStages`, enables authoring an exit path here. */
    stageKey?: string;
    /** Every stage in the process — the destinations a new exit path may target. */
    processStages?: Array<{ key: string; label: string; grain?: string }>;
    /** Case-status catalog, so a terminal outcome can resolve the canonical closed status. */
    configuredStatuses?: ReadonlyArray<OutcomeStatusConfiguredRow>;
    /** `opportunities` for the family track, `opportunity_customer_members` for the child track. */
    entityType?: string;
    onChange: (draft: StageOperatingPlanEditorDraft) => void;
    /** When set, only outcomes available on this Work Template are shown/edited. */
    workTemplateKey?: string;
};

export default function LifecycleStageOutcomeDefinitionsEditor({
    draft,
    transitionOptions,
    stageLabel,
    stageKey,
    processStages,
    configuredStatuses,
    entityType,
    onChange,
    workTemplateKey,
}: Props) {
    /**
     * Which outcomes have their mechanics open. Empty by default: the stage editor's job on
     * arrival is to say what this stage does, and five simultaneously-expanded outcome editors
     * said it in configuration controls instead. The generated summary carries the meaning; the
     * controls are one click away and unchanged when they appear.
     *
     * Disclosure is view state only — it is never read back into the draft, so expanding an
     * outcome cannot alter what gets saved.
     */
    const [expandedOutcomeKeys, setExpandedOutcomeKeys] = useState<ReadonlySet<string>>(new Set());
    const toggleOutcome = (outcomeKey: string) =>
        setExpandedOutcomeKeys((current) => {
            const next = new Set(current);
            if (next.has(outcomeKey)) next.delete(outcomeKey);
            else next.add(outcomeKey);
            return next;
        });

    const workIndex =
        workTemplateKey ? draft.work_templates.findIndex((work) => work.template_key === workTemplateKey) : -1;
    const work = workIndex >= 0 ? draft.work_templates[workIndex]! : null;
    const scopedRefs = work ? workTemplateOutcomeRefs(work) : draft.outcomes.map((outcome) => outcome.outcome_key);
    const scopedOutcomes = scopedRefs
        .map((ref) => draft.outcomes.find((outcome) => outcome.outcome_key === ref))
        .filter((outcome): outcome is NonNullable<typeof outcome> => Boolean(outcome));

    /** This stage's own grain, from the draft that owns these outcomes. */
    const entityGrain: "family" | "child" | null =
        draft.journey_segment === "child" ? "child"
        : draft.journey_segment === "family" ? "family"
        : null;

    /**
     * Destinations an exit path from this stage may target. A stage cannot transition to itself,
     * which the operating contract already rejects (`transition_destination_self`).
     */
    const transitionDestinations = (processStages ?? [])
        .filter((stage) => stage.key !== stageKey)
        // Grain-compatible only. A family case and a child's enrollment move on separate tracks,
        // so offering the other track's stages invites a movement the runtime will refuse anyway.
        // CONVENIENCE, not authority: `assertStageMoveGrainCompatible` on the executor is what
        // actually prevents the write. A stage whose grain cannot be resolved, or whose sources
        // disagree, is withheld here rather than silently offered.
        .filter((stage) => {
            if (!entityGrain) return true;
            const resolution = resolveStageGrain({
                stageKey: stage.key,
                configuredMetadataGrain: (stage as { grain?: unknown }).grain,
            });
            return resolution.ok && resolution.grain === entityGrain;
        });
    const canAuthorTransition = Boolean(stageKey?.trim()) && transitionDestinations.length > 0;

    /**
     * The closed case statuses a terminal outcome may write. RESOLVED from the configured catalog,
     * never invented here — `opportunities.status_key` is owned by `status_definitions`, and an
     * outcome that closes a case selects from that domain rather than minting a status of its own.
     */
    const closedStatusOptions = resolveOutcomeStatusOptions({
        configuredStatuses: configuredStatuses ?? [],
        purpose: "close_record",
        entityType: entityType ?? "opportunities",
    }).options;

    /**
     * Author an exit path from inside the outcome that needs one, and point that outcome at it.
     *
     * Choosing "Move through transition" with no configured path used to be a dead end: the
     * control was disabled, and the only text nearby told the operator to go and create the very
     * thing the disabled control needed. This introduces no new transition semantics — it writes
     * the same canonical `outgoing_transitions` entry the "Ways out of this stage" panel writes,
     * from where the requirement is actually discovered. Find-or-create lives in the model module.
     *
     * ONE `onChange`, deliberately. Creating the path and pointing the outcome at it are a single
     * draft edit. Doing them as two calls meant the second was computed from the `draft` captured
     * in this render — the one without the new path — so writing the outcome rule silently threw
     * the transition away and the operator's click appeared to do nothing.
     */
    const createTransitionForOutcome = (outcomeKey: string, targetStageKey: string): void => {
        const result = ensureOutgoingTransitionToStage(
            stageKey ?? "",
            draft.outgoing_transitions,
            targetStageKey,
            transitionDestinations.find((stage) => stage.key === targetStageKey)?.label,
        );
        if (!result.transition_ref) return;

        const behavior = readComposableOutcomeBehaviorDraft(outcomeKey, draft.outcome_rules);
        onChange({
            ...draft,
            outgoing_transitions: result.transitions,
            outcome_rules: upsertComposableOutcomeBehavior(draft.outcome_rules, outcomeKey, {
                ...behavior,
                movement: "move_through_transition",
                transition_ref: result.transition_ref,
            }),
        });
    };

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
                {/* Inside a work item the parent already renders the "Available Outcomes"
                    heading, so repeating it here announced one concept twice. The DESCRIPTION
                    stays either way — one heading, one description, which is what the section
                    needed. Standalone (no work template) it still owns its own heading. */}
                <div>
                    {workTemplateKey ? null : (
                        <h3 className="stage-section-label">Outcome Definitions</h3>
                    )}
                    <p className="stage-field__hint">
                        {workTemplateKey ?
                            "Define what operators can record for this work and what happens after."
                        :   "Define outcomes once. Work Templates select from these Available Outcomes."}
                    </p>
                </div>
                <button
                    type="button"
                    className="text-[0.6875rem] font-medium text-alloy-pine"
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
                    const completesWork = Boolean(outcome.completes_work ?? outcome.successful);
                    const expanded = expandedOutcomeKeys.has(outcome.outcome_key);
                    const summary = outcomeAutomationSummaryForOutcome(
                        outcome.outcome_key,
                        outcome.label,
                        draft.outcome_rules,
                        {
                            workTemplateLabelByKey: Object.fromEntries(
                                draft.work_templates.map((work) => [work.template_key, work.label]),
                            ),
                            transitionLabelByRef: Object.fromEntries(
                                transitionOptions.map((transition) => [
                                    transition.transition_ref,
                                    transition.label,
                                ]),
                            ),
                            completesWork,
                        },
                    );
                    return (
                        <article key={outcome.outcome_key} className="rounded-md border border-alloy-forge/10 p-2">
                            {/* Business meaning first: what this outcome does, in one sentence. */}
                            <button
                                type="button"
                                className="flex w-full items-start gap-2 text-left"
                                aria-expanded={expanded}
                                aria-controls={`outcome-mechanics-${outcome.outcome_key}`}
                                data-testid={`outcome-disclosure-${outcome.outcome_key}`}
                                onClick={() => toggleOutcome(outcome.outcome_key)}
                            >
                                <span
                                    aria-hidden="true"
                                    className={`mt-0.5 text-[0.625rem] text-alloy-midnight/40 transition-transform ${
                                        expanded ? "rotate-90" : ""
                                    }`}
                                >
                                    ▶
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-xs font-medium text-alloy-midnight">
                                        {outcome.label || "Untitled outcome"}
                                    </span>
                                    <span
                                        className="block text-[0.6875rem] leading-snug text-alloy-midnight/55"
                                        data-testid={`outcome-summary-${outcome.outcome_key}`}
                                    >
                                        {summary}
                                    </span>
                                </span>
                                <span className="shrink-0 text-[0.6875rem] font-medium text-alloy-pine">
                                    {expanded ? "Hide" : "Edit"}
                                </span>
                            </button>
                            <div
                                id={`outcome-mechanics-${outcome.outcome_key}`}
                                hidden={!expanded}
                                className="mt-2"
                            >
                            <div className="flex flex-wrap items-center gap-2">
                                <input
                                    className="min-w-0 flex-1 rounded-md border border-alloy-forge/15 px-2 py-1 text-xs"
                                    value={outcome.label}
                                    onChange={(event) => {
                                        const outcomes = [...draft.outcomes];
                                        outcomes[index] = { ...outcome, label: event.target.value };
                                        onChange({ ...draft, outcomes });
                                    }}
                                />
                                <label className="flex items-center gap-1 text-[0.6875rem]">
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
                                        className="text-[0.6875rem] text-alloy-midnight/70"
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
                                    className="text-[0.6875rem] text-red-700"
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
                                <p className="mt-1 text-[0.6875rem] text-alloy-midnight/45">
                                    Not used by a Work Template
                                </p>
                            :   null}
                            <LifecycleStageOutcomeBehaviorEditor
                                outcomeKey={outcome.outcome_key}
                                stageLabel={stageLabel ?? "this stage"}
                                rules={draft.outcome_rules}
                                workTemplates={draft.work_templates}
                                transitionOptions={transitionOptions}
                                transitionDestinations={
                                    canAuthorTransition ? transitionDestinations : undefined
                                }
                                closedStatusOptions={closedStatusOptions}
                                onCreateTransition={
                                    canAuthorTransition ?
                                        (targetStageKey: string) =>
                                            createTransitionForOutcome(outcome.outcome_key, targetStageKey)
                                    :   undefined
                                }
                                onRulesChange={(outcome_rules) => onChange({ ...draft, outcome_rules })}
                            />
                            </div>
                        </article>
                    );
                })}
                {!scopedOutcomes.length ?
                    <p className="text-[0.6875rem] text-alloy-midnight/45">
                        {workTemplateKey ? "No Available Outcomes defined for this work yet." : "No outcomes defined."}
                    </p>
                :   null}
            </div>
        </section>
    );
}
