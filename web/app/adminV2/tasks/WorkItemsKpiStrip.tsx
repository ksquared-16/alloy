"use client";

/**
 * Work Items → Work mode operational health band (Doctrine V3).
 *
 * Data-only adapter: overview and queue sections supply different metric sets;
 * renders canonical `WorkspaceOperationalHealth` (flat strip — no boxed KPI cards).
 */

import { useEffect, useMemo, useState } from "react";

import WorkspaceOperationalHealth, {
    type WorkspaceOperationalHealthItem,
} from "@/components/workspace/WorkspaceOperationalHealth";
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

/** Static trend placeholders until historical comparison APIs exist. */
const OVERVIEW_TRENDS = {
    open: { direction: "none" as const, label: "—" },
    due_today: { direction: "none" as const, label: "—" },
    overdue: { direction: "none" as const, label: "—", tone: "ember" as const },
    completed_today: { direction: "none" as const, label: "—", tone: "gold" as const },
};

const QUEUE_TRENDS = {
    assigned: { direction: "none" as const, label: "—" },
    waiting: { direction: "none" as const, label: "—" },
    due_soon: { direction: "none" as const, label: "—" },
    overdue: { direction: "none" as const, label: "—", tone: "ember" as const },
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
    const c = counts ?? empty;

    const overviewItems: WorkspaceOperationalHealthItem[] = useMemo(
        () => [
            { key: "open", label: "Open", value: String(c.open), tone: "pine", trend: OVERVIEW_TRENDS.open },
            { key: "due_today", label: "Due Today", value: String(c.due_today), tone: "gold", trend: OVERVIEW_TRENDS.due_today },
            { key: "overdue", label: "Overdue", value: String(c.overdue), tone: "ember", trend: OVERVIEW_TRENDS.overdue },
            {
                key: "completed_today",
                label: "Completed Today",
                value: String(c.completed_today),
                tone: "gold",
                trend: OVERVIEW_TRENDS.completed_today,
            },
        ],
        [c.open, c.due_today, c.overdue, c.completed_today]
    );

    const queueItems: WorkspaceOperationalHealthItem[] = useMemo(
        () => [
            { key: "assigned", label: "Assigned", value: String(c.assigned), tone: "pine", trend: QUEUE_TRENDS.assigned },
            { key: "waiting", label: "Waiting", value: String(c.waiting), tone: "gold", trend: QUEUE_TRENDS.waiting },
            { key: "due_soon", label: "Due Soon", value: String(c.due_soon), tone: "gold", trend: QUEUE_TRENDS.due_soon },
            { key: "overdue", label: "Overdue", value: String(c.overdue), tone: "ember", trend: QUEUE_TRENDS.overdue },
        ],
        [c.assigned, c.waiting, c.due_soon, c.overdue]
    );

    const items = workView === "queue" ? queueItems : overviewItems;

    return (
        <WorkspaceOperationalHealth
            eyebrow={SECTION_EYEBROW[workView]}
            items={items}
            loading={loading}
            ariaLabel="Work Items operational health"
            className="w-full"
            data-testid="work-items-kpi-band"
        />
    );
}
