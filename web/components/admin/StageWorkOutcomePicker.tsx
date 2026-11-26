"use client";

import { useState } from "react";
import clsx from "clsx";

import type { StageCompletionOutcomeV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import type { StageWorkOutcomeAutomationPreview } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import { formatStageWorkOutcomeEffectForPicker } from "@/lib/workIntent/stageWorkOutcomeEffectLines";

export type StageWorkOutcomePickerProps = {
    workTitle?: string;
    outcomes: StageCompletionOutcomeV1[];
    automationPreview?: StageWorkOutcomeAutomationPreview[];
    busy?: boolean;
    variant?: "default" | "overlay" | "focus";
    onSelect: (outcomeKey: string) => void;
    onCancel: () => void;
};

/**
 * Stage work outcome picker — config-driven outcomes only.
 * Visual language matches Focus Panel operational tiles (Bend Pine accents).
 */
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
    const compact = variant === "focus";
    const [selectedKey, setSelectedKey] = useState<string | null>(null);

    if (outcomes.length === 0) {
        return (
            <div
                className="alloy-os-outcome-picker"
                data-testid="stage-work-outcome-picker"
                data-outcome-empty="true"
            >
                <p className="alloy-os-outcome-picker__eyebrow">Completion</p>
                {workTitle ?
                    <p className="alloy-os-outcome-picker__title">{workTitle}</p>
                :   null}
                <p className="alloy-os-outcome-picker__empty" role="status">
                    No completion outcomes configured
                </p>
                <button
                    type="button"
                    className="alloy-os-ucard__action alloy-os-ucard__action--system5"
                    onClick={onCancel}
                    disabled={busy}
                >
                    ← Back
                </button>
            </div>
        );
    }

    return (
        <div
            className={clsx("alloy-os-outcome-picker", compact && "alloy-os-outcome-picker--focus")}
            data-testid="stage-work-outcome-picker"
            data-outcome-variant={compact ? "focus" : undefined}
        >
            {overlay ?
                <p className="alloy-os-outcome-picker__eyebrow">Available outcomes</p>
            :   <>
                    <p className="alloy-os-outcome-picker__eyebrow">What happened?</p>
                    {workTitle ?
                        <p className="alloy-os-outcome-picker__title">{workTitle}</p>
                    :   null}
                    <p className="alloy-os-outcome-picker__hint">
                        Choose the configured result for this work
                    </p>
                </>
            }
            <ul className="alloy-os-outcome-picker__list">
                {outcomes.map((outcome) => {
                    const effect = formatStageWorkOutcomeEffectForPicker({
                        previews: automationPreview,
                        outcomeKey: outcome.outcome_key,
                        outcomes,
                        workTitle,
                    });
                    const selected = selectedKey === outcome.outcome_key;
                    return (
                        <li key={outcome.outcome_key}>
                            <button
                                type="button"
                                disabled={busy}
                                className={clsx(
                                    "alloy-os-outcome-picker__tile",
                                    selected && "alloy-os-outcome-picker__tile--selected",
                                )}
                                data-testid={`stage-work-outcome-${outcome.outcome_key}`}
                                data-outcome-selected={selected ? "true" : undefined}
                                onClick={() => {
                                    setSelectedKey(outcome.outcome_key);
                                    onSelect(outcome.outcome_key);
                                }}
                            >
                                <span className="alloy-os-outcome-picker__tile-label">
                                    {outcome.label}
                                </span>
                                <span className="alloy-os-outcome-picker__tile-effect">{effect}</span>
                            </button>
                        </li>
                    );
                })}
            </ul>
            <button
                type="button"
                className="alloy-os-ucard__action alloy-os-ucard__action--system5"
                onClick={onCancel}
                disabled={busy}
                data-work-action="back"
            >
                ← Back
            </button>
        </div>
    );
}
