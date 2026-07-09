"use client";

/**
 * Work Items → Work mode metrics band.
 *
 * Data-only adapter: derives counts from operational task APIs and renders `WorkspaceMetricTiles`.
 */

import { useEffect, useState } from "react";

import WorkspaceMetricTiles, { type WorkspaceMetricTileItem } from "@/components/workspace/WorkspaceMetricTiles";
import { WS_METRIC_EYEBROW_INLINE } from "@/components/workspace/workspaceTokens";
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

function toMetricItems(counts: TaskCounts): WorkspaceMetricTileItem[] {
    return [
        { key: "open", label: "Open tasks", value: String(counts.open), icon: "clipboard", accent: "pine", status: "healthy" },
        { key: "due_today", label: "Due today", value: String(counts.due_today), icon: "calendar", accent: "gold", status: "warning" },
        { key: "due_soon", label: "Due soon", value: String(counts.due_soon), icon: "bolt", accent: "gold", status: "warning" },
        { key: "overdue", label: "Overdue", value: String(counts.overdue), icon: "shield", accent: "ember", status: "critical" },
        { key: "completed_today", label: "Completed today", value: String(counts.completed_today), icon: "book", accent: "midnight", status: "unknown" },
    ];
}

export default function WorkItemsKpiStrip() {
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

                const [summaryRes, dueTodayRes, completedRes] = await Promise.all([
                    fetchOperationalTasksSummary(),
                    fetchWorkspaceOperationalTasks("due_today"),
                    fetchWorkspaceOperationalTasks("completed"),
                ]);

                const summaryJson = await readJson<{ ok?: boolean; counts?: { open: number; due_soon: number; overdue: number } }>(
                    summaryRes
                );
                const dueTodayJson = await readJson<{ ok?: boolean; tasks?: MyTasksTaskRow[] }>(dueTodayRes);
                const completedJson = await readJson<{ ok?: boolean; tasks?: MyTasksTaskRow[] }>(completedRes);

                if (cancelled) return;

                const dueTodayRows = Array.isArray(dueTodayJson.tasks) ? dueTodayJson.tasks : [];
                const completedRows = Array.isArray(completedJson.tasks) ? completedJson.tasks : [];

                if (summaryRes.ok && summaryJson.ok && summaryJson.counts) {
                    setCounts({
                        open: summaryJson.counts.open,
                        due_soon: summaryJson.counts.due_soon,
                        overdue: summaryJson.counts.overdue,
                        due_today: dueTodayRows.length,
                        completed_today: completedRows.filter((t) => isToday(t.created_at)).length,
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

    const items = toMetricItems(
        counts ?? { open: 0, due_today: 0, due_soon: 0, overdue: 0, completed_today: 0 }
    );

    return (
        <div className="flex w-full min-w-0 items-center gap-3" data-testid="work-items-kpi-band">
            <p className={WS_METRIC_EYEBROW_INLINE}>
                <span className="h-1.5 w-1.5 shrink-0 rotate-45 bg-alloy-midnight/45" aria-hidden />
                Today&apos;s activity
            </p>
            <WorkspaceMetricTiles items={items} size="md" align="start" loading={loading} ariaLabel="Work Items metrics" className="min-w-0 flex-1" />
        </div>
    );
}
