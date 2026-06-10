"use client";

import {
    formatOperationalTaskDueDisplay,
    formatOperationalTaskSourceLabel,
} from "@/lib/agent/taskAssist/formatOperationalTaskSourceLabel";
import { buildMyTasksRecordContextLines } from "@/lib/agent/taskAssist/myTasksRecordContextPresentation";
import type { MyTasksPresentationLabels } from "@/lib/agent/taskAssist/myTasksPresentationLabels";
import { normalizeOperationalTaskTitleDisplay } from "@/lib/agent/taskAssist/normalizeOperationalTaskTitleDisplay";
import {
    operationalTaskUrgencyBadge,
    type OperationalTaskDueUrgency,
} from "@/lib/agent/taskAssist/taskAssistOperationalUrgency";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import OperationalWorkAssigneeSelect from "@/components/admin/opportunity/OperationalWorkAssigneeSelect";
import StageWorkOutcomePicker from "@/components/admin/StageWorkOutcomePicker";
import { operationalWorkAssigneeDetailLabel } from "@/lib/admin/operationalWork/operationalWorkAssigneePresentation";
import type { StageCompletionOutcomeV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import { minOperationalWorkDatetimeLocalValue } from "@/lib/admin/operationalWork/operationalWorkDateTimeLocal";
import type { EntityLabelsMap } from "@/contexts/EntityLabelsContext";

import type { MyTasksTaskRow } from "@/lib/agent/taskAssist/myTasksTaskTypes";

export type MyTasksTaskCardMode = "view" | "edit" | "reschedule" | "outcome";

export type MyTasksTaskCardProps = {
    task: MyTasksTaskRow;
    mode: MyTasksTaskCardMode;
    busy: boolean;
    canOpenRecord: boolean;
    presentation: MyTasksPresentationLabels;
    entityLabels: EntityLabelsMap;
    editTitle: string;
    editDue: string;
    editNotes: string;
    editAssignedToUserId: string | null;
    onEditTitleChange: (value: string) => void;
    onEditDueChange: (value: string) => void;
    onEditNotesChange: (value: string) => void;
    onEditAssignedToUserIdChange: (value: string | null) => void;
    onComplete: () => void;
    onDismiss: () => void;
    onStartEdit: () => void;
    onStartReschedule: () => void;
    onSaveEdit: () => void;
    onSaveReschedule: () => void;
    onCancelForm: () => void;
    onOpenRecord: () => void;
    outcomeWorkTitle?: string;
    outcomeOptions?: StageCompletionOutcomeV1[];
    onSelectOutcome?: (outcomeKey: string) => void;
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
    presentation,
    entityLabels,
    editTitle,
    editDue,
    editNotes,
    editAssignedToUserId,
    onEditTitleChange,
    onEditDueChange,
    onEditNotesChange,
    onEditAssignedToUserIdChange,
    onComplete,
    onDismiss,
    onStartEdit,
    onStartReschedule,
    onSaveEdit,
    onSaveReschedule,
    onCancelForm,
    onOpenRecord,
    outcomeWorkTitle,
    outcomeOptions,
    onSelectOutcome,
}: MyTasksTaskCardProps) {
    const { userId } = useAdminAuth();
    const badge = operationalTaskUrgencyBadge(task);
    const overdue = isOverdueUrgency(badge.urgency);
    const sourceLabel = formatOperationalTaskSourceLabel(task.source);
    const isOpen = task.status === "open";
    const context = buildMyTasksRecordContextLines(task, presentation, entityLabels);
    const displayTitle = normalizeOperationalTaskTitleDisplay(task.title);
    const assigneeLabel = operationalWorkAssigneeDetailLabel({
        assignedToUserId: task.assigned_to_user_id,
        assigneeLabel: task.assignee_label,
        currentUserId: userId,
    });

    if (mode === "outcome" && outcomeOptions?.length) {
        return (
            <li
                className="rounded-xl border border-alloy-stone/18 bg-white p-3.5 shadow-sm ring-1 ring-alloy-stone/[0.06]"
                data-adminv2-task-row={task.id}
                data-adminv2-task-mode="outcome"
            >
                <StageWorkOutcomePicker
                    workTitle={outcomeWorkTitle ?? displayTitle}
                    outcomes={outcomeOptions}
                    busy={busy}
                    onSelect={(key) => onSelectOutcome?.(key)}
                    onCancel={onCancelForm}
                />
            </li>
        );
    }

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
                        min={minOperationalWorkDatetimeLocalValue()}
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
                    <label className="mb-1 block text-[12px] font-medium text-alloy-midnight/80">Assigned to</label>
                    <OperationalWorkAssigneeSelect
                        id={`adminv2-edit-task-assignee-${task.id}`}
                        value={editAssignedToUserId}
                        currentUserId={userId}
                        disabled={busy}
                        onChange={onEditAssignedToUserIdChange}
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
                <p className="mb-0.5 text-[13px] font-semibold text-alloy-midnight/90">{displayTitle}</p>
                <p className="mb-2 text-[11px] text-alloy-midnight/55">
                    {overdue ? "This task is overdue. Pick a new due date." : "Choose a new due date and time."}
                </p>
                <input
                    type="datetime-local"
                    value={editDue}
                    min={minOperationalWorkDatetimeLocalValue()}
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
                        <h3
                            className="text-[13px] font-semibold leading-snug text-alloy-midnight/92"
                            data-adminv2-task-title-display="true"
                        >
                            {displayTitle}
                        </h3>
                        <span
                            className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badge.className}`}
                            data-adminv2-task-urgency={badge.urgency}
                        >
                            {badge.label}
                        </span>
                    </div>
                    {context.showContextBlock ? (
                        <div
                            className="mt-1.5 space-y-0.5 text-[11px] leading-snug text-alloy-midnight/55"
                            data-adminv2-task-context="true"
                        >
                            <p>
                                <span className="text-alloy-midnight/40">{context.entityTypeLabel} · </span>
                                {canOpenRecord ? (
                                    <button
                                        type="button"
                                        className="font-medium text-alloy-blue underline-offset-2 hover:underline"
                                        data-adminv2-task-entity-link="true"
                                        onClick={onOpenRecord}
                                    >
                                        {context.entityLabel}
                                    </button>
                                ) : (
                                    <span className="font-medium text-alloy-midnight/68">{context.entityLabel}</span>
                                )}
                                {context.statusLabel ? (
                                    <span className="text-alloy-midnight/38"> · {context.statusLabel}</span>
                                ) : null}
                            </p>
                            {context.householdLabel ? (
                                <p data-adminv2-task-household="true">
                                    <span className="text-alloy-midnight/40">Household · </span>
                                    {context.householdLabel}
                                </p>
                            ) : null}
                            {context.contactLabel ? (
                                <p data-adminv2-task-contact="true">
                                    <span className="text-alloy-midnight/40">{context.guardianFieldLabel} · </span>
                                    {context.contactLabel}
                                </p>
                            ) : null}
                            {context.childrenDisplay && context.childFieldLabel ? (
                                <p data-adminv2-task-children="true">
                                    <span className="text-alloy-midnight/40">{context.childFieldLabel} · </span>
                                    {context.childrenDisplay}
                                </p>
                            ) : null}
                        </div>
                    ) : null}
                    <p className="mt-1 text-[12px] font-medium text-alloy-midnight/72">
                        Due {formatOperationalTaskDueDisplay(task.due_at)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-alloy-midnight/50" data-adminv2-task-assignee="true">
                        Assigned to · {assigneeLabel}
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
