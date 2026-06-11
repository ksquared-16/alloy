"use client";

import { useCallback, useEffect, useState } from "react";
import { ListTodo } from "lucide-react";

import AdminV2WorkspaceBosModalShell from "@/app/adminV2/components/AdminV2WorkspaceBosModalShell";
import MyTasksPanel from "@/app/adminV2/components/MyTasksPanel";
import { fetchOperationalTasksSummary, readJson } from "@/lib/agent/taskAssist/taskAssistV11OpportunityApi";

export type MyTasksModalProps = {
    open: boolean;
    onClose: () => void;
};

type TaskCounts = { open: number; due_soon: number; overdue: number };

function formatHeaderSummary(counts: TaskCounts | null, filterCount: number | null): string {
    if (!counts && filterCount == null) return "Follow-ups and reminders across your workspace";
    const parts: string[] = [];
    if (counts != null) {
        parts.push(`${counts.open} open`);
        if (counts.overdue > 0) parts.push(`${counts.overdue} overdue`);
        else if (counts.due_soon > 0) parts.push(`${counts.due_soon} due soon`);
    }
    if (filterCount != null && filterCount !== counts?.open) {
        parts.push(`${filterCount} in this view`);
    }
    return parts.length ? parts.join(" · ") : "Follow-ups and reminders across your workspace";
}

export default function MyTasksModal({ open, onClose }: MyTasksModalProps) {
    const [counts, setCounts] = useState<TaskCounts | null>(null);
    const [filterCount, setFilterCount] = useState<number | null>(null);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        void (async () => {
            try {
                const res = await fetchOperationalTasksSummary();
                const json = await readJson<{ ok?: boolean; counts?: TaskCounts }>(res);
                if (!cancelled && res.ok && json.ok && json.counts) {
                    setCounts(json.counts);
                }
            } catch {
                /* non-fatal */
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [open]);

    const onFilterCountChange = useCallback((count: number) => {
        setFilterCount(count);
    }, []);

    const summary = formatHeaderSummary(counts, filterCount);

    return (
        <AdminV2WorkspaceBosModalShell
            open={open}
            onClose={onClose}
            dataModalAttr="adminv2-tasks-modal"
            ariaLabelledBy="adminv2-tasks-modal-title"
            panelClassName="max-h-[min(92vh,56rem)]"
        >
            <div
                className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-alloy-stone/18 bg-[#f7f6f3]"
                data-adminv2-tasks-modal="true"
            >
                <div className="flex shrink-0 items-start justify-between gap-3 border-b border-alloy-stone/15 bg-white px-4 py-3.5 sm:px-5">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <ListTodo className="h-4 w-4 shrink-0 text-alloy-midnight/65" aria-hidden strokeWidth={2} />
                            <h2 id="adminv2-tasks-modal-title" className="text-sm font-semibold text-alloy-midnight">
                                My tasks
                            </h2>
                        </div>
                        <p
                            className="mt-0.5 pl-6 text-[11px] leading-snug text-alloy-midnight/55"
                            data-adminv2-tasks-summary="true"
                        >
                            {summary}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="shrink-0 rounded-lg border border-alloy-stone/20 px-2.5 py-1 text-[11px] font-semibold text-alloy-forge hover:bg-alloy-stone/[0.06]"
                        aria-label="Close"
                    >
                        Close
                    </button>
                </div>
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-3 sm:px-5 sm:py-4">
                    <MyTasksPanel compact onClose={onClose} onFilterCountChange={onFilterCountChange} />
                </div>
            </div>
        </AdminV2WorkspaceBosModalShell>
    );
}
