"use client";

import type { StageOutgoingTransitionV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import type { OutcomeStatusConfiguredRow } from "@/lib/lifecycle/resolveOutcomeStatusOptions";
import { isConfiguredClosedStatus, resolveOutcomeStatusOptions } from "@/lib/lifecycle/resolveOutcomeStatusOptions";
import { newOutgoingTransitionDraft } from "@/lib/lifecycle/stageOperatingPlanEditorModel";

type Props = {
    stageKey: string;
    stageLabel?: string;
    transitions: StageOutgoingTransitionV1[];
    processStages: Array<{ key: string; label: string }>;
    configuredStatuses: ReadonlyArray<OutcomeStatusConfiguredRow>;
    entityType: string;
    onChange: (transitions: StageOutgoingTransitionV1[]) => void;
};

export default function LifecycleStageOutgoingTransitionsEditor({
    stageKey,
    stageLabel,
    transitions,
    processStages,
    configuredStatuses,
    entityType,
    onChange,
}: Props) {
    const destinations = processStages.filter((stage) => stage.key !== stageKey);
    const statuses = resolveOutcomeStatusOptions({
        configuredStatuses,
        purpose: "status_effect",
        entityType,
    }).options;

    return (
        <section className="rounded-lg border border-alloy-forge/10 bg-white p-3" data-testid="stage-outgoing-transitions-editor">
            <div className="mb-2 flex items-center justify-between">
                <div>
                    <h3 className="text-[11px] font-semibold text-alloy-midnight/75">Outgoing Transitions</h3>
                    <p className="text-[10px] text-alloy-midnight/50">
                        Define this stage&apos;s available paths and optional canonical resulting status.
                    </p>
                </div>
                <button
                    type="button"
                    className="text-[10px] font-medium text-alloy-pine"
                    data-testid="stage-transition-add"
                    onClick={() => {
                        const refs = new Set(transitions.map((transition) => transition.transition_ref));
                        let index = transitions.length;
                        while (refs.has(`${stageKey.trim() || "stage"}_transition_${index + 1}`)) index += 1;
                        onChange([
                            ...transitions,
                            newOutgoingTransitionDraft(stageKey, index, destinations[0]?.key),
                        ]);
                    }}
                >
                    + Add transition
                </button>
            </div>
            <div className="space-y-2">
                {transitions.map((transition, index) => {
                    const destinationLabel =
                        destinations.find((stage) => stage.key === transition.target_stage_key)?.label
                        ?? "Select destination";
                    return (
                    <div
                        key={`${transition.transition_ref}-${index}`}
                        className="grid gap-2 rounded border border-alloy-forge/10 p-2 md:grid-cols-5"
                        data-transition-ref={transition.transition_ref}
                        data-testid={`stage-transition-row-${index}`}
                    >
                        <p className="text-[10px] font-medium text-alloy-midnight/60 md:col-span-5">
                            {stageLabel?.trim() || stageKey} → {destinationLabel}
                        </p>
                        <label className="space-y-0.5 md:col-span-2">
                            <span className="block text-[9px] text-alloy-midnight/50">Label</span>
                            <input
                                className="w-full rounded border border-alloy-forge/15 px-2 py-1 text-xs"
                                data-testid={`stage-transition-label-${index}`}
                                value={transition.label}
                                onChange={(event) => {
                                    const next = [...transitions];
                                    next[index] = { ...transition, label: event.target.value };
                                    onChange(next);
                                }}
                            />
                        </label>
                        <label className="space-y-0.5">
                            <span className="block text-[9px] text-alloy-midnight/50">Destination</span>
                            <select
                                className="w-full rounded border border-alloy-forge/15 bg-white px-2 py-1 text-xs"
                                data-testid={`stage-transition-destination-${index}`}
                                value={transition.target_stage_key}
                                onChange={(event) => {
                                    const next = [...transitions];
                                    next[index] = { ...transition, target_stage_key: event.target.value };
                                    onChange(next);
                                }}
                            >
                                <option value="">Select stage…</option>
                                {destinations.map((stage) => <option key={stage.key} value={stage.key}>{stage.label}</option>)}
                            </select>
                        </label>
                        <label className="space-y-0.5">
                            <span className="block text-[9px] text-alloy-midnight/50">Resulting status</span>
                            <select
                                className="w-full rounded border border-alloy-forge/15 bg-white px-2 py-1 text-xs"
                                value={transition.status_key ?? ""}
                                onChange={(event) => {
                                    const status = statuses.find((row) => row.status_key === event.target.value);
                                    const next = [...transitions];
                                    next[index] = {
                                        ...transition,
                                        ...(status ? { status_key: status.status_key } : {}),
                                        ...(status && isConfiguredClosedStatus(status) ? { closes_record: true as const } : {}),
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
                                {statuses.map((status) => <option key={status.status_key} value={status.status_key}>{status.status_label}</option>)}
                            </select>
                            {transition.closes_record ? <span className="block text-[9px] text-alloy-midnight/50">Closes record</span> : null}
                        </label>
                        <div className="flex items-end justify-between gap-2">
                            <label className="flex items-center gap-1 text-[10px]">
                                <input
                                    type="checkbox"
                                    checked={transition.available}
                                    onChange={(event) => {
                                        const next = [...transitions];
                                        next[index] = { ...transition, available: event.target.checked };
                                        onChange(next);
                                    }}
                                />
                                Available
                            </label>
                            <button
                                type="button"
                                className="text-[10px] text-red-700"
                                data-testid={`stage-transition-remove-${index}`}
                                onClick={() => onChange(transitions.filter((_, row) => row !== index))}
                            >
                                Remove
                            </button>
                        </div>
                    </div>
                    );
                })}
                {!transitions.length ? <p className="text-[10px] text-alloy-midnight/45">No outgoing transitions configured.</p> : null}
            </div>
        </section>
    );
}
