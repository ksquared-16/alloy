"use client";

import { useCallback, useState } from "react";
import DrawerOverviewEmptyState from "@/components/layout/DrawerOverviewEmptyState";
import LayoutRuntimeTaskDetailPopover, {
    formatQueueTaskDueMiniCard,
    formatQueueTaskDueShort,
} from "@/components/layout/queueRecord/LayoutRuntimeTaskDetailPopover";
import type { InquirySummaryTaskPreviewRow } from "@/lib/admin/drawer/opportunityInquirySummaryTaskPreview";
import { INQUIRY_RIGHT_COLUMN_TASKS_BODY_CLASS } from "@/lib/admin/drawer/opportunityInquiryRightColumnGeometry";
import { mapLayoutRuntimeTasksFromVm } from "@/lib/layout/runtime/mapLayoutRuntimeTasksFromVm";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import {
    LAYOUT_RUNTIME_PANEL_HEADER,
    LAYOUT_RUNTIME_PANEL_SURFACE,
    LAYOUT_RUNTIME_SUMMARY_WIDGET_BODY,
    LAYOUT_RUNTIME_SUMMARY_WIDGET_HEADER,
    LAYOUT_RUNTIME_SUMMARY_WIDGET_SURFACE,
    LAYOUT_RUNTIME_WORK_RAIL,
} from "@/lib/layout/runtime/layoutRuntimeSurfaceStyles";
import { layoutRuntimeTaskChipStyle } from "@/lib/layout/runtime/layoutRuntimeTaskChipStyles";

function toTaskRows(record: ProofRuntimeRecord): InquirySummaryTaskPreviewRow[] {
    return mapLayoutRuntimeTasksFromVm(record as Record<string, unknown>).map((row) => ({
        id: row.id,
        title: row.title,
        due_at: row.due ?? "",
        status: row.status ?? "open",
        source: row.source ?? "",
    }));
}

type Props = {
    record: ProofRuntimeRecord;
    title?: string;
    /** Summary-strip presentation — compact card, fewer rows. */
    compact?: boolean;
    /** Body only — card chrome provided by LeadOperatingSummaryCard. */
    chromeless?: boolean;
    /** Premium operating card body typography. */
    operatingCard?: boolean;
    /** Empty state copy — default follows title (Tasks vs Follow-ups). */
    emptyMessage?: string;
};

/** Layout runtime tasks / follow-ups widget — click a task for anchored detail overlay. */
export default function LayoutRuntimeTasksWidget({
    record,
    title = "Tasks",
    compact = false,
    chromeless = false,
    emptyMessage,
}: Props) {
    const openTasks = toTaskRows(record);
    const visibleTasks = compact ? openTasks.slice(0, 2) : openTasks;
    const overflowCount = compact && openTasks.length > 2 ? openTasks.length - 2 : 0;
    const denseTaskRow = compact || chromeless;
    const opportunityId =
        String(record.id ?? record.opportunity_id ?? "").trim() || null;
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

    return (
        <div
            className={
                chromeless ?
                    "relative flex min-h-0 w-full min-w-0 flex-col gap-1 overflow-x-hidden"
                : compact ?
                    `${LAYOUT_RUNTIME_SUMMARY_WIDGET_SURFACE} border-l-2 border-l-alloy-juniper/50`
                :   `${LAYOUT_RUNTIME_PANEL_SURFACE} ${LAYOUT_RUNTIME_WORK_RAIL}`
            }
            data-layout-runtime-tasks-widget="true"
            data-layout-runtime-summary-widget={compact && !chromeless ? "true" : undefined}
            data-operational-strip-group="tasks"
        >
            {compact && !chromeless ?
                <div className={LAYOUT_RUNTIME_SUMMARY_WIDGET_HEADER}>
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-alloy-juniper/70" aria-hidden />
                    <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/55">{title}</span>
                </div>
            :   !chromeless ?
                <div className={LAYOUT_RUNTIME_PANEL_HEADER}>
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-alloy-muted">{title}</span>
                </div>
            :   null}
            <div
                className={
                    chromeless ?
                        "relative flex w-full min-w-0 flex-col gap-1"
                    : compact ?
                        `${LAYOUT_RUNTIME_SUMMARY_WIDGET_BODY} relative flex flex-col gap-1 overflow-hidden`
                    :   `relative flex flex-col gap-1.5 px-2.5 py-2 ${INQUIRY_RIGHT_COLUMN_TASKS_BODY_CLASS}`
                }
            >
                {visibleTasks.length > 0 ?
                    visibleTasks.map((t) => {
                        const chipStyle = layoutRuntimeTaskChipStyle(t, { compact: denseTaskRow });
                        const active = activeTask?.id === t.id;
                        const dueLabel =
                            denseTaskRow ? formatQueueTaskDueMiniCard(t.due_at) : formatQueueTaskDueShort(t.due_at);
                        return (
                            <button
                                key={t.id}
                                type="button"
                                className={`${chipStyle.rowClassName} w-full min-w-0 ${active ? "ring-1 ring-alloy-juniper/20" : ""}`}
                                data-inquiry-summary-task-preview-row={t.id}
                                data-layout-runtime-task-chip="true"
                                aria-expanded={active}
                                onClick={(e) => onTaskClick(t, e.currentTarget)}
                            >
                                <span
                                    className={
                                        denseTaskRow ?
                                            "min-w-0 flex-1 truncate text-left font-semibold text-alloy-midnight"
                                        :   "min-w-0 truncate text-left font-semibold text-alloy-midnight"
                                    }
                                >
                                    {t.title}
                                </span>
                                <span className="inline-flex shrink-0 items-center gap-0.5">
                                    <span className={chipStyle.badgeClassName}>{chipStyle.label}</span>
                                    {t.due_at ?
                                        <span
                                            className={
                                                denseTaskRow ?
                                                    "shrink-0 text-[9px] text-alloy-muted"
                                                :   "shrink-0 text-[10px] text-alloy-muted"
                                            }
                                            title={formatQueueTaskDueShort(t.due_at)}
                                        >
                                            · {dueLabel}
                                        </span>
                                    :   null}
                                </span>
                            </button>
                        );
                    })
                :   <DrawerOverviewEmptyState
                        message={emptyMessage ?? (title === "Follow-ups" ? "No follow-ups" : "No open tasks")}
                        hint={
                            title === "Follow-ups"
                                ? "Manual and Task Assist items appear here."
                                : "Tasks assigned to this record will appear here."
                        }
                        compact
                    />
                }
                {overflowCount > 0 ?
                    <div className="text-[10px] font-medium text-alloy-midnight/45" data-layout-runtime-tasks-overflow="true">
                        +{overflowCount} more
                    </div>
                :   null}
                {activeTask && anchorEl ?
                    <LayoutRuntimeTaskDetailPopover
                        task={activeTask}
                        anchorEl={anchorEl}
                        onClose={closePopover}
                        opportunityId={opportunityId}
                    />
                :   null}
            </div>
        </div>
    );
}
