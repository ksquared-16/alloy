"use client";

import type { StageCompletionOutcomeV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import type { StageWorkOutcomeAutomationPreview } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import { stageWorkOutcomeEffectSummary } from "@/lib/workIntent/stageWorkOutcomeEffectLines";

export type StageWorkOutcomePickerProps = {
    workTitle?: string;
    outcomes: StageCompletionOutcomeV1[];
    automationPreview?: StageWorkOutcomeAutomationPreview[];
    busy?: boolean;
    variant?: "default" | "overlay";
    onSelect: (outcomeKey: string) => void;
    onCancel: () => void;
};

export default function StageWorkOutcomePicker({
    workTitle,
    outcomes,
    automationPreview = [],
    busy = false,
    variant = "default",
    onSelect,
    onCancel,
}: StageWorkOutcomePickerProps) {
    const overlay = variant === "overlay";

    return (
        <div className="space-y-2" data-testid="stage-work-outcome-picker">
            {overlay ?
                <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                    Available outcomes
                </p>
            :   <>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                        Task complete
                    </p>
                    {workTitle ?
                        <p className="text-[13px] font-semibold text-alloy-midnight/90">{workTitle}</p>
                    :   null}
                    <p className="text-[11px] text-alloy-midnight/55">What happened?</p>
                </>
            }
            <ul className="flex flex-col gap-1.5">
                {outcomes.map((outcome) => {
                    const effect = stageWorkOutcomeEffectSummary(automationPreview, outcome.outcome_key);
                    return (
                        <li key={outcome.outcome_key}>
                            <button
                                type="button"
                                disabled={busy}
                                className="w-full rounded-lg border border-alloy-stone/20 bg-white px-3 py-2.5 text-left shadow-sm hover:border-alloy-pine/30 hover:bg-alloy-pine/[0.04] disabled:opacity-50"
                                data-testid={`stage-work-outcome-${outcome.outcome_key}`}
                                onClick={() => onSelect(outcome.outcome_key)}
                            >
                                <span className="block text-[12px] font-semibold text-alloy-midnight/90">
                                    {outcome.label}
                                </span>
                                {effect ?
                                    <span className="mt-0.5 block text-[11px] text-alloy-midnight/55">{effect}</span>
                                :   null}
                            </button>
                        </li>
                    );
                })}
            </ul>
            <button
                type="button"
                className="text-[11px] font-medium text-alloy-midnight/45 hover:text-alloy-midnight/70"
                onClick={onCancel}
                disabled={busy}
            >
                Cancel
            </button>
        </div>
    );
}
