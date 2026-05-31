"use client";

import {
    formatOperationalTaskDueDisplay,
    formatOperationalTaskSourceLabel,
} from "@/lib/agent/taskAssist/formatOperationalTaskSourceLabel";
import {
    operationalTaskUrgencyBadge,
    type OperationalTaskDueUrgency,
} from "@/lib/agent/taskAssist/taskAssistOperationalUrgency";
import { minDatetimeLocalValue } from "@/components/admin/taskAssist/TaskAssistOpportunityWorkspace";

import type { MyTasksTaskRow } from "@/lib/agent/taskAssist/myTasksTaskTypes";

export type MyTasksTaskCardMode = "view" | "edit" | "reschedule";

export type MyTasksTaskCardProps = {
    task: MyTasksTaskRow;
    mode: MyTasksTaskCardMode;
    busy: boolean;
    canOpenRecord: boolean;
    editTitle: string;
    editDue: string;
    editNotes: string;
    onEditTitleChange: (value: string) => void;
    onEditDueChange: (value: string) => void;
    onEditNotesChange: (value: string) => void;
    onComplete: () => void;
    onDismiss: () => void;
    onStartEdit: () => void;
    onStartReschedule: () => void;
    onSaveEdit: () => void;
    onSaveReschedule: () => void;
    onCancelForm: () => void;
    onOpenRecord: () => void;
};

const ACTION_BTN =
    "rounded-md border border-alloy-stone/25 bg-white px-2.5 py-1 text-[11px] font-semibold text-alloy-midnight/80 shadow-sm hover:bg-alloy-stone/[0.05] disabled:opacity-45";
const PRIMARY_BTN =
    "rounded-md bg-alloy-midnight/90 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm hover:bg-alloy-midnight disabled:opacity-45";
const ACCENT_BTN =
    "rounded-md border border-alloy-blue/25 bg-alloy-blue/[0.06] px-2.5 py-1 text-[11px] font-semibold text-alloy-blue hover:bg-alloy-blue/[0.1] disabled:opacity-45";

function isOverdueUrgency(urgency: OperationalTaskDueUrgency): boolean {
    return urgency === "overdue";
}

