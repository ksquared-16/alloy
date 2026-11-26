"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { InquirySummaryTaskPreviewRow } from "@/lib/admin/drawer/opportunityInquirySummaryTaskPreview";
import { formatTaskDueDate } from "@/lib/presentation/presentationDateFormat";
import { layoutRuntimeTaskChipStyle } from "@/lib/layout/runtime/layoutRuntimeTaskChipStyles";
import { dispatchFocusCurrentWork } from "@/lib/workItems/workItemsNavigation";
import { humanizeSnakeCaseToken } from "@/lib/admin/activityTimelineFormat";

export function formatQueueTaskDueShort(iso: string): string {
    const formatted = formatTaskDueDate(iso);
    return formatted || iso;
}

/** Compact due label for queue-row task mini-cards — weekday omitted to avoid clipping. */
export function formatQueueTaskDueMiniCard(iso: string): string {
    const formatted = formatTaskDueDate(iso);
    if (!formatted) return iso;
    const withoutWeekday = formatted.replace(/^[A-Za-z]{3},\s*/, "");
    const withTime = /^(.+?) · (.+)$/.exec(withoutWeekday);
    if (withTime) {
        const datePart = withTime[1]!.trim();
        const timePart = withTime[2]!.trim().replace(/:00 /, " ");
        return `${datePart} · ${timePart}`;
    }
    return withoutWeekday;
}

/** Operator-facing provenance — omit low-value `manual` / template noise. */
function operatorSourceLabel(source: string | null | undefined): string | null {
    const key = String(source ?? "").trim().toLowerCase();
    if (!key || key === "manual" || key === "lifecycle_template" || key === "stage_work") {
        return null;
    }
    if (key === "task_assist") return "Task Assist";
    return humanizeSnakeCaseToken(key);
}

/** Anchored task detail overlay — shared by drawer and queue row task widgets. */
export default function LayoutRuntimeTaskDetailPopover({
    task,
    anchorEl,
    onClose,
    opportunityId,
}: {
    task: InquirySummaryTaskPreviewRow;
    anchorEl: HTMLElement;
    onClose: () => void;
    /** When set, shows Open work → Focus Panel Current Work for this opportunity. */
    opportunityId?: string | null;
}) {
    const panelRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
    const chipStyle = layoutRuntimeTaskChipStyle(task);
    const sourceLabel = operatorSourceLabel(task.source);
    const canOpenWork = Boolean(opportunityId?.trim() && task.id.trim());

    useEffect(() => {
        const update = () => {
            const rect = anchorEl.getBoundingClientRect();
            const width = Math.min(Math.max(rect.width, 260), window.innerWidth - 24);
            setPos({
                top: rect.bottom + 6,
                left: Math.min(Math.max(12, rect.left), window.innerWidth - width - 12),
                width,
            });
        };
        update();
        window.addEventListener("resize", update);
        window.addEventListener("scroll", update, true);
        return () => {
            window.removeEventListener("resize", update);
            window.removeEventListener("scroll", update, true);
        };
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

    if (!pos || typeof document === "undefined") return null;

    return createPortal(
        <div
            ref={panelRef}
            className="fixed z-[86] max-w-[min(100vw-24px,320px)] rounded-lg border border-admin-border bg-white p-3 shadow-[0_12px_32px_-12px_rgba(24,39,58,0.22)]"
            style={{ top: pos.top, left: pos.left, width: pos.width }}
            data-layout-runtime-task-detail-popover="true"
            role="dialog"
            aria-label="Task details"
            onClick={(e) => e.stopPropagation()}
        >
            <div className="text-[10px] font-semibold uppercase tracking-wide text-alloy-muted">Work item</div>
            <div className="mt-1 break-words text-sm font-semibold text-alloy-midnight">{task.title}</div>
            <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] text-alloy-muted">
                <span className={chipStyle.badgeClassName}>{chipStyle.label}</span>
                {task.due_at ?
                    <span>Due {formatQueueTaskDueShort(task.due_at)}</span>
                :   null}
                {task.status ?
                    <span>{humanizeSnakeCaseToken(task.status)}</span>
                :   null}
            </div>
            {sourceLabel ?
                <p className="mt-2 text-[11px] text-alloy-muted/90">Source · {sourceLabel}</p>
            :   null}
            {canOpenWork ?
                <button
                    type="button"
                    className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-alloy-bend-pine px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-alloy-bend-pine/90"
                    data-layout-runtime-task-open-work="true"
                    onClick={() => {
                        dispatchFocusCurrentWork({
                            opportunity_id: opportunityId!.trim(),
                            task_id: task.id.trim(),
                        });
                        onClose();
                    }}
                >
                    Open work
                </button>
            :   null}
        </div>,
        document.body,
    );
}
