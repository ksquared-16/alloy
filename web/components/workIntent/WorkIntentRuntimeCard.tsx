"use client";

import StageWorkOutcomePicker from "@/components/admin/StageWorkOutcomePicker";
import { oppInqEyebrow } from "@/components/admin/drawer/opportunityInquiryDrawerTypography";
import { formatTaskDueDate } from "@/lib/presentation/presentationDateFormat";
import type { WorkIntentRuntimeProjection } from "@/lib/lifecycle/workIntentRuntimeTypes";
import { useWorkIntentOutcomeCompletion } from "@/components/workIntent/useWorkIntentOutcomeCompletion";

const DUE_LABEL: Record<WorkIntentRuntimeProjection["due_urgency"], string> = {
    overdue: "Overdue",
    due_today: "Due today",
    upcoming: "Upcoming",
    none: "",
};

type Props = {
    opportunityId: string;
    projection: WorkIntentRuntimeProjection;
    canMutate?: boolean;
};

export default function WorkIntentRuntimeCard({ opportunityId, projection, canMutate = true }: Props) {
    const { completeOutcome, busy, error, clearError } = useWorkIntentOutcomeCompletion(opportunityId);

    const dueLabel = DUE_LABEL[projection.due_urgency];
    const showDue = projection.state === "open" && dueLabel;
    const showAttempts = projection.attempt_count > 0;
    const showLastOutcome = projection.last_outcome?.label;

    return (
        <div
            className="rounded-xl border border-alloy-stone/15 bg-white px-4 py-3 shadow-[0_1px_4px_rgba(24,39,58,0.05)]"
            data-work-intent-runtime-card="true"
            data-work-intent-runtime-state={projection.state}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className={oppInqEyebrow}>Work</div>
                    <h3 className="mt-0.5 text-[15px] font-semibold text-alloy-midnight">{projection.label}</h3>
                </div>
                {showDue ?
                    <span
                        className={
                            projection.due_urgency === "overdue"
                                ? "shrink-0 rounded-full border border-red-200/80 bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-900"
                                : projection.due_urgency === "due_today"
                                  ? "shrink-0 rounded-full border border-amber-200/80 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-950"
                                  : "shrink-0 rounded-full border border-sky-200/80 bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-900"
                        }
                    >
                        {dueLabel}
                    </span>
                :   null}
            </div>

            {projection.state === "completed" ?
                <p className="mt-2 text-[12px] text-alloy-midnight/65">
                    Completed
                    {projection.completed_at ?
                        ` ${formatTaskDueDate(projection.completed_at) || projection.completed_at}`
                    :   ""}
                </p>
            :   null}

            {projection.state === "none" ?
                <p className="mt-2 text-[12px] text-alloy-midnight/55">No open work for this stage.</p>
            :   null}

            {projection.state === "open" && (showAttempts || showLastOutcome || projection.completion_policy_summary) ?
                <p className="mt-2 text-[12px] text-alloy-midnight/60">
                    {showAttempts ? `Attempt ${projection.attempt_count}` : null}
                    {showAttempts && projection.completion_policy_max_attempts ?
                        ` of ${projection.completion_policy_max_attempts}`
                    :   null}
                    {showAttempts && (showLastOutcome || projection.completion_policy_summary) ? " · " : null}
                    {showLastOutcome ? `Last: ${projection.last_outcome!.label}` : null}
                    {!showLastOutcome && projection.completion_policy_summary ?
                        projection.completion_policy_summary
                    :   null}
                </p>
            :   null}

            {projection.state === "open" && projection.due_at ?
                <p className="mt-1 text-[11px] text-alloy-midnight/45">
                    Due {formatTaskDueDate(projection.due_at) || projection.due_at}
                </p>
            :   null}

            {error ?
                <p className="mt-2 text-[12px] font-medium text-red-800/90" role="alert">
                    {error}
                </p>
            :   null}

            {projection.state === "open" &&
            projection.execution.requires_outcome_picker &&
            projection.outcomes.length > 0 &&
            canMutate ?
                <div className="mt-3 border-t border-alloy-stone/10 pt-3">
                    <StageWorkOutcomePicker
                        workTitle={projection.label}
                        outcomes={projection.outcomes}
                        busy={busy}
                        onSelect={(outcomeKey) => {
                            clearError();
                            void completeOutcome(projection, outcomeKey);
                        }}
                        onCancel={() => undefined}
                    />
                </div>
            :   null}
        </div>
    );
}
