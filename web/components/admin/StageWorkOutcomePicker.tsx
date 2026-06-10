"use client";

import type { StageCompletionOutcomeV1 } from "@/lib/lifecycle/stageOperatingPlanV1";

export type StageWorkOutcomePickerProps = {
    workTitle: string;
    outcomes: StageCompletionOutcomeV1[];
    busy?: boolean;
    onSelect: (outcomeKey: string) => void;
    onCancel: () => void;
};

export default function StageWorkOutcomePicker({
    workTitle,
    outcomes,
    busy = false,
    onSelect,
    onCancel,
}: StageWorkOutcomePickerProps) {
    return (
        <div className="space-y-2" data-testid="stage-work-outcome-picker">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                Task complete
            </p>
            <p className="text-[13px] font-semibold text-alloy-midnight/90">{workTitle}</p>
            <p className="text-[11px] text-alloy-midnight/55">What happened?</p>
            <ul className="flex flex-col gap-1.5">
                {outcomes.map((outcome) => (
                    <li key={outcome.outcome_key}>
                        <button
                            type="button"
                            disabled={busy}
                            className="w-full rounded-lg border border-alloy-stone/20 bg-white px-3 py-2 text-left text-[12px] font-medium text-alloy-midnight/85 shadow-sm hover:border-alloy-pine/30 hover:bg-alloy-pine/[0.04] disabled:opacity-50"
                            data-testid={`stage-work-outcome-${outcome.outcome_key}`}
                            onClick={() => onSelect(outcome.outcome_key)}
                        >
                            {outcome.label}
                        </button>
                    </li>
                ))}
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
