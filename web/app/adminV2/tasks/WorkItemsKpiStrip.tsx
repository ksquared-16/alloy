"use client";

/**
 * Work Items → Work mode operational health band (Doctrine V3).
 *
 * Data-only adapter: overview and queue sections supply different metric sets;
 * renders `WorkspaceOperationalHealthStrip` (flat ribbon — no boxed KPI cards).
 */

import { useEffect, useState } from "react";

import WorkspaceOperationalHealthStrip, {
    type WorkspaceOperationalHealthItem,
} from "@/components/workspace/WorkspaceOperationalHealthStrip";
import type { WorkItemsWorkView } from "@/app/adminV2/tasks/workItemsSections";
import type { MyTasksTaskRow } from "@/lib/agent/taskAssist/myTasksTaskTypes";
import {
    fetchOperationalTasksSummary,
    fetchWorkspaceOperationalTasks,
    readJson,
} from "@/lib/agent/taskAssist/taskAssistV11OpportunityApi";
import {
    getCachedWorkspaceOperationalTasks,
    prefetchWorkspaceOperationalTasks,
} from "@/lib/agent/taskAssist/operationalTasksWorkspaceCache";

type TaskCounts = {
    open: number;
    due_today: number;
    due_soon: number;
    overdue: number;
    completed_today: number;
    assigned: number;
    waiting: number;
};

function isToday(iso: string): boolean {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return false;
    const now = new Date();
    return (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
    );
}

function isOpenTask(task: MyTasksTaskRow): boolean {
    return task.status !== "completed" && task.status !== "cancelled";
}

function deriveQueueAssignmentCounts(tasks: MyTasksTaskRow[]): { assigned: number; waiting: number } {
    const open = tasks.filter(isOpenTask);
    let assigned = 0;
    let waiting = 0;
    for (const task of open) {
        if (task.assigned_to_user_id?.trim()) assigned += 1;
        else waiting += 1;
    }
    return { assigned, waiting };
}

function overviewItems(counts: TaskCounts): WorkspaceOperationalHealthItem[] {
    return [
        { key: "open", label: "Open", value: String(counts.open), status: "healthy" },
        { key: "due_today", label: "Due Today", value: String(counts.due_today), status: "warning" },
        { key: "overdue", label: "Overdue", value: String(counts.overdue), status: "critical" },
        { key: "completed_today", label: "Completed Today", value: String(counts.completed_today), status: "unknown" },
    ];
}

function queueItems(counts: TaskCounts): WorkspaceOperationalHealthItem[] {
    return [
        { key: "assigned", label: "Assigned", value: String(counts.assigned), status: "healthy" },
        { key: "waiting", label: "Waiting", value: String(counts.waiting), status: "warning" },
        { key: "due_soon", label: "Due Soon", value: String(counts.due_soon), status: "warning" },
        { key: "overdue", label: "Overdue", value: String(counts.overdue), status: "critical" },
    ];
}

const SECTION_EYEBROW: Record<WorkItemsWorkView, string> = {
    overview: "Overview",
    queue: "Queue",
};

export default function WorkItemsKpiStrip({ workView }: { workView: WorkItemsWorkView }) {
    const [counts, setCounts] = useState<TaskCounts | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        prefetchWorkspaceOperationalTasks("open");
        prefetchWorkspaceOperationalTasks("completed");
        prefetchWorkspaceOperationalTasks("due_today");

        let cancelled = false;
        void (async () => {
            try {
                const cachedOpen = getCachedWorkspaceOperationalTasks("open") as MyTasksTaskRow[] | null;
                if (cachedOpen && !cancelled) {
                    setLoading(false);
                }

                const [summaryRes, openRes, dueTodayRes, completedRes] = await Promise.all([
                    fetchOperationalTasksSummary(),
                    fetchWorkspaceOperationalTasks("open"),
                    fetchWorkspaceOperationalTasks("due_today"),
                    fetchWorkspaceOperationalTasks("completed"),
                ]);

                const summaryJson = await readJson<{ ok?: boolean; counts?: { open: number; due_soon: number; overdue: number } }>(
                    summaryRes
                );
                const openJson = await readJson<{ ok?: boolean; tasks?: MyTasksTaskRow[] }>(openRes);
                const dueTodayJson = await readJson<{ ok?: boolean; tasks?: MyTasksTaskRow[] }>(dueTodayRes);
                const completedJson = await readJson<{ ok?: boolean; tasks?: MyTasksTaskRow[] }>(completedRes);

                if (cancelled) return;

                const openRows = Array.isArray(openJson.tasks) ? openJson.tasks : cachedOpen ?? [];
                const dueTodayRows = Array.isArray(dueTodayJson.tasks) ? dueTodayJson.tasks : [];
                const completedRows = Array.isArray(completedJson.tasks) ? completedJson.tasks : [];
                const { assigned, waiting } = deriveQueueAssignmentCounts(openRows);

                if (summaryRes.ok && summaryJson.ok && summaryJson.counts) {
                    setCounts({
                        open: summaryJson.counts.open,
                        due_soon: summaryJson.counts.due_soon,
                        overdue: summaryJson.counts.overdue,
                        due_today: dueTodayRows.length,
                        completed_today: completedRows.filter((t) => isToday(t.created_at)).length,
                        assigned,
                        waiting,
                    });
                }
            } catch {
                /* non-fatal */
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();

        return () => {
            cancelled = true;
        };
    }, []);

    const empty: TaskCounts = {
        open: 0,
        due_today: 0,
        due_soon: 0,
        overdue: 0,
        completed_today: 0,
        assigned: 0,
        waiting: 0,
    };
    const items = workView === "queue" ? queueItems(counts ?? empty) : overviewItems(counts ?? empty);

    return (
        <WorkspaceOperationalHealthStrip
            eyebrow={SECTION_EYEBROW[workView]}
            items={items}
            loading={loading}
            ariaLabel="Work Items operational health"
            className="w-full"
            data-testid="work-items-kpi-band"
        />
    );
}
