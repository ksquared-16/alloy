"use client";

import { useCallback, useState, type MouseEvent } from "react";
import type { InquirySummaryTaskPreviewRow } from "@/lib/admin/drawer/opportunityInquirySummaryTaskPreview";
import { mapLayoutRuntimeTasksFromVm } from "@/lib/layout/runtime/mapLayoutRuntimeTasksFromVm";
import { operationalTaskDueUrgency } from "@/lib/agent/taskAssist/taskAssistOperationalUrgency";
import { layoutRuntimeTaskChipStyle } from "@/lib/layout/runtime/layoutRuntimeTaskChipStyles";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import LayoutRuntimeTaskDetailPopover, {
    formatQueueTaskDueMiniCard,
    formatQueueTaskDueShort,
} from "@/components/layout/queueRecord/LayoutRuntimeTaskDetailPopover";

function toTaskRows(record: ProofRuntimeRecord): InquirySummaryTaskPreviewRow[] {
    return mapLayoutRuntimeTasksFromVm(record as Record<string, unknown>).map((row) => ({
        id: row.id,
        title: row.title,
        due_at: row.due ?? "",
        status: row.status ?? "open",
        source: row.source ?? "",
    }));
}

function stopRowOpen(e: MouseEvent) {
    e.stopPropagation();
}

type Props = {
    record: ProofRuntimeRecord;
    title?: string;
    /** Max task rows visible before +N more. */
    maxVisible?: number;
};

/** Compact queue-row tasks widget — mirrors drawer task chips. */
export default function QueueRecordTasksWidget({ record, title = "Tasks", maxVisible = 2 }: Props) {
    const openTasks = toTaskRows(record);
    const visibleTasks = openTasks.slice(0, maxVisible);
    const overflowCount = Math.max(0, openTasks.length - visibleTasks.length);
    const [activeTask, setActiveTask] = useState<InquirySummaryTaskPreviewRow | null>(null);
    const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

    const onTaskClick = useCallback((task: InquirySummaryTaskPreviewRow, el: HTMLElement) => {
        setActiveTask((prev) => {
            if (prev?.id === task.id) {
                setAnchorEl(null);
                return null;
            }
            setAnchorEl(el);
            return task;
        });
    }, []);

    const closePopover = useCallback(() => {
        setActiveTask(null);
        setAnchorEl(null);
    }, []);

    if (!openTasks.length) {
        return (
            <div
                className="queue-record-widget queue-record-widget--tasks queue-record-widget--empty"
                data-queue-tasks-widget="true"
                data-queue-row-interactive="true"
                onClick={stopRowOpen}
            >
                <div className="queue-record-widget__label">{title}</div>
                <div className="queue-record-widget__body">
                    <span className="queue-record-widget__empty">No open tasks</span>
                </div>
            </div>
        );
    }

    return (
        <div
            className="queue-record-widget queue-record-widget--tasks"
            data-queue-tasks-widget="true"
            data-queue-row-interactive="true"
            data-queue-tasks-count={String(openTasks.length)}
            onClick={stopRowOpen}
        >
            <div className="queue-record-widget__label">{title}</div>
            <div className="queue-record-widget__body">
            <div className="queue-record-widget__task-list">
                {visibleTasks.map((task) => {
                    const chipStyle = layoutRuntimeTaskChipStyle(task);
                    const urgency = operationalTaskDueUrgency({
                        status: task.status,
                        dueAtIso: task.due_at,
                    });
                    const active = activeTask?.id === task.id;
                    return (
                        <button
                            key={task.id}
                            type="button"
                            className={`queue-record-widget__task-card queue-record-widget__task-row queue-record-widget__task-card--${urgency}${active ? " queue-record-widget__task-card--active queue-record-widget__task-row--active" : ""}`}
                            data-layout-runtime-task-chip="true"
                            aria-expanded={active}
                            onClick={(e) => {
                                stopRowOpen(e);
                                onTaskClick(task, e.currentTarget);
                            }}
                        >
                            <span className="queue-record-widget__task-title">{task.title}</span>
                            <span className="queue-record-widget__task-card-meta">
                                <span
                                    className={`queue-record-widget__task-badge queue-record-widget__task-badge--${urgency}`}
                                >
                                    {chipStyle.label}
                                </span>
                                {task.due_at ?
                                    <span
                                        className="queue-record-widget__task-due"
                                        title={formatQueueTaskDueShort(task.due_at)}
                                    >
                                        {formatQueueTaskDueMiniCard(task.due_at)}
                                    </span>
                                :   null}
                            </span>
                        </button>
                    );
                })}
                {overflowCount > 0 ?
                    <span className="queue-record-widget__overflow" data-layout-runtime-tasks-overflow="true">
                        +{overflowCount} more
                    </span>
                :   null}
            </div>
            </div>
            {activeTask && anchorEl ?
                <LayoutRuntimeTaskDetailPopover task={activeTask} anchorEl={anchorEl} onClose={closePopover} />
            :   null}
        </div>
    );
}
