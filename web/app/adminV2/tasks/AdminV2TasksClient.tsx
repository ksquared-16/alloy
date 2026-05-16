"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import {
    ADMIN_V2_OPPORTUNITY_FOCUS_OPERATIONAL_TASKS,
    ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH,
} from "@/lib/adminV2/opportunityDrawerTaskEvents";
import { formatTaskAssistClientError } from "@/lib/agent/taskAssist/taskAssistClientErrorMessages";
import {
    fetchWorkspaceOperationalTasks,
    patchOperationalTaskStatus,
    readJson,
    type OperationalTaskWorkspaceFilter,
} from "@/lib/agent/taskAssist/taskAssistV11OpportunityApi";
import { isTaskAssistV1UiEnabled } from "@/lib/agent/taskAssist/taskAssistV1UiGate";

type TaskRow = {
    id: string;
    title: string;
    description: string | null;
    due_at: string;
    status: string;
    source: string;
    entity_id: string;
    entity_type: string;
    created_at: string;
};

const FILTERS: { key: OperationalTaskWorkspaceFilter; label: string }[] = [
    { key: "open", label: "Open" },
    { key: "due_today", label: "Due today" },
    { key: "overdue", label: "Overdue" },
    { key: "completed", label: "Completed" },
];

function formatDue(iso: string): string {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return iso;
    return new Date(t).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    });
}

/**
 * Lightweight org task list — in-app visibility for Task Assist operational_tasks (V1).
 * Future channels (not in scope): email digest, SMS/Slack, push — see operations hub copy.
 */
export default function AdminV2TasksClient() {
    const v11 = isTaskAssistV1UiEnabled();
    const adminDrawer = useAdminDrawer();
    const [filter, setFilter] = useState<OperationalTaskWorkspaceFilter>("open");
    const [tasks, setTasks] = useState<TaskRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [actionId, setActionId] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!v11) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetchWorkspaceOperationalTasks(filter);
            const json = await readJson<{ ok?: boolean; tasks?: TaskRow[]; error?: string; message?: string }>(res);
            if (!res.ok || !json.ok || !Array.isArray(json.tasks)) {
                throw new Error(formatTaskAssistClientError(json.message || json.error, json.error));
            }
            setTasks(json.tasks);
        } catch (e: unknown) {
            setError(formatTaskAssistClientError((e as Error).message));
            setTasks([]);
        } finally {
            setLoading(false);
        }
    }, [filter, v11]);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        const onRefresh = () => void load();
        window.addEventListener(ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH, onRefresh);
        return () => window.removeEventListener(ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH, onRefresh);
    }, [load]);

    const onOpenRecord = useCallback(
        (task: TaskRow) => {
            if (task.entity_type !== "opportunities") return;
            adminDrawer?.openDrawer({
                type: "opportunities",
                id: task.entity_id,
                opportunityWorkspaceContext: null,
            });
            if (typeof window !== "undefined") {
                window.dispatchEvent(
                    new CustomEvent(ADMIN_V2_OPPORTUNITY_FOCUS_OPERATIONAL_TASKS, {
                        detail: { opportunity_id: task.entity_id, task_id: task.id },
                    })
                );
            }
        },
        [adminDrawer]
    );

    const onPatch = useCallback(
        async (id: string, status: "completed" | "canceled") => {
            setActionId(id);
            try {
                const res = await patchOperationalTaskStatus(id, status);
                const json = await readJson<{ ok?: boolean; error?: string; message?: string }>(res);
                if (!res.ok || !json.ok) throw new Error(formatTaskAssistClientError(json.message || json.error, json.error));
                await load();
                if (typeof window !== "undefined") {
                    window.dispatchEvent(
                        new CustomEvent(ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH, {
                            detail: { opportunity_id: "" },
                        })
                    );
                }
            } catch (e: unknown) {
                setError(formatTaskAssistClientError((e as Error).message));
            } finally {
                setActionId(null);
            }
        },
        [load]
    );

    const emptyLabel = useMemo(() => {
        switch (filter) {
            case "due_today":
                return "No tasks due today.";
            case "overdue":
                return "No overdue tasks.";
            case "completed":
                return "No completed or dismissed tasks.";
            default:
                return "No open tasks. Create reminders from Task Assist in the command bar.";
        }
    }, [filter]);

    if (!v11) {
        return (
            <p className="text-sm text-alloy-midnight/70">Task Assist is not enabled for this workspace.</p>
        );
    }

    return (
        <div className="space-y-4" data-adminv2-tasks-page="true">
            <header>
                <h1 className="text-xl font-semibold tracking-tight text-alloy-midnight">My tasks</h1>
                <p className="mt-1 text-xs text-alloy-midnight/60">
                    Follow-ups and reminders from Task Assist. In-app list only for V1 — email digest and mobile push are
                    planned later.
                </p>
            </header>

            <div className="flex flex-wrap gap-1.5">
                {FILTERS.map((f) => (
                    <button
                        key={f.key}
                        type="button"
                        onClick={() => setFilter(f.key)}
                        className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
                            filter === f.key ?
                                "border-alloy-midnight/30 bg-alloy-midnight/90 text-white"
                            :   "border-alloy-stone/25 bg-white text-alloy-midnight/75 hover:bg-alloy-stone/[0.06]"
                        }`}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {error ? (
                <p className="text-sm font-medium text-red-800/90" role="alert">
                    {error}
                </p>
            ) : null}
            {loading ? <p className="text-sm text-alloy-midnight/60">Loading tasks…</p> : null}
            {!loading && tasks.length === 0 ? <p className="text-sm text-alloy-midnight/60">{emptyLabel}</p> : null}

            <ul className="space-y-2">
                {tasks.map((t) => (
                    <li
                        key={t.id}
                        className="rounded-lg border border-alloy-stone/15 bg-white px-3 py-2.5 text-[12px] shadow-sm"
                        data-adminv2-task-row={t.id}
                    >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                                <div className="font-semibold text-alloy-midnight/90">{t.title}</div>
                                <div className="mt-0.5 text-[11px] text-alloy-midnight/65">
                                    Due {formatDue(t.due_at)} · {t.source} · {t.status}
                                </div>
                                {t.description?.trim() ? (
                                    <p className="mt-1 text-[11px] text-alloy-midnight/60 line-clamp-2">{t.description}</p>
                                ) : null}
                            </div>
                            <div className="flex shrink-0 flex-wrap gap-1">
                                <button
                                    type="button"
                                    className="rounded-md border border-alloy-stone/30 px-2 py-1 text-[10px] font-semibold"
                                    onClick={() => onOpenRecord(t)}
                                >
                                    Open record
                                </button>
                                {t.status === "open" ? (
                                    <>
                                        <button
                                            type="button"
                                            disabled={actionId === t.id}
                                            className="rounded-md bg-alloy-midnight/90 px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-45"
                                            onClick={() => void onPatch(t.id, "completed")}
                                        >
                                            Complete
                                        </button>
                                        <button
                                            type="button"
                                            disabled={actionId === t.id}
                                            className="rounded-md border border-alloy-stone/30 px-2 py-1 text-[10px] font-semibold disabled:opacity-45"
                                            onClick={() => void onPatch(t.id, "canceled")}
                                        >
                                            Dismiss
                                        </button>
                                    </>
                                ) : null}
                            </div>
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}
