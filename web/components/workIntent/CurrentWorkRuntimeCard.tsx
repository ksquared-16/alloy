"use client";

import StageWorkOutcomePicker from "@/components/admin/StageWorkOutcomePicker";
import { oppInqEyebrow } from "@/components/admin/drawer/opportunityInquiryDrawerTypography";
import { formatTaskDueDate } from "@/lib/presentation/presentationDateFormat";
import type {
    StageWorkItemProjection,
    StageWorkRuntimeProjection,
} from "@/lib/lifecycle/stageWorkRuntimeTypes";
import { workIntentProjectionForStageWorkItem } from "@/lib/lifecycle/stageWorkRuntimeTypes";
import type { WorkIntentRuntimeProjection } from "@/lib/lifecycle/workIntentRuntimeTypes";
import { useWorkIntentOutcomeCompletion } from "@/components/workIntent/useWorkIntentOutcomeCompletion";

const DUE_LABEL: Record<WorkIntentRuntimeProjection["due_urgency"], string> = {
    overdue: "Overdue",
    due_today: "Due today",
    upcoming: "Upcoming",
    none: "",
};

const STATE_LABEL: Record<string, string> = {
    open: "Open",
    planned: "Planned",
    completed: "Completed",
    none: "Planned",
};

type Props = {
    opportunityId: string;
    runtime: StageWorkRuntimeProjection;
    canMutate?: boolean;
    /** Summary-strip chromeless body — hides outer card border. */
    chromeless?: boolean;
};

function DueBadge({ urgency }: { urgency: WorkIntentRuntimeProjection["due_urgency"] }) {
    const dueLabel = DUE_LABEL[urgency];
    if (!dueLabel) return null;
    return (
        <span
            className={
                urgency === "overdue"
                    ? "shrink-0 rounded-full border border-red-200/80 bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-900"
                    : urgency === "due_today"
                      ? "shrink-0 rounded-full border border-amber-200/80 bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-950"
                      : "shrink-0 rounded-full border border-sky-200/80 bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-900"
            }
        >
            {dueLabel}
        </span>
    );
}

function WorkItemBlock({
    item,
    runtime,
    opportunityId,
    canMutate,
    isPrimary,
}: {
    item: StageWorkItemProjection;
    runtime: StageWorkRuntimeProjection;
    opportunityId: string;
    canMutate: boolean;
    isPrimary: boolean;
}) {
    const { completeOutcome, busy, error, clearError } = useWorkIntentOutcomeCompletion(opportunityId);
    const projection = workIntentProjectionForStageWorkItem(runtime, item);
    const stateLabel = STATE_LABEL[item.state] ?? item.state;
    const showDue = item.state === "open" && DUE_LABEL[item.due_urgency];
    const showAttempts = item.attempt_count > 0;
    const showLastOutcome = item.last_outcome?.label;
    const showOutcomePicker =
        item.state === "open" &&
        item.requires_outcome_picker &&
        item.outcomes.length > 0 &&
        canMutate;

    return (
        <div
            className={isPrimary ? "" : "border-t border-alloy-stone/10 pt-3"}
            data-stage-work-item={item.template_key}
            data-stage-work-state={item.state}
        >
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    {!isPrimary ?
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                            {item.role === "secondary" ? "Additional work" : "Work"}
                        </p>
                    :   null}
                    <h4
                        className={`font-semibold text-alloy-midnight ${isPrimary ? "text-[15px]" : "mt-0.5 text-[13px]"}`}
                    >
                        {item.label}
                    </h4>
                    <p className="mt-0.5 text-[11px] text-alloy-midnight/50">Status: {stateLabel}</p>
                </div>
                {showDue ? <DueBadge urgency={item.due_urgency} /> : null}
            </div>

            {item.state === "open" && (showAttempts || showLastOutcome || item.completion_policy_summary) ?
                <p className="mt-2 text-[12px] text-alloy-midnight/60">
                    {showAttempts ? `Attempt ${item.attempt_count}` : null}
                    {showAttempts && item.completion_policy_max_attempts ?
                        ` of ${item.completion_policy_max_attempts}`
                    :   null}
                    {showAttempts && (showLastOutcome || item.completion_policy_summary) ? " · " : null}
                    {showLastOutcome ? `Last: ${item.last_outcome!.label}` : null}
                    {!showLastOutcome && item.completion_policy_summary ? item.completion_policy_summary : null}
                </p>
            :   null}

            {item.state === "open" && item.due_at ?
                <p className="mt-1 text-[11px] text-alloy-midnight/45">
                    Due {formatTaskDueDate(item.due_at) || item.due_at}
                </p>
            :   null}

            {item.outcome_automation_preview.length > 0 ?
                <div className="mt-2 space-y-0.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                        Automation
                    </p>
                    {item.outcome_automation_preview.map((line) => (
                        <p
                            key={`${line.outcome_key}:${line.effect_label}`}
                            className="text-[11px] text-alloy-midnight/55"
                        >
                            {line.outcome_label} → {line.effect_label}
                        </p>
                    ))}
                </div>
            :   null}

            {error ?
                <p className="mt-2 text-[12px] font-medium text-red-800/90" role="alert">
                    {error}
                </p>
            :   null}

            {showOutcomePicker ?
                <div className="mt-3 border-t border-alloy-stone/10 pt-3">
                    <StageWorkOutcomePicker
                        workTitle={item.label}
                        outcomes={item.outcomes}
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

/** Business-process Current Work — primary + additional stage work items. */
export default function CurrentWorkRuntimeCard({
    opportunityId,
    runtime,
    canMutate = true,
    chromeless = false,
}: Props) {
    const primary = runtime.primary;
    const allItems = [primary, ...runtime.additional].filter(
        (item): item is StageWorkItemProjection => item != null,
    );

    const body =
        allItems.length === 0 ?
            <p className="text-[12px] text-alloy-midnight/55">No current work configured for this stage.</p>
        :   <div className="space-y-3">
                {allItems.map((item, index) => (
                    <WorkItemBlock
                        key={item.template_key}
                        item={item}
                        runtime={runtime}
                        opportunityId={opportunityId}
                        canMutate={canMutate}
                        isPrimary={index === 0}
                    />
                ))}
            </div>;

    if (chromeless) {
        return (
            <div data-current-work-runtime-card="true" data-current-work-runtime-chromeless="true">
                {body}
            </div>
        );
    }

    return (
        <div
            className="rounded-xl border border-alloy-stone/15 bg-white px-4 py-3 shadow-[0_1px_4px_rgba(24,39,58,0.05)]"
            data-current-work-runtime-card="true"
        >
            <div className={oppInqEyebrow}>Current Work</div>
            {runtime.purpose ?
                <p className="mt-0.5 text-[11px] text-alloy-midnight/45">{runtime.purpose}</p>
            :   null}
            <div className="mt-2">{body}</div>
        </div>
    );
}
