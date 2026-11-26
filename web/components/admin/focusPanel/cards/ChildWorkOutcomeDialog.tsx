"use client";

/**
 * RECORD ONE CHILD'S OUTCOME — from the family's Decision card, in Alloy's dialog.
 *
 * A pending offer is Decision work ("Get the family's answer"), but it is the CHILD's own work: the
 * outcome moves that child, never the family. This dialog names the child, lists the configured
 * outcomes (Family accepted, Declined — not enrolling, Declined — keep on waitlist, …) with what each
 * does, confirms, and reports the result.
 *
 * Generic underneath: the task's outcomes and its child subject are resolved server-side
 * (`stage-work-outcomes?task_id=`), and the choice is recorded by the canonical outcome runtime
 * (`complete-stage-work`). There is no Enrollment-specific mutation here.
 */
import { useCallback, useEffect, useState } from "react";

import AlloyDialog from "@/components/ui/AlloyDialog";
import {
    completeStageWorkWithSelectedOutcome,
    fetchStageWorkOutcomeResolution,
    type StageWorkOutcomeResolution,
} from "@/lib/lifecycle/stageWorkOutcomePickerClient";

type Props = {
    taskId: string;
    childLabel: string;
    workLabel: string;
    departmentId: string | null;
    onClose: () => void;
    /** After a recorded outcome — the caller refreshes the child rows and the queue. */
    onRecorded: (outcome: { key: string; label: string; movedStage: boolean }) => void;
};

type Phase = "loading" | "choose" | "saving" | "done" | "error";

export default function ChildWorkOutcomeDialog({ taskId, childLabel, workLabel, departmentId, onClose, onRecorded }: Props) {
    const [phase, setPhase] = useState<Phase>("loading");
    const [resolution, setResolution] = useState<StageWorkOutcomeResolution | null>(null);
    const [chosen, setChosen] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [recorded, setRecorded] = useState<string | null>(null);

    useEffect(() => {
        let live = true;
        void fetchStageWorkOutcomeResolution({ taskId, departmentId })
            .then((r) => {
                if (!live) return;
                if (!r.requires_outcome_picker || !r.outcomes?.length) {
                    setError("This work has no outcomes to record.");
                    setPhase("error");
                    return;
                }
                setResolution(r);
                setPhase("choose");
            })
            .catch((e) => {
                if (!live) return;
                setError(e instanceof Error ? e.message : "The outcomes could not be loaded.");
                setPhase("error");
            });
        return () => {
            live = false;
        };
    }, [taskId, departmentId]);

    const outcomes = resolution?.outcomes ?? [];
    const chosenOutcome = outcomes.find((o) => o.outcome_key === chosen) ?? null;

    const confirm = useCallback(async () => {
        if (!resolution || !chosenOutcome || !resolution.department_id || !resolution.stage_key || !resolution.work_id || !resolution.subject) return;
        setPhase("saving");
        setError(null);
        try {
            const result = await completeStageWorkWithSelectedOutcome({
                departmentId: resolution.department_id,
                stageKey: resolution.stage_key,
                workId: resolution.work_id,
                outcomeKey: chosenOutcome.outcome_key,
                subject: resolution.subject,
            });
            if (!result.ok) throw new Error(result.error ?? "The outcome could not be recorded.");
            setRecorded(chosenOutcome.label);
            setPhase("done");
            onRecorded({ key: chosenOutcome.outcome_key, label: chosenOutcome.label, movedStage: Boolean(result.moved_stage) });
        } catch (e) {
            setError(e instanceof Error ? e.message : "The outcome could not be recorded.");
            setPhase("choose");
        }
    }, [chosenOutcome, onRecorded, resolution]);

    const footer =
        phase === "done" ? (
            <button type="button" onClick={onClose} className="rounded-lg bg-alloy-bend-pine px-4 py-2 text-[12px] font-semibold text-white" data-child-outcome="done">
                Done
            </button>
        ) : (
            <>
                <button type="button" onClick={onClose} disabled={phase === "saving"} className="rounded-lg border border-alloy-stone/20 bg-white px-4 py-2 text-[12px] font-semibold text-alloy-midnight/70">
                    Cancel
                </button>
                <button
                    type="button"
                    onClick={() => void confirm()}
                    disabled={!chosenOutcome || phase !== "choose"}
                    className="rounded-lg bg-alloy-bend-pine px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
                    data-child-outcome="confirm"
                >
                    {phase === "saving" ? "Recording…" : chosenOutcome ? `Record “${chosenOutcome.label}”` : "Record outcome"}
                </button>
            </>
        );

    return (
        <AlloyDialog open onClose={onClose} title="Record outcome" subtitle={`${childLabel} · ${workLabel}`} footer={footer} testId="child-work-outcome">
            {phase === "loading" ? <p className="text-[12.5px] text-alloy-midnight/55">Loading the outcomes…</p> : null}
            {phase === "done" ? (
                <div className="space-y-1" role="status" data-child-outcome="recorded">
                    <p className="text-[13px] font-semibold text-alloy-bend-pine">Recorded: {recorded}</p>
                    <p className="text-[12px] text-alloy-midnight/60">{childLabel}&apos;s path has been updated. The family&apos;s other children are unchanged.</p>
                </div>
            ) : null}
            {phase === "choose" || phase === "saving" ? (
                <div role="radiogroup" aria-label={`Outcome for ${childLabel}`} className="space-y-1.5">
                    <p className="mb-1 text-[12px] font-medium text-alloy-midnight/70">What did the family say?</p>
                    {outcomes.map((o) => {
                        const selected = chosen === o.outcome_key;
                        return (
                            <button
                                key={o.outcome_key}
                                type="button"
                                role="radio"
                                aria-checked={selected}
                                disabled={phase === "saving"}
                                onClick={() => setChosen(o.outcome_key)}
                                data-child-outcome-option={o.outcome_key}
                                className={`w-full rounded-lg border px-3 py-2 text-left text-[12.5px] ${selected ? "border-alloy-bend-pine bg-alloy-bend-pine/[0.06] font-semibold text-alloy-midnight" : "border-alloy-stone/20 bg-white text-alloy-midnight/80 hover:border-alloy-bend-pine/40"}`}
                            >
                                {o.label}
                            </button>
                        );
                    })}
                </div>
            ) : null}
            {error ? (
                <p className="mt-2 text-[12px] text-rose-700" role="alert">
                    {error}
                </p>
            ) : null}
        </AlloyDialog>
    );
}
