"use client";

import { useCallback, useState } from "react";
import StageWorkOutcomeConfirm from "@/components/workIntent/StageWorkOutcomeConfirm";
import StageWorkOutcomePicker from "@/components/admin/StageWorkOutcomePicker";
import { formatTaskDueDate } from "@/lib/presentation/presentationDateFormat";
import type { StageWorkItemProjection, StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import { workIntentProjectionForStageWorkItem } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import { stageWorkOutcomeEffectLines } from "@/lib/workIntent/stageWorkOutcomeEffectLines";
import { useWorkIntentOutcomeCompletion } from "@/components/workIntent/useWorkIntentOutcomeCompletion";

type OverlayStep = "overview" | "outcomes" | "confirm";

const STATE_LABEL: Record<string, string> = {
    open: "Open",
    planned: "Planned",
    completed: "Completed",
    none: "Planned",
};

const DUE_LABEL: Record<string, string> = {
    overdue: "Overdue",
    due_today: "Due today",
    upcoming: "Upcoming",
    none: "",
};

function DueLine({ item }: { item: StageWorkItemProjection }) {
    if (item.state !== "open") return null;
    const dueLabel = DUE_LABEL[item.due_urgency];
    if (dueLabel) return <span>{dueLabel}</span>;
    if (item.due_at) {
        const formatted = formatTaskDueDate(item.due_at);
        return <span>Due {formatted || item.due_at}</span>;
    }
    return null;
}

function AdditionalWorkList({ items }: { items: StageWorkItemProjection[] }) {
    if (items.length === 0) return null;
    return (
        <div className="mt-4 border-t border-alloy-stone/10 pt-3" data-testid="current-work-additional-work">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                Additional work
            </p>
            <ul className="mt-2 space-y-2">
                {items.map((item) => (
                    <li
                        key={item.template_key}
                        className="flex items-start gap-2.5 rounded-lg border border-alloy-stone/12 bg-alloy-stone/[0.03] px-2.5 py-2"
                        data-stage-work-additional-item={item.template_key}
                    >
                        <span
                            className="mt-1.5 h-2 w-2 shrink-0 rounded-full border-2 border-alloy-pine/45"
                            aria-hidden
                        />
                        <div className="min-w-0">
                            <p className="text-[12px] font-semibold text-alloy-midnight">{item.label}</p>
                            <p className="text-[10px] text-alloy-midnight/50">
                                {STATE_LABEL[item.state] ?? item.state}
                                {item.state === "open" && DUE_LABEL[item.due_urgency] ?
                                    ` · ${DUE_LABEL[item.due_urgency]}`
                                :   null}
                            </p>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}

type Props = {
    opportunityId: string;
    runtime: StageWorkRuntimeProjection;
    canMutate?: boolean;
};

/** Current Work action center — overview, outcome picker, and confirmation. */
export default function CurrentWorkActionOverlay({
    opportunityId,
    runtime,
    canMutate = true,
}: Props) {
    const primary = runtime.primary;
    const additional = runtime.additional.filter((item): item is StageWorkItemProjection => item != null);
    const [step, setStep] = useState<OverlayStep>("overview");
    const [pendingOutcomeKey, setPendingOutcomeKey] = useState<string | null>(null);
    const { completeOutcome, busy, error, clearError } = useWorkIntentOutcomeCompletion(opportunityId);

    const showOutcomeAction =
        primary != null
        && primary.state === "open"
        && primary.requires_outcome_picker
        && primary.outcomes.length > 0
        && canMutate;

    const pendingOutcome = primary?.outcomes.find((row) => row.outcome_key === pendingOutcomeKey) ?? null;

    const resetFlow = useCallback(() => {
        setStep("overview");
        setPendingOutcomeKey(null);
        clearError();
    }, [clearError]);

    const handleConfirm = useCallback(() => {
        if (!primary || !pendingOutcomeKey) return;
        const projection = workIntentProjectionForStageWorkItem(runtime, primary);
        void completeOutcome(projection, pendingOutcomeKey).then(() => {
            resetFlow();
        });
    }, [completeOutcome, pendingOutcomeKey, primary, resetFlow, runtime]);

    if (!primary) {
        return (
            <p className="text-[12px] text-alloy-midnight/55" data-testid="current-work-action-overlay-empty">
                No current work configured for this stage.
            </p>
        );
    }

    if (step === "outcomes" && showOutcomeAction) {
        return (
            <div data-testid="current-work-action-overlay-outcomes">
                <button
                    type="button"
                    className="mb-3 text-[11px] font-medium text-alloy-midnight/55 hover:text-alloy-midnight/75"
                    onClick={resetFlow}
                >
                    ← Back
                </button>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-juniper/80">
                    Current work
                </p>
                <p className="mt-1 text-[15px] font-semibold text-alloy-midnight">{primary.label}</p>
                <div className="mt-3">
                    <StageWorkOutcomePicker
                        outcomes={primary.outcomes}
                        automationPreview={primary.outcome_automation_preview}
                        busy={busy}
                        variant="overlay"
                        onSelect={(outcomeKey) => {
                            clearError();
                            setPendingOutcomeKey(outcomeKey);
                            setStep("confirm");
                        }}
                        onCancel={resetFlow}
                    />
                </div>
                {error ?
                    <p className="mt-2 text-[12px] font-medium text-red-800/90" role="alert">
                        {error}
                    </p>
                :   null}
            </div>
        );
    }

    if (step === "confirm" && pendingOutcome && primary) {
        return (
            <div data-testid="current-work-action-overlay-confirm">
                <button
                    type="button"
                    className="mb-3 text-[11px] font-medium text-alloy-midnight/55 hover:text-alloy-midnight/75"
                    onClick={() => {
                        setPendingOutcomeKey(null);
                        setStep("outcomes");
                    }}
                    disabled={busy}
                >
                    ← Back
                </button>
                <StageWorkOutcomeConfirm
                    outcomeLabel={pendingOutcome.label}
                    effectLines={stageWorkOutcomeEffectLines(primary, pendingOutcome.outcome_key)}
                    busy={busy}
                    onConfirm={handleConfirm}
                    onCancel={() => {
                        setPendingOutcomeKey(null);
                        setStep("outcomes");
                    }}
                />
                {error ?
                    <p className="mt-2 text-[12px] font-medium text-red-800/90" role="alert">
                        {error}
                    </p>
                :   null}
            </div>
        );
    }

    const description = primary.description?.trim() || runtime.purpose?.trim() || null;

    return (
        <div data-testid="current-work-action-overlay-overview">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-juniper/80">Current work</p>
            <h3 className="mt-1 text-[15px] font-semibold text-alloy-midnight">{primary.label}</h3>
            <p className="mt-1 text-[11px] text-alloy-midnight/55">
                Status: {STATE_LABEL[primary.state] ?? primary.state}
                {primary.state === "open" ?
                    <>
                        {" · "}
                        <DueLine item={primary} />
                    </>
                :   null}
            </p>
            {description ?
                <div className="mt-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                        Description
                    </p>
                    <p className="mt-1 text-[12px] leading-relaxed text-alloy-midnight/70">{description}</p>
                </div>
            :   null}
            {showOutcomeAction ?
                <div className="mt-4 border-t border-alloy-stone/10 pt-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">
                        Actions
                    </p>
                    <button
                        type="button"
                        className="mt-2 w-full rounded-lg border border-alloy-pine/25 bg-alloy-pine/[0.06] px-3 py-2 text-left text-[12px] font-semibold text-alloy-pine hover:border-alloy-pine/35 hover:bg-alloy-pine/[0.1]"
                        data-testid="current-work-record-outcome"
                        onClick={() => {
                            clearError();
                            setStep("outcomes");
                        }}
                    >
                        Record outcome
                    </button>
                </div>
            :   null}
            <AdditionalWorkList items={additional} />
            {error ?
                <p className="mt-2 text-[12px] font-medium text-red-800/90" role="alert">
                    {error}
                </p>
            :   null}
        </div>
    );
}
