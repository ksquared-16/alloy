"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { InquirySummaryTaskPreviewRow } from "@/lib/admin/drawer/opportunityInquirySummaryTaskPreview";
import { formatLayoutRuntimeOperatorDate } from "@/lib/layout/runtime/formatLayoutRuntimeOperatorDate";
import { layoutRuntimeTaskChipStyle } from "@/lib/layout/runtime/layoutRuntimeTaskChipStyles";

export function formatQueueTaskDueShort(iso: string): string {
    const formatted = formatLayoutRuntimeOperatorDate(iso);
    return formatted || iso;
}

/** Compact due label for queue-row task mini-cards — avoids mid-string CSS clipping. */
export function formatQueueTaskDueMiniCard(iso: string): string {
    const formatted = formatLayoutRuntimeOperatorDate(iso);
    if (!formatted) return iso;
    const withTime = /^(\d{2}-\d{2})-\d{4}\s+(.+)$/.exec(formatted);
    if (withTime) return `${withTime[1]} ${withTime[2]}`;
    const dateOnly = /^(\d{2}-\d{2})-\d{4}$/.exec(formatted);
    if (dateOnly) return dateOnly[1]!;
    return formatted;
}

/** Anchored task detail overlay — shared by drawer and queue row task widgets. */
export default function LayoutRuntimeTaskDetailPopover({
    task,
    anchorEl,
    onClose,
}: {
    task: InquirySummaryTaskPreviewRow;
    anchorEl: HTMLElement;
    onClose: () => void;
}) {
    const panelRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
    const chipStyle = layoutRuntimeTaskChipStyle(task);

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
            className="fixed z-[86] rounded-lg border border-admin-border bg-white p-3 shadow-[0_12px_32px_-12px_rgba(24,39,58,0.22)]"
            style={{ top: pos.top, left: pos.left, width: pos.width }}
            data-layout-runtime-task-detail-popover="true"
            role="dialog"
            aria-label="Task details"
            onClick={(e) => e.stopPropagation()}
        >
            <div className="text-[10px] font-semibold uppercase tracking-wide text-alloy-muted">Work item</div>
            <div className="mt-1 text-sm font-semibold text-alloy-midnight">{task.title}</div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-alloy-muted">
                <span className={chipStyle.badgeClassName}>{chipStyle.label}</span>
                {task.due_at ?
                    <span>Due {formatQueueTaskDueShort(task.due_at)}</span>
                :   null}
                {task.status ?
                    <span className="capitalize">{task.status.replace(/_/g, " ")}</span>
                :   null}
            </div>
            {task.source ?
                <p className="mt-2 text-[11px] text-alloy-muted/90">Source: {task.source.replace(/_/g, " ")}</p>
            :   null}
        </div>,
        document.body,
    );
}
