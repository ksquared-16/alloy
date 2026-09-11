"use client";

/**
 * Work Items → Queue operational health band (Doctrine V3).
 *
 * Data-only adapter: queue section metrics only — Overview has no nav-band metrics
 * (matches Processing `hideHeaderMetrics` on Work → Overview).
 */

import { useEffect, useMemo, useState } from "react";

import WorkspaceOperationalHealth, {
    type WorkspaceOperationalHealthItem,
} from "@/components/workspace/WorkspaceOperationalHealth";
import type { MyTasksTaskRow } from "@/lib/agent/taskAssist/myTasksTaskTypes";
import {
    fetchOperationalTasksSummary,
    readJson,
} from "@/lib/agent/taskAssist/taskAssistV11OpportunityApi";
import {
    getCachedWorkspaceOperationalTasks,
    loadWorkspaceOperationalTasks,
} from "@/lib/agent/taskAssist/operationalTasksWorkspaceCache";

type TaskCounts = {
    due_soon: number;
    overdue: number;
    assigned: number;
    unassigned: number;
};

/** Static trend placeholders until historical comparison APIs exist. */
const QUEUE_TRENDS = {
    assigned: { direction: "none" as const, label: "—" },
    unassigned: { direction: "none" as const, label: "—" },
    due_soon: { direction: "none" as const, label: "—" },
    overdue: { direction: "none" as const, label: "—", tone: "ember" as const },
};

function isOpenTask(task: MyTasksTaskRow): boolean {
    return task.status !== "completed" && task.status !== "cancelled";
}

/**
 * ONE POPULATION, SPLIT BY ASSIGNMENT — and named for what the split actually asks.
 *
 * The second bucket is every open task with no assignee. It was labelled `Waiting`, which named a
 * state this product does not have: there is no waiting column, no domain-authoritative blocked
 * signal, and `filterTasksByView` returns `[]` for the `waiting` lens unconditionally. An operator
 * reading `Waiting` was told work was blocked on something when the only fact measured is that
 * nobody owns it yet. The count is unchanged; only the question it answers is stated honestly.
 */
function deriveQueueAssignmentCounts(tasks: MyTasksTaskRow[]): { assigned: number; unassigned: number } {
    const open = tasks.filter(isOpenTask);
    let assigned = 0;
    let unassigned = 0;
    for (const task of open) {
        if (task.assigned_to_user_id?.trim()) assigned += 1;
        else unassigned += 1;
    }
    return { assigned, unassigned };
}

export default function WorkItemsKpiStrip() {
    const [counts, setCounts] = useState<TaskCounts | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const cachedOpen = getCachedWorkspaceOperationalTasks("open") as MyTasksTaskRow[] | null;
                if (cachedOpen && !cancelled) {
                    setLoading(false);
                }

                // Warm-first + deduped: the open-tasks list coalesces with the panel + overview landing.
                const [summaryRes, openResult] = await Promise.all([
                    fetchOperationalTasksSummary(),
                    loadWorkspaceOperationalTasks("open"),
                ]);

                const summaryJson = await readJson<{ ok?: boolean; counts?: { due_soon: number; overdue: number } }>(
                    summaryRes
                );

                if (cancelled) return;

                const openRows = openResult.tasks ?? cachedOpen ?? [];
                const { assigned, unassigned } = deriveQueueAssignmentCounts(openRows);

                if (summaryRes.ok && summaryJson.ok && summaryJson.counts) {
                    setCounts({
                        due_soon: summaryJson.counts.due_soon,
                        overdue: summaryJson.counts.overdue,
                        assigned,
                        unassigned,
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

    const empty: TaskCounts = { due_soon: 0, overdue: 0, assigned: 0, unassigned: 0 };
    const c = counts ?? empty;

    const items: WorkspaceOperationalHealthItem[] = useMemo(
        () => [
            /*
             * `Tasks assigned`, not `All assigned`: this band counts `operational_tasks` only and is
             * always org-wide, while the view rail merges three sources and honours the selected
             * site. Naming the population keeps the two metrics from reading as one comparable pair.
             * The KEY stays `assigned`.
             */
            { key: "assigned", label: "Tasks assigned", value: String(c.assigned), tone: "pine", trend: QUEUE_TRENDS.assigned },
            {
                key: "unassigned",
                label: "Unassigned",
                value: String(c.unassigned),
                tone: "gold",
                trend: QUEUE_TRENDS.unassigned,
            },
            { key: "due_soon", label: "Due Soon", value: String(c.due_soon), tone: "gold", trend: QUEUE_TRENDS.due_soon },
            { key: "overdue", label: "Overdue", value: String(c.overdue), tone: "ember", trend: QUEUE_TRENDS.overdue },
        ],
        [c.assigned, c.unassigned, c.due_soon, c.overdue]
    );

    return (
        <WorkspaceOperationalHealth
            eyebrow="Queue"
            items={items}
            loading={loading}
            ariaLabel="Work Items queue operational health"
            className="w-full"
            data-testid="work-items-kpi-band"
        />
    );
}
