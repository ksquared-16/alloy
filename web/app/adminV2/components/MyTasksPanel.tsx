"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useAdminDrawerOptional } from "@/contexts/AdminDrawerContext";
import { useGlobalAssistantOptional } from "@/contexts/GlobalAssistantContext";
import {
    ADMIN_V2_OPPORTUNITY_FOCUS_OPERATIONAL_TASKS,
    ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH,
} from "@/lib/adminV2/opportunityDrawerTaskEvents";
import { formatTaskAssistClientError } from "@/lib/agent/taskAssist/taskAssistClientErrorMessages";
import { operationalTaskUrgencyBadge } from "@/lib/agent/taskAssist/taskAssistOperationalUrgency";
import {
    buildOperationalTaskBody,
    createOperationalTask,
    fetchWorkspaceOperationalTasks,
    patchOperationalTaskFields,
    patchOperationalTaskStatus,
    readJson,
    type OperationalTaskWorkspaceFilter,
} from "@/lib/agent/taskAssist/taskAssistV11OpportunityApi";
import { isTaskAssistV1UiEnabled } from "@/lib/agent/taskAssist/taskAssistV1UiGate";
import { minDatetimeLocalValue } from "@/components/admin/taskAssist/TaskAssistOpportunityWorkspace";

export type MyTasksTaskRow = {
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

function dueToLocalInput(iso: string): string {
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return "";
    const d = new Date(t);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export type MyTasksPanelProps = {
    compact?: boolean;
    onClose?: () => void;
};

export default function MyTasksPanel({ compact = false, onClose }: MyTasksPanelProps) {
    const v11 = isTaskAssistV1UiEnabled();
    const adminDrawer = useAdminDrawerOptional();
    const globalAssistant = useGlobalAssistantOptional();
    const linkedOpportunityId =
        globalAssistant?.currentContext?.entity_type === "opportunities" ?
            globalAssistant.currentContext.entity_id?.trim() || null
        :   null;
    const [filter, setFilter] = useState<OperationalTaskWorkspaceFilter>("open");
    const [tasks, setTasks] = useState<MyTasksTaskRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [actionId, setActionId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState("");
    const [editDue, setEditDue] = useState("");
    const [editNotes, setEditNotes] = useState("");
    const [createOpen, setCreateOpen] = useState(false);
    const [newTitle, setNewTitle] = useState("");
    const [newDue, setNewDue] = useState("");
    const [newNotes, setNewNotes] = useState("");
    const [createBusy, setCreateBusy] = useState(false);

    const load = useCallback(async () => {
        if (!v11) return;
        setLoading(true);
        setError(null);
        try {
            const res = await fetchWorkspaceOperationalTasks(filter);
            const json = await readJson<{ ok?: boolean; tasks?: MyTasksTaskRow[]; error?: string; message?: string }>(res);
            if (!res.ok || !json.ok) {
                throw new Error(formatTaskAssistClientError(json.message || json.error, json.error));
            }
            setTasks(Array.isArray(json.tasks) ? json.tasks : []);
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

    const dispatchRefresh = useCallback(() => {
        if (typeof window !== "undefined") {
            window.dispatchEvent(
                new CustomEvent(ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH, { detail: { opportunity_id: "" } })
            );
        }
    }, []);

    const onOpenRecord = useCallback(
        (task: MyTasksTaskRow) => {
            if (task.entity_type !== "opportunities" || !adminDrawer) return;
            adminDrawer.openDrawer({
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
            onClose?.();
        },
        [adminDrawer, onClose]
    );

    const onPatchStatus = useCallback(
        async (id: string, status: "completed" | "canceled") => {
            setActionId(id);
            try {
                const res = await patchOperationalTaskStatus(id, status);
                const json = await readJson<{ ok?: boolean; error?: string; message?: string }>(res);
                if (!res.ok || !json.ok) throw new Error(formatTaskAssistClientError(json.message || json.error, json.error));
                await load();
                dispatchRefresh();
            } catch (e: unknown) {
                setError(formatTaskAssistClientError((e as Error).message));
            } finally {
                setActionId(null);
            }
        },
        [dispatchRefresh, load]
    );

    const startEdit = useCallback((task: MyTasksTaskRow) => {
        setEditingId(task.id);
        setEditTitle(task.title);
        setEditDue(dueToLocalInput(task.due_at));
        setEditNotes(task.description ?? "");
    }, []);

    const saveEdit = useCallback(async () => {
        if (!editingId) return;
        setActionId(editingId);
        setError(null);
        try {
            const res = await patchOperationalTaskFields(editingId, {
                title: editTitle,
                description: editNotes.trim() || null,
                due_at: new Date(editDue).toISOString(),
            });
            const json = await readJson<{ ok?: boolean; error?: string; message?: string }>(res);
            if (!res.ok || !json.ok) throw new Error(formatTaskAssistClientError(json.message || json.error, json.error));
            setEditingId(null);
            await load();
            dispatchRefresh();
        } catch (e: unknown) {
            setError(formatTaskAssistClientError((e as Error).message));
        } finally {
            setActionId(null);
        }
    }, [dispatchRefresh, editDue, editNotes, editTitle, editingId, load]);

    const onCreateTask = useCallback(async () => {
        if (!linkedOpportunityId || !newTitle.trim() || !newDue.trim()) return;
        setCreateBusy(true);
        setError(null);
        try {
            const body = buildOperationalTaskBody({
                entityId: linkedOpportunityId,
                title: newTitle,
                dueAtIso: new Date(newDue).toISOString(),
                description: newNotes,
                source: "manual",
                proposalId: null,
            });
            const res = await createOperationalTask(body);
            const json = await readJson<{ ok?: boolean; error?: string; message?: string }>(res);
            if (!res.ok || !json.ok) throw new Error(formatTaskAssistClientError(json.message || json.error, json.error));
            setCreateOpen(false);
            setNewTitle("");
            setNewDue("");
            setNewNotes("");
            await load();
            dispatchRefresh();
        } catch (e: unknown) {
            setError(formatTaskAssistClientError((e as Error).message));
        } finally {
            setCreateBusy(false);
        }
    }, [dispatchRefresh, linkedOpportunityId, load, newDue, newNotes, newTitle]);

    const emptyLabel = useMemo(() => {
        switch (filter) {
            case "due_today":
                return "No tasks due today.";
            case "overdue":
                return "No overdue tasks.";
            case "completed":
                return "No completed or dismissed tasks.";
            default:
                return "No open tasks.";
        }
    }, [filter]);

    if (!v11) {
        return <p className="text-sm text-alloy-midnight/70">Task Assist is not enabled.</p>;
    }

    return (
        <div className={`flex flex-col ${compact ? "min-h-0" : "space-y-4"}`} data-adminv2-tasks-panel="true">
            {!compact ? (
                <header>
                    <h1 className="text-xl font-semibold tracking-tight text-alloy-midnight">My tasks</h1>
                </header>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2">
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
                <button
                    type="button"
                    data-adminv2-new-task="true"
                    className="rounded-md border border-alloy-stone/30 bg-white px-2.5 py-1 text-[11px] font-semibold text-alloy-blue hover:bg-alloy-stone/[0.04]"
                    onClick={() => setCreateOpen((o) => !o)}
                >
                    New task
                </button>
            </div>

            {createOpen ? (
                <div
                    className="space-y-2 rounded-lg border border-alloy-stone/15 bg-white p-3 text-[12px] shadow-sm"
                    data-adminv2-create-task-form="true"
                >
                    {linkedOpportunityId ? (
                        <p className="text-[11px] text-alloy-midnight/60">
                            Creates a follow-up task on the opportunity you have open in the workspace.
                        </p>
                    ) : (
                        <p className="text-[11px] text-amber-900/85">
                            Open an opportunity record first, or create a task from the command bar. Tasks must be linked to
                            an opportunity.
                        </p>
                    )}
                    <input
                        type="text"
                        placeholder="Title"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        className="w-full rounded border border-alloy-stone/25 px-2 py-1 text-[12px]"
                    />
                    <input
                        type="datetime-local"
                        value={newDue}
                        min={minDatetimeLocalValue()}
                        onChange={(e) => setNewDue(e.target.value)}
                        className="w-full rounded border border-alloy-stone/25 px-2 py-1 text-[12px]"
                    />
                    <textarea
                        rows={2}
                        placeholder="Notes (optional)"
                        value={newNotes}
                        onChange={(e) => setNewNotes(e.target.value)}
                        className="w-full resize-y rounded border border-alloy-stone/25 px-2 py-1 text-[11px]"
                    />
                    <div className="flex flex-wrap gap-1">
                        <button
                            type="button"
                            disabled={createBusy || !linkedOpportunityId || !newTitle.trim() || !newDue.trim()}
                            className="rounded-md bg-alloy-midnight/90 px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-45"
                            onClick={() => void onCreateTask()}
                        >
                            Create task
                        </button>
                        <button
                            type="button"
                            className="rounded-md border border-alloy-stone/30 px-2 py-1 text-[10px] font-semibold"
                            onClick={() => setCreateOpen(false)}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            ) : null}

            {error ? (
                <p className="text-sm font-medium text-red-800/90" role="alert">
                    {error}
                </p>
            ) : null}
            {loading ? <p className="text-sm text-alloy-midnight/60">Loading tasks…</p> : null}
            {!loading && tasks.length === 0 ? <p className="text-sm text-alloy-midnight/60">{emptyLabel}</p> : null}

            <ul className={`space-y-2 ${compact ? "max-h-[min(52vh,420px)] overflow-y-auto pr-1" : ""}`}>
                {tasks.map((t) => {
                    const badge = operationalTaskUrgencyBadge(t);
                    const editing = editingId === t.id;
                    return (
                        <li
                            key={t.id}
                            className="rounded-lg border border-alloy-stone/15 bg-white px-3 py-2.5 text-[12px] shadow-sm"
                            data-adminv2-task-row={t.id}
                        >
                            {editing ? (
                                <div className="space-y-2">
                                    <input
                                        type="text"
                                        value={editTitle}
                                        onChange={(e) => setEditTitle(e.target.value)}
                                        className="w-full rounded border border-alloy-stone/25 px-2 py-1 text-[12px]"
                                    />
                                    <input
                                        type="datetime-local"
                                        value={editDue}
                                        min={minDatetimeLocalValue()}
                                        onChange={(e) => setEditDue(e.target.value)}
                                        className="w-full rounded border border-alloy-stone/25 px-2 py-1 text-[12px]"
                                    />
                                    <textarea
                                        rows={2}
                                        value={editNotes}
                                        onChange={(e) => setEditNotes(e.target.value)}
                                        className="w-full resize-y rounded border border-alloy-stone/25 px-2 py-1 text-[11px]"
                                        placeholder="Notes"
                                    />
                                    <div className="flex flex-wrap gap-1">
                                        <button
                                            type="button"
                                            disabled={actionId === t.id}
                                            className="rounded-md bg-alloy-midnight/90 px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-45"
                                            onClick={() => void saveEdit()}
                                        >
                                            Save
                                        </button>
                                        <button
                                            type="button"
                                            className="rounded-md border border-alloy-stone/30 px-2 py-1 text-[10px] font-semibold"
                                            onClick={() => setEditingId(null)}
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                <span className="font-semibold text-alloy-midnight/90">{t.title}</span>
                                                <span
                                                    className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${badge.className}`}
                                                >
                                                    {badge.label}
                                                </span>
                                            </div>
                                            <div className="mt-0.5 text-[11px] text-alloy-midnight/65">
                                                Due {formatDue(t.due_at)} · {t.source}
                                            </div>
                                            {t.description?.trim() ? (
                                                <p className="mt-1 line-clamp-2 text-[11px] text-alloy-midnight/60">{t.description}</p>
                                            ) : null}
                                        </div>
                                        <div className="flex shrink-0 flex-wrap gap-1">
                                            {t.entity_type === "opportunities" && adminDrawer ? (
                                                <button
                                                    type="button"
                                                    className="rounded-md border border-alloy-stone/30 px-2 py-1 text-[10px] font-semibold"
                                                    onClick={() => onOpenRecord(t)}
                                                >
                                                    Open record
                                                </button>
                                            ) : null}
                                            {t.status === "open" ? (
                                                <>
                                                    <button
                                                        type="button"
                                                        className="rounded-md border border-alloy-stone/30 px-2 py-1 text-[10px] font-semibold text-alloy-blue"
                                                        onClick={() => startEdit(t)}
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={actionId === t.id}
                                                        className="rounded-md bg-alloy-midnight/90 px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-45"
                                                        onClick={() => void onPatchStatus(t.id, "completed")}
                                                    >
                                                        Complete
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={actionId === t.id}
                                                        className="rounded-md border border-alloy-stone/30 px-2 py-1 text-[10px] font-semibold disabled:opacity-45"
                                                        onClick={() => void onPatchStatus(t.id, "canceled")}
                                                    >
                                                        Dismiss
                                                    </button>
                                                </>
                                            ) : null}
                                        </div>
                                    </div>
                                </>
                            )}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
