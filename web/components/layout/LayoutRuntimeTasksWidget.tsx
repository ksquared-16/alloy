"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { operationalTaskUrgencyBadge } from "@/lib/agent/taskAssist/taskAssistOperationalUrgency";
import {
    INQUIRY_RIGHT_COLUMN_EMPTY_ROW_CLASS,
    INQUIRY_RIGHT_COLUMN_TASKS_BODY_CLASS,
} from "@/lib/admin/drawer/opportunityInquiryRightColumnGeometry";
import type { InquirySummaryTaskPreviewRow } from "@/lib/admin/drawer/opportunityInquirySummaryTaskPreview";
import { mapLayoutRuntimeTasksFromVm } from "@/lib/layout/runtime/mapLayoutRuntimeTasksFromVm";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

const CHIP =
    "inline-flex max-w-full cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium leading-snug transition-shadow hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(0,162,131,0.25)]";

function shortWhen(iso: string): string {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return iso;
    return new Date(t).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}

function toTaskRows(record: ProofRuntimeRecord): InquirySummaryTaskPreviewRow[] {
    const overview =
        record._overview_data && typeof record._overview_data === "object"
            ? (record._overview_data as Record<string, unknown>)
            : record;
    return mapLayoutRuntimeTasksFromVm(overview).map((row) => ({
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
};

function TaskDetailPopover({
    task,
    anchorEl,
    onClose,
}: {
    task: InquirySummaryTaskPreviewRow;
    anchorEl: HTMLElement;
    onClose: () => void;
}) {
    const panelRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

    useEffect(() => {
        const rect = anchorEl.getBoundingClientRect();
        setPos({
            top: rect.bottom + 6,
            left: Math.min(rect.left, window.innerWidth - 280),
        });
    }, [anchorEl]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        const onMouseDown = (e: MouseEvent) => {
            const t = e.target as Node;
            if (anchorEl.contains(t)) return;
            if (panelRef.current?.contains(t)) return;
            onClose();
        };
        document.addEventListener("keydown", onKey);
        const tid = window.setTimeout(() => document.addEventListener("mousedown", onMouseDown), 0);
        return () => {
            window.clearTimeout(tid);
            document.removeEventListener("keydown", onKey);
            document.removeEventListener("mousedown", onMouseDown);
        };
    }, [anchorEl, onClose]);

    if (!pos) return null;

    const badge = operationalTaskUrgencyBadge(task);

    return (
        <div
            ref={panelRef}
            className="fixed z-[86] w-[min(18rem,calc(100vw-1.5rem))] rounded-md border border-alloy-stone/15 bg-white p-3 shadow-[0_10px_28px_-10px_rgba(15,23,42,0.2)]"
            style={{ top: pos.top, left: pos.left }}
            data-layout-runtime-task-detail-popover="true"
            role="dialog"
            aria-label="Task details"
        >
            <div className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/50">Task</div>
            <div className="mt-1 text-sm font-semibold text-alloy-midnight">{task.title}</div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-alloy-midnight/70">
                <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${badge.className}`}>
                    {badge.label}
                </span>
                {task.due_at ?
                    <span>Due {shortWhen(task.due_at)}</span>
                :   null}
                {task.status ?
                    <span className="capitalize">{task.status.replace(/_/g, " ")}</span>
                :   null}
            </div>
            {task.source ?
                <p className="mt-2 text-[11px] text-alloy-midnight/55">Source: {task.source.replace(/_/g, " ")}</p>
            :   null}
        </div>
    );
}

/** Layout runtime tasks widget — click a task for inline detail overlay. */
export default function LayoutRuntimeTasksWidget({ record, title = "Tasks" }: Props) {
    const openTasks = toTaskRows(record);
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
        <div data-layout-runtime-tasks-widget="true" data-operational-strip-group="tasks">
            <div className="border-b border-[#eceef2] px-2.5 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#5c6478]">
                {title}
            </div>
            <div className={`relative px-2.5 py-2 ${INQUIRY_RIGHT_COLUMN_TASKS_BODY_CLASS}`}>
                {openTasks.length > 0 ?
                    openTasks.map((t) => {
                        const badge = operationalTaskUrgencyBadge(t);
                        return (
                            <button
                                key={t.id}
                                type="button"
                                className={`${CHIP} border ${badge.className}`}
                                data-inquiry-summary-task-preview-row={t.id}
                                data-layout-runtime-task-chip="true"
                                aria-expanded={activeTask?.id === t.id}
                                onClick={(e) => onTaskClick(t, e.currentTarget)}
                            >
                                <span className="truncate font-semibold">{t.title}</span>
                                <span
                                    className={`shrink-0 rounded-full border px-1 py-0 text-[8px] font-semibold ${badge.className}`}
                                >
                                    {badge.label}
                                </span>
                                {t.due_at ?
                                    <span className="shrink-0 opacity-75">· {shortWhen(t.due_at)}</span>
                                :   null}
                            </button>
                        );
                    })
                :   <span className={INQUIRY_RIGHT_COLUMN_EMPTY_ROW_CLASS} data-inquiry-summary-task-preview-empty="true">
                        No open tasks
                    </span>
                }
                {activeTask && anchorEl ?
                    <TaskDetailPopover task={activeTask} anchorEl={anchorEl} onClose={closePopover} />
                :   null}
            </div>
        </div>
    );
}
