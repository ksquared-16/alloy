"use client";

/**
 * Work Item detail — operator execution surface.
 *
 * Reads top to bottom as: what is this → what state is it in → who is it about → why is it here →
 * what can I do. Runtime provenance (operating-plan keys, projection internals, stage-position
 * mechanics) is gone: it read as diagnostic output, and half of it could only ever say "not
 * projected yet". Activity stays available but quiet.
 *
 * Commands here NAVIGATE to the authoritative runtime; they never mutate. Business Process work is
 * completed in Current Work, a conversation in Communications, a case in Processing. Only manual
 * work is Work Items' to close, and even that runs through the existing task-card controls rather
 * than a second write path.
 */

import { Clock3, ListTodo } from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";

import type { MyTasksTaskRow } from "@/lib/agent/taskAssist/myTasksTaskTypes";
import { formatOperationalTaskDueDisplay } from "@/lib/agent/taskAssist/formatOperationalTaskSourceLabel";
import WorkItemActivityPanel from "@/components/workItems/WorkItemActivityPanel";
import { normalizeOperationalTaskTitleDisplay } from "@/lib/agent/taskAssist/normalizeOperationalTaskTitleDisplay";
import {
    buildWorkItemDetailModel,
    type WorkItemDetailState,
} from "@/lib/workItems/workItemDetailModel";
import type { WorkItemBpLabelOptions } from "@/lib/workItems/workItemBpProvenance";

export type WorkItemDetailPanelProps = {
    task: MyTasksTaskRow | null;
    taskCard: ReactNode | null;
    bpLabelOptions?: WorkItemBpLabelOptions;
    onOpenRecord?: () => void;
    onOpenCurrentWork?: () => void;
    onOpenProcessing?: () => void;
    onOpenCommunications?: () => void;
};

const STATE_CHIP: Record<WorkItemDetailState, { label: string; className: string }> = {
    completed: { label: "Completed", className: "bg-alloy-stone/[0.09] text-alloy-midnight/55" },
    overdue: { label: "Overdue", className: "bg-alloy-clay/[0.12] text-alloy-clay" },
    due_today: { label: "Due today", className: "bg-amber-500/[0.14] text-amber-700" },
    open: { label: "Open", className: "bg-alloy-juniper/[0.10] text-alloy-juniper" },
};

function EmptyDetailState() {
    return (
        <div
            className="flex h-full flex-col items-center justify-center px-6 py-10 text-center"
            data-work-items-detail-empty="true"
        >
            <ListTodo className="mb-2 h-9 w-9 text-alloy-midnight/20" aria-hidden strokeWidth={1.5} />
            <p className="text-[13px] font-medium text-alloy-midnight/70">Select a work item</p>
            <p className="mt-1 max-w-xs text-[11px] leading-snug text-alloy-midnight/45">
                Choose a work item from the queue to review its context and actions.
            </p>
        </div>
    );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
    return (
        <section className="space-y-1.5">
            <h3 className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                {label}
            </h3>
            {children}
        </section>
    );
}

const COMMAND_PRIMARY =
    "rounded-lg bg-alloy-juniper px-3 py-1.5 text-[11.5px] font-semibold text-white shadow-sm hover:bg-alloy-juniper/92";
const COMMAND_SECONDARY =
    "rounded-lg border border-alloy-stone/25 bg-white px-3 py-1.5 text-[11.5px] font-semibold text-alloy-midnight/72 hover:bg-alloy-stone/[0.05]";

