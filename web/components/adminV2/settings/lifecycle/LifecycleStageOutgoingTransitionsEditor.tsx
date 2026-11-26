"use client";

/**
 * Stage exit paths.
 *
 * These used to render as a 5-column grid of three unrelated dropdowns per row — the operator
 * had to read `Label / Destination / Resulting status` and assemble the sentence themselves,
 * and nothing on the row said which outcomes actually used the path. Objective 5 of the premium
 * UX sprint: an exit should read as a path.
 *
 * PRESENTATION ONLY. The persisted shape is unchanged — the same `StageOutgoingTransitionV1[]`
 * in, the same array out, the same three fields written by the same handlers. The headline is
 * DERIVED from `summarizeStageOperatingPlan`, the module the Overview and the work items already
 * read, so an exit path cannot describe a trigger the configuration does not have.
 */

import { ArrowRight, Sparkles } from "lucide-react";

import type { StageOperatingPlanV1, StageOutgoingTransitionV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import type { OutcomeStatusConfiguredRow } from "@/lib/lifecycle/resolveOutcomeStatusOptions";
import { isConfiguredClosedStatus, resolveOutcomeStatusOptions } from "@/lib/lifecycle/resolveOutcomeStatusOptions";
import { nextOutgoingTransitionDraft } from "@/lib/lifecycle/stageOperatingPlanEditorModel";
import { summarizeStageOperatingPlan } from "@/lib/lifecycle/stageOperatingPlanSummary";
import {
    entityGrainFromJourneySegment,
    filterGrainCompatibleStageDestinations,
} from "@/lib/lifecycle/filterGrainCompatibleStageDestinations";

type Props = {
    stageKey: string;
    stageLabel?: string;
    transitions: StageOutgoingTransitionV1[];
    processStages: Array<{ key: string; label: string; grain?: string }>;
    configuredStatuses: ReadonlyArray<OutcomeStatusConfiguredRow>;
    entityType: string;
    /** Read-only, and only to name what triggers each path. Never written here. */
    plan?: StageOperatingPlanV1 | null;
    onChange: (transitions: StageOutgoingTransitionV1[]) => void;
};

export default function LifecycleStageOutgoingTransitionsEditor({
    stageKey,
    stageLabel,
    transitions,
    processStages,
    configuredStatuses,
    entityType,
    plan,
    onChange,
}: Props) {
    const entityGrain = entityGrainFromJourneySegment(plan?.journey_segment);
    const destinations = filterGrainCompatibleStageDestinations({
        processStages,
        stageKey,
        entityGrain,
    });
    const statuses = resolveOutcomeStatusOptions({
        configuredStatuses,
        purpose: "status_effect",
        entityType,
    }).options;

    // What triggers each path, in the same words the Overview uses.
    const triggersByRef = new Map<string, string[]>();
    if (plan) {
        for (const path of summarizeStageOperatingPlan(plan).exitPaths) {
            triggersByRef.set(path.transitionRef, path.usedByOutcomes);
        }
    }

    return (
        <section className="stage-panel" data-testid="stage-outgoing-transitions-editor">
            <div className="stage-panel__header">
                <div className="flex items-center gap-2">
                    <h3 className="stage-section-label">Ways out of this stage</h3>
                    <span className="stage-count">{transitions.length}</span>
                </div>
                <button
                    type="button"
                    className="text-[0.6875rem] font-semibold text-alloy-pine transition-opacity hover:opacity-70"
                    data-testid="stage-transition-add"
                    onClick={() =>
                        onChange([
                            ...transitions,
                            nextOutgoingTransitionDraft(stageKey, transitions, destinations[0]?.key),
                        ])
                    }
                >
                    + Add path
                </button>
            </div>

            <div className="stage-panel__body">
                {transitions.map((transition, index) => {
                    const destinationLabel =
                        processStages.find((stage) => stage.key === transition.target_stage_key)?.label
                        ?? destinations.find((stage) => stage.key === transition.target_stage_key)?.label
                        ?? "no destination yet";
                    const selectDestinations = (() => {
                        const current = processStages.find(
                            (stage) => stage.key === transition.target_stage_key,
                        );
                        if (
                            current
                            && current.key !== stageKey
                            && !destinations.some((stage) => stage.key === current.key)
                        ) {
                            // Preserve a previously saved incompatible destination so the
                            // operator can see and replace it — do not offer other incompatible stages.
                            return [...destinations, current];
                        }
                        return destinations;
                    })();
                    const triggers = triggersByRef.get(transition.transition_ref) ?? [];
                    const automatic = triggers.some((t) => t.includes("(automatic)"));

                    return (
                        <div
                            key={`${transition.transition_ref}-${index}`}
                            className="stage-exit"
                            data-transition-ref={transition.transition_ref}
                            data-testid={`stage-transition-row-${index}`}
                        >
                            {/* The path, as a sentence, before any control is read. */}
                            <div className="stage-exit__headline">
                                <span className="stage-exit__name">
                                    {transition.label?.trim() || "Untitled path"}
                                </span>
                                <ArrowRight size={12} className="stage-exit__arrow" aria-hidden />
                                <span className="stage-exit__name">{destinationLabel}</span>
                                {transition.closes_record ? (
                                    <span className="stage-tag">Closes the record</span>
                                ) : null}
                                {!transition.available ? <span className="stage-tag">Unavailable</span> : null}
                                {automatic ? (
                                    <span className="stage-tag stage-tag--accent">
                                        <Sparkles size={9} aria-hidden />
                                        Automatic
                                    </span>
                                ) : null}
                                <span
                                    className="stage-exit__trigger"
                                    data-testid={`stage-transition-trigger-${index}`}
                                >
                                    {triggers.length ? (
                                        <>
                                            Triggered by <strong>{triggers.join(", ")}</strong>
                                        </>
                                    ) : (
                                        "Not triggered by any outcome yet"
                                    )}
                                </span>
                            </div>

                            <div className="stage-exit__body">
                                <div className="stage-grid stage-grid--4">
                                    <label className="stage-field stage-field--wide">
                                        <span className="stage-field__label">What operators call it</span>
                                        <input
                                            className="stage-control"
                                            data-testid={`stage-transition-label-${index}`}
                                            value={transition.label}
                                            onChange={(event) => {
                                                const next = [...transitions];
                                                next[index] = { ...transition, label: event.target.value };
                                                onChange(next);
                                            }}
                                        />
                                    </label>
                                    <label className="stage-field">
                                        <span className="stage-field__label">Moves to</span>
                                        <select
                                            className="stage-control"
                                            data-testid={`stage-transition-destination-${index}`}
                                            value={transition.target_stage_key}
                                            onChange={(event) => {
                                                const next = [...transitions];
                                                next[index] = {
                                                    ...transition,
                                                    target_stage_key: event.target.value,
                                                };
                                                onChange(next);
                                            }}
                                        >
                                            <option value="">Select stage…</option>
                                            {selectDestinations.map((stage) => (
                                                <option key={stage.key} value={stage.key}>
                                                    {stage.label}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                    <label className="stage-field">
                                        <span className="stage-field__label">Record status</span>
                                        <select
                                            className="stage-control"
                                            value={transition.status_key ?? ""}
                                            onChange={(event) => {
                                                const status = statuses.find(
                                                    (row) => row.status_key === event.target.value,
                                                );
                                                const next = [...transitions];
                                                next[index] = {
                                                    ...transition,
                                                    ...(status ? { status_key: status.status_key } : {}),
                                                    ...(status && isConfiguredClosedStatus(status)
                                                        ? { closes_record: true as const }
                                                        : {}),
                                                };
                                                if (!status) {
                                                    delete next[index]!.status_key;
                                                    delete next[index]!.closes_record;
                                                } else if (!isConfiguredClosedStatus(status)) {
                                                    delete next[index]!.closes_record;
                                                }
                                                onChange(next);
                                            }}
                                        >
                                            <option value="">No status change</option>
                                            {statuses.map((status) => (
                                                <option key={status.status_key} value={status.status_key}>
                                                    {status.status_label}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                </div>

                                <div className="mt-2.5 flex items-center justify-between gap-3 border-t border-alloy-forge/8 pt-2">
                                    <label className="flex cursor-pointer items-center gap-1.5 text-[0.75rem] text-alloy-midnight/70">
                                        <input
                                            type="checkbox"
                                            checked={transition.available}
                                            onChange={(event) => {
                                                const next = [...transitions];
                                                next[index] = {
                                                    ...transition,
                                                    available: event.target.checked,
                                                };
                                                onChange(next);
                                            }}
                                        />
                                        Operators can use this path
                                    </label>
                                    <button
                                        type="button"
                                        className="text-[0.6875rem] font-medium text-red-700/80 transition-opacity hover:opacity-70"
                                        data-testid={`stage-transition-remove-${index}`}
                                        onClick={() => onChange(transitions.filter((_, row) => row !== index))}
                                    >
                                        Remove
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })}

                {!transitions.length ? (
                    <p className="stage-field__hint">
                        No ways out yet. Families that enter {stageLabel?.trim() || stageKey} cannot leave it until
                        a path is added.
                    </p>
                ) : null}
            </div>
        </section>
    );
}