export default function MyTasksTaskCard({
    task,
    mode,
    busy,
    canOpenRecord,
    editTitle,
    editDue,
    editNotes,
    onEditTitleChange,
    onEditDueChange,
    onEditNotesChange,
    onComplete,
    onDismiss,
    onStartEdit,
    onStartReschedule,
    onSaveEdit,
    onSaveReschedule,
    onCancelForm,
    onOpenRecord,
}: MyTasksTaskCardProps) {
    const badge = operationalTaskUrgencyBadge(task);
    const overdue = isOverdueUrgency(badge.urgency);
    const sourceLabel = formatOperationalTaskSourceLabel(task.source);
    const isOpen = task.status === "open";

    if (mode === "edit") {
        return (
            <li
                className="rounded-xl border border-alloy-stone/18 bg-white p-3.5 shadow-sm ring-1 ring-alloy-stone/[0.06]"
                data-adminv2-task-row={task.id}
                data-adminv2-task-mode="edit"
            >
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">Edit task</p>
                <div className="space-y-2">
                    <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => onEditTitleChange(e.target.value)}
                        className="w-full rounded-lg border border-alloy-stone/25 px-2.5 py-1.5 text-[13px]"
                    />
                    <input
                        type="datetime-local"
                        value={editDue}
                        min={minDatetimeLocalValue()}
                        onChange={(e) => onEditDueChange(e.target.value)}
                        className="w-full rounded-lg border border-alloy-stone/25 px-2.5 py-1.5 text-[13px]"
                    />
                    <textarea
                        rows={2}
                        value={editNotes}
                        onChange={(e) => onEditNotesChange(e.target.value)}
                        className="w-full resize-y rounded-lg border border-alloy-stone/25 px-2.5 py-1.5 text-[12px]"
                        placeholder="Notes"
                    />
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                        <button type="button" disabled={busy} className={PRIMARY_BTN} onClick={() => void onSaveEdit()}>
                            Save changes
                        </button>
                        <button type="button" className={ACTION_BTN} onClick={onCancelForm}>
                            Cancel
                        </button>
                    </div>
                </div>
            </li>
        );
    }

    if (mode === "reschedule") {
        return (
            <li
                className={`rounded-xl border bg-white p-3.5 shadow-sm ring-1 ${
                    overdue ? "border-red-200/70 ring-red-100/80" : "border-alloy-stone/18 ring-alloy-stone/[0.06]"
                }`}
                data-adminv2-task-row={task.id}
                data-adminv2-task-mode="reschedule"
            >
                <p className="mb-0.5 text-[13px] font-semibold text-alloy-midnight/90">{task.title}</p>
                <p className="mb-2 text-[11px] text-alloy-midnight/55">
                    {overdue ? "This task is overdue. Pick a new due date." : "Choose a new due date and time."}
                </p>
                <input
                    type="datetime-local"
                    value={editDue}
                    min={minDatetimeLocalValue()}
                    onChange={(e) => onEditDueChange(e.target.value)}
                    className="w-full rounded-lg border border-alloy-stone/25 px-2.5 py-1.5 text-[13px]"
                    data-adminv2-task-reschedule-input="true"
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                    <button type="button" disabled={busy} className={PRIMARY_BTN} onClick={() => void onSaveReschedule()}>
                        Save new due date
                    </button>
                    <button type="button" className={ACTION_BTN} onClick={onCancelForm}>
                        Cancel
                    </button>
                </div>
            </li>
        );
    }

    return (
        <li
            className={`rounded-xl border bg-white p-3.5 shadow-sm ring-1 ${
                overdue ?
                    "border-red-200/60 ring-red-100/70"
                :   "border-alloy-stone/18 ring-alloy-stone/[0.06]"
            }`}
            data-adminv2-task-row={task.id}
            data-adminv2-task-mode="view"
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[13px] font-semibold leading-snug text-alloy-midnight/92">{task.title}</h3>
                        <span
                            className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badge.className}`}
                            data-adminv2-task-urgency={badge.urgency}
                        >
                            {badge.label}
                        </span>
                    </div>
                    <p className="mt-1 text-[12px] font-medium text-alloy-midnight/72">
                        Due {formatOperationalTaskDueDisplay(task.due_at)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-alloy-midnight/50" data-adminv2-task-source-label="true">
                        {sourceLabel}
                    </p>
                    {task.description?.trim() ? (
                        <p className="mt-2 line-clamp-2 rounded-lg border border-alloy-stone/12 bg-alloy-stone/[0.03] px-2.5 py-1.5 text-[12px] leading-snug text-alloy-midnight/68">
                            {task.description}
                        </p>
                    ) : null}
                </div>
            </div>

            {isOpen ? (
                <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-alloy-stone/10 pt-2.5">
                    <button
                        type="button"
                        disabled={busy}
                        className={PRIMARY_BTN}
                        data-adminv2-task-complete="true"
                        onClick={() => void onComplete()}
                    >
                        Complete
                    </button>
                    <button
                        type="button"
                        disabled={busy}
                        className={overdue ? ACCENT_BTN : ACTION_BTN}
                        data-adminv2-task-reschedule="true"
                        onClick={onStartReschedule}
                    >
                        Reschedule
                    </button>
                    <button type="button" className={ACTION_BTN} data-adminv2-task-edit="true" onClick={onStartEdit}>
                        Edit
                    </button>
                    {canOpenRecord ? (
                        <button type="button" className={ACTION_BTN} onClick={onOpenRecord}>
                            Open record
                        </button>
                    ) : null}
                    <button
                        type="button"
                        disabled={busy}
                        className="rounded-md px-2 py-1 text-[11px] font-semibold text-alloy-midnight/45 hover:bg-alloy-stone/[0.06] hover:text-alloy-midnight/70 disabled:opacity-45"
                        data-adminv2-task-dismiss="true"
                        onClick={() => void onDismiss()}
                    >
                        Dismiss
                    </button>
                </div>
            ) : null}
        </li>
    );
}
