"use client";

import { useMemo } from "react";
import {
    parseInquirySummaryTaskPreview,
    type InquirySummaryTaskPreviewRow,
} from "@/lib/admin/drawer/opportunityInquirySummaryTaskPreview";
import { operationalTaskUrgencyBadge } from "@/lib/agent/taskAssist/taskAssistOperationalUrgency";

const GROUP_LABEL =
    "text-[10px] font-semibold uppercase tracking-[0.12em] text-alloy-midnight/45";

const CHIP =
    "inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium leading-snug";

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

function parseNextFollowUpAt(record: Record<string, unknown>): string | null {
    const top = record.next_follow_up_at;
    if (typeof top === "string" && top.trim()) return top.trim();
    const md = record.metadata;
    if (md && typeof md === "object") {
        const nested = (md as { next_follow_up_at?: unknown }).next_follow_up_at;
        if (typeof nested === "string" && nested.trim()) return nested.trim();
    }
    return null;
}

function TaskPreviewChip({ task }: { task: InquirySummaryTaskPreviewRow }) {
    const badge = operationalTaskUrgencyBadge(task);
    return (
        <span
            className={`${CHIP} border ${badge.className}`}
            data-inquiry-summary-task-preview-row={task.id}
        >
            <span className="truncate font-semibold">{task.title}</span>
            <span
                className={`shrink-0 rounded-full border px-1 py-0 text-[8px] font-semibold ${badge.className}`}
            >
                {badge.label}
            </span>
            {task.due_at ? (
                <span className="shrink-0 opacity-75">· {shortWhen(task.due_at)}</span>
            ) : null}
        </span>
    );
}

function TaskRowSkeleton() {
    return (
        <div
            className="flex min-h-[1.75rem] items-center"
            aria-hidden
            data-inquiry-summary-task-preview-skeleton="true"
        >
            <div className="h-6 w-full max-w-[16rem] skeleton-pulse rounded-full bg-alloy-stone/11" />
        </div>
    );
}

type Props = {
    record: Record<string, unknown>;
    /** When false, show task row skeletons (owner has not confirmed empty yet). */
    previewConfirmed?: boolean;
    /** When false, reminders are rendered by the operational strip (full-bound). */
    showRemindersPlaceholder?: boolean;
};

/**
 * Shell-owned task preview for inquiry summary right column — data from drawer_visible / drawer_primary.
 */
export function OpportunityInquirySummaryTaskPreview({
    record,
    previewConfirmed = true,
    showRemindersPlaceholder = true,
}: Props) {
    const preview = useMemo(() => parseInquirySummaryTaskPreview(record), [record]);
    const nextFollowUpIso = useMemo(() => parseNextFollowUpAt(record), [record]);
    const openTasks = preview?.open_tasks ?? [];
    const emptyConfirmed = previewConfirmed && preview != null && preview.open_count === 0;

    return (
        <div
            className="mt-2 min-h-[4.5rem] border-t border-alloy-stone/10 pt-2"
            data-inquiry-summary-task-preview="true"
            data-inquiry-summary-task-preview-count={preview?.open_count ?? 0}
        >
            <div data-operational-strip-group="tasks">
                <div className={GROUP_LABEL}>Tasks</div>
                <div className="mt-1 flex w-full flex-col gap-1.5">
                    {!previewConfirmed ? (
                        <>
                            <TaskRowSkeleton />
                            <TaskRowSkeleton />
                        </>
                    ) : openTasks.length > 0 ? (
                        <div className="flex w-full flex-wrap gap-1">
                            {openTasks.map((t) => (
                                <TaskPreviewChip key={t.id} task={t} />
                            ))}
                        </div>
                    ) : emptyConfirmed ? (
                        <p
                            className="text-[11px] text-alloy-midnight/50"
                            data-inquiry-summary-task-preview-empty="true"
                        >
                            No open tasks
                        </p>
                    ) : (
                        <TaskRowSkeleton />
                    )}
                </div>
            </div>
            {emptyConfirmed && nextFollowUpIso ? (
                <div className="mt-2" data-operational-strip-group="follow_up">
                    <div className={GROUP_LABEL}>Follow-up</div>
                    <div className="mt-1">
                        <span
                            className={`${CHIP} border-alloy-stone/25 bg-alloy-stone/[0.06] text-alloy-midnight/75`}
                            data-operational-next-follow-up="true"
                        >
                            <span className="text-alloy-midnight/50">Next follow-up</span>
                            <span className="truncate">{shortWhen(nextFollowUpIso)}</span>
                        </span>
                    </div>
                </div>
            ) : null}
            {showRemindersPlaceholder ? (
                <div className="mt-2 min-h-[1.5rem]" data-shell-slot-placeholder="reminders_pending">
                    <div className={GROUP_LABEL}>Reminders</div>
                    <div className="mt-1 h-6 max-w-[14rem] skeleton-pulse rounded-full bg-alloy-stone/9" aria-hidden />
                </div>
            ) : null}
        </div>
    );
}