export default function WorkItemDetailPanel({
    task,
    taskCard,
    bpLabelOptions,
    onOpenRecord,
    onOpenCurrentWork,
    onOpenProcessing,
    onOpenCommunications,
}: WorkItemDetailPanelProps) {
    const [showActivity, setShowActivity] = useState(false);

    const model = useMemo(
        () => (task ? buildWorkItemDetailModel(task, bpLabelOptions) : null),
        [bpLabelOptions, task],
    );

    if (!task || !model) return <EmptyDetailState />;

    const chip = STATE_CHIP[model.state];
    const title = normalizeOperationalTaskTitleDisplay(task.title)?.trim() || task.title;
    const assignee = task.assignee_label?.trim() || null;
    const canOpenRecord = Boolean(task.entity_id?.trim() && task.entity_type === "opportunities");
    const notes = task.description?.trim() || null;

    return (
        <div className="flex min-h-0 flex-1 flex-col" data-work-items-detail-panel="true">
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
                <header className="space-y-2">
                    <h2 className="text-[15px] font-semibold leading-snug text-alloy-midnight">{title}</h2>
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span
                            className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${chip.className}`}
                            data-work-items-detail-state={model.state}
                        >
                            {chip.label}
                        </span>
                        {model.state !== "completed" && task.due_at ? (
                            <span className="text-[11.5px] text-alloy-midnight/58">
                                {formatOperationalTaskDueDisplay(task.due_at)}
                            </span>
                        ) : null}
                        {assignee ? (
                            <span className="text-[11.5px] text-alloy-midnight/58">· {assignee}</span>
                        ) : null}
                    </div>
                </header>

                {model.subjectLabel ? (
                    <Section label="About">
                        <p className="text-[12.5px] font-medium text-alloy-midnight/85">
                            {model.subjectLabel}
                        </p>
                        {model.subjectDetail ? (
                            <p className="text-[11.5px] text-alloy-midnight/55">{model.subjectDetail}</p>
                        ) : null}
                    </Section>
                ) : null}

                <Section label="Why this exists">
                    <p className="text-[12px] leading-snug text-alloy-midnight/72" data-work-items-detail-reason="true">
                        {model.reason}
                    </p>
                    {model.originPath ? (
                        <p className="text-[11.5px] text-alloy-midnight/50" data-work-items-detail-origin="true">
                            {model.originPath}
                        </p>
                    ) : null}
                </Section>

                <Section label="What to do">
                    <div className="flex flex-wrap gap-1.5" data-work-items-detail-commands="true">
                        {model.kind === "business_process" && canOpenRecord && onOpenCurrentWork ? (
                            <button
                                type="button"
                                className={COMMAND_PRIMARY}
                                data-work-items-command="open-current-work"
                                onClick={onOpenCurrentWork}
                            >
                                Open Current Work
                            </button>
                        ) : null}
                        {model.kind === "communications" && onOpenCommunications ? (
                            <button
                                type="button"
                                className={COMMAND_PRIMARY}
                                data-work-items-command="open-conversation"
                                onClick={onOpenCommunications}
                            >
                                Open conversation
                            </button>
                        ) : null}
                        {model.kind === "processing" && onOpenProcessing ? (
                            <button
                                type="button"
                                className={COMMAND_PRIMARY}
                                data-work-items-command="open-processing"
                                onClick={onOpenProcessing}
                            >
                                Open processing case
                            </button>
                        ) : null}
                        {canOpenRecord && onOpenRecord ? (
                            <button
                                type="button"
                                className={COMMAND_SECONDARY}
                                data-work-items-command="open-record"
                                onClick={onOpenRecord}
                            >
                                Open record
                            </button>
                        ) : null}
                    </div>

                    {model.completionAuthority !== "work_items" ? (
                        <p
                            className="text-[11px] leading-snug text-alloy-midnight/48"
                            data-work-items-completion-authority={model.completionAuthority}
                        >
                            {model.kind === "business_process" ?
                                "Complete this in Current Work — it is the same work, not a copy."
                            : model.kind === "communications" ?
                                "This clears once the conversation is answered in Communications."
                            :   "This clears once the case is resolved in Processing."}
                        </p>
                    ) : (
                        <div data-work-items-detail-task-card="true">{taskCard}</div>
                    )}
                </Section>

                {notes ? (
                    <Section label="Notes">
                        <p className="whitespace-pre-line text-[12px] leading-snug text-alloy-midnight/72">
                            {notes}
                        </p>
                    </Section>
                ) : null}
            </div>

            <footer className="mt-3 shrink-0 border-t border-alloy-stone/12 pt-2">
                <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] font-medium text-alloy-midnight/50 hover:bg-alloy-stone/[0.05] hover:text-alloy-midnight/75"
                    aria-expanded={showActivity}
                    data-work-items-detail-activity-toggle="true"
                    onClick={() => setShowActivity((v) => !v)}
                >
                    <Clock3 className="h-3.5 w-3.5" aria-hidden />
                    {showActivity ? "Hide activity" : "Activity"}
                </button>
                {showActivity ? (
                    <div className="mt-2 max-h-48 overflow-y-auto">
                        <WorkItemActivityPanel task={task} />
                    </div>
                ) : null}
            </footer>
        </div>
    );
}
