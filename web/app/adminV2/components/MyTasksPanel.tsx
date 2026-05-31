"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ListTodo } from "lucide-react";

import MyTasksTaskCard from "@/app/adminV2/components/MyTasksTaskCard";
import { useAdminDrawerOptional } from "@/contexts/AdminDrawerContext";
import { useGlobalAssistantOptional } from "@/contexts/GlobalAssistantContext";
import {
    ADMIN_V2_OPPORTUNITY_FOCUS_OPERATIONAL_TASKS,
    ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH,
} from "@/lib/adminV2/opportunityDrawerTaskEvents";
import { formatTaskAssistClientError } from "@/lib/agent/taskAssist/taskAssistClientErrorMessages";
import { operationalTaskDueToLocalInput } from "@/lib/agent/taskAssist/formatOperationalTaskSourceLabel";
import {
    buildOperationalTaskBody,
    createOperationalTask,
    fetchWorkspaceOperationalTasks,
    patchOperationalTaskFields,
    patchOperationalTaskStatus,
    readJson,
    type OperationalTaskWorkspaceFilter,
} from "@/lib/agent/taskAssist/taskAssistV11OpportunityApi";
import {
    getCachedWorkspaceOperationalTasks,
    setCachedWorkspaceOperationalTasks,
} from "@/lib/agent/taskAssist/operationalTasksWorkspaceCache";
import { isTaskAssistV1UiEnabled } from "@/lib/agent/taskAssist/taskAssistV1UiGate";
import type { MyTasksTaskRow } from "@/lib/agent/taskAssist/myTasksTaskTypes";
import { minDatetimeLocalValue } from "@/components/admin/taskAssist/TaskAssistOpportunityWorkspace";

export type { MyTasksTaskRow };

const FILTERS: { key: OperationalTaskWorkspaceFilter; label: string }[] = [
    { key: "open", label: "Open" },
    { key: "due_today", label: "Due today" },
    { key: "overdue", label: "Overdue" },
    { key: "completed", label: "Completed" },
];

const FILTER_TAB_ACTIVE =
    "border-alloy-midnight/25 bg-alloy-midnight text-white shadow-sm";
const FILTER_TAB_IDLE =
    "border-alloy-stone/22 bg-white text-alloy-midnight/75 hover:border-alloy-stone/35 hover:bg-alloy-stone/[0.04]";

function MyTasksLoadingState() {
    return (
        <div className="space-y-2.5 py-1" aria-busy="true" data-adminv2-tasks-loading="true">
            {[0, 1, 2].map((i) => (
                <div
                    key={i}
                    className="animate-pulse rounded-xl border border-alloy-stone/12 bg-white p-3.5 shadow-sm"
                >
                    <div className="h-3.5 w-2/5 rounded bg-alloy-stone/15" />
                    <div className="mt-2 h-3 w-1/3 rounded bg-alloy-stone/10" />
                    <div className="mt-3 h-7 w-3/5 rounded bg-alloy-stone/10" />
                </div>
            ))}
        </div>
    );
}

function MyTasksEmptyState({ message }: { message: string }) {
    return (
        <div
            className="flex flex-col items-center justify-center rounded-xl border border-dashed border-alloy-stone/22 bg-white/80 px-6 py-10 text-center shadow-sm"
            data-adminv2-tasks-empty="true"
        >
            <ListTodo className="mb-2 h-8 w-8 text-alloy-midnight/25" aria-hidden strokeWidth={1.5} />
            <p className="text-[13px] font-medium text-alloy-midnight/75">{message}</p>
            <p className="mt-1 max-w-sm text-[11px] leading-snug text-alloy-midnight/48">
                Tasks linked to inquiries appear here. Use New task when an opportunity is open in the workspace.
            </p>
        </div>
    );
}

export type MyTasksPanelProps = {
    compact?: boolean;
    onClose?: () => void;
    /** Modal header summary — current filter result count. */
    onFilterCountChange?: (count: number) => void;
};

export default function MyTasksPanel({ compact = false, onClose, onFilterCountChange }: MyTasksPanelProps) {
    const v11 = isTaskAssistV1UiEnabled();
    const adminDrawer = useAdminDrawerOptional();
    const globalAssistant = useGlobalAssistantOptional();
    const linkedOpportunityId =
        globalAssistant?.currentContext?.entity_type === "opportunities" ?
            globalAssistant.currentContext.entity_id?.trim() || null
        :   null;
    const [filter, setFilter] = useState<OperationalTaskWorkspaceFilter>("open");
    const [tasks, setTasks] = useState<MyTasksTaskRow[]>(
        () => getCachedWorkspaceOperationalTasks("open") ?? []
    );
    const [loading, setLoading] = useState(() => getCachedWorkspaceOperationalTasks("open") == null);
    const [error, setError] = useState<string | null>(null);
    const [actionId, setActionId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [rescheduleId, setRescheduleId] = useState<string | null>(null);
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
        const cached = getCachedWorkspaceOperationalTasks(filter);
        if (cached) {
            setTasks(cached);
            setLoading(false);
        } else {
            setLoading(true);
        }
        setError(null);
        try {
            const res = await fetchWorkspaceOperationalTasks(filter);
            const json = await readJson<{ ok?: boolean; tasks?: MyTasksTaskRow[]; error?: string; message?: string }>(res);
            if (!res.ok || !json.ok) {
                throw new Error(formatTaskAssistClientError(json.message || json.error, json.error));
            }
            const rows = Array.isArray(json.tasks) ? json.tasks : [];
            setTasks(rows);
            setCachedWorkspaceOperationalTasks(filter, rows);
        } catch (e: unknown) {
            setError(formatTaskAssistClientError((e as Error).message));
            if (!cached) setTasks([]);
        } finally {
            setLoading(false);
        }
    }, [filter, v11]);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        onFilterCountChange?.(tasks.length);
    }, [onFilterCountChange, tasks.length]);

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

    const clearForms = useCallback(() => {
        setEditingId(null);
        setRescheduleId(null);
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
                clearForms();
                await load();
                dispatchRefresh();
            } catch (e: unknown) {
                setError(formatTaskAssistClientError((e as Error).message));
            } finally {
                setActionId(null);
            }
        },
        [clearForms, dispatchRefresh, load]
    );

    const startEdit = useCallback(
        (task: MyTasksTaskRow) => {
            setRescheduleId(null);
            setEditingId(task.id);
            setEditTitle(task.title);
            setEditDue(operationalTaskDueToLocalInput(task.due_at));
            setEditNotes(task.description ?? "");
        },
        []
    );

    const startReschedule = useCallback((task: MyTasksTaskRow) => {
        setEditingId(null);
        setRescheduleId(task.id);
        setEditDue(operationalTaskDueToLocalInput(task.due_at));
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
            clearForms();
            await load();
            dispatchRefresh();
        } catch (e: unknown) {
            setError(formatTaskAssistClientError((e as Error).message));
        } finally {
            setActionId(null);
        }
    }, [clearForms, dispatchRefresh, editDue, editNotes, editTitle, editingId, load]);

    const saveReschedule = useCallback(async () => {
        if (!rescheduleId) return;
        setActionId(rescheduleId);
        setError(null);
        try {
            const res = await patchOperationalTaskFields(rescheduleId, {
                due_at: new Date(editDue).toISOString(),
            });
            const json = await readJson<{ ok?: boolean; error?: string; message?: string }>(res);
            if (!res.ok || !json.ok) throw new Error(formatTaskAssistClientError(json.message || json.error, json.error));
            clearForms();
            await load();
            dispatchRefresh();
        } catch (e: unknown) {
            setError(formatTaskAssistClientError((e as Error).message));
        } finally {
            setActionId(null);
        }
    }, [clearForms, dispatchRefresh, editDue, load, rescheduleId]);

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
                return "No tasks due today";
            case "overdue":
                return "No overdue tasks";
            case "completed":
                return "No completed or dismissed tasks";
            default:
                return "No open tasks";
        }
    }, [filter]);

    if (!v11) {
        return <p className="text-sm text-alloy-midnight/70">Task Assist is not enabled.</p>;
    }

    const listRegionClass = compact ? "min-h-0 flex-1 overflow-y-auto pr-0.5" : "";

    return (
        <div
            className={`flex flex-col ${compact ? "min-h-0 flex-1 gap-3" : "gap-4"}`}
            data-adminv2-tasks-panel="true"
        >
            {!compact ? (
                <header>
                    <h1 className="text-xl font-semibold tracking-tight text-alloy-midnight">My tasks</h1>
                    <p className="mt-0.5 text-[12px] text-alloy-midnight/55">
                        Follow-ups and reminders linked to inquiries in your org.
                    </p>
                </header>
            ) : null}

            <div
                className={`flex shrink-0 flex-wrap items-center justify-between gap-2 ${compact ? "" : "rounded-xl border border-alloy-stone/15 bg-white p-2.5 shadow-sm"}`}
                data-adminv2-tasks-toolbar="true"
            >
                <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Task filters">
                    {FILTERS.map((f) => (
                        <button
                            key={f.key}
                            type="button"
                            role="tab"
                            aria-selected={filter === f.key}
                            onClick={() => {
                                setFilter(f.key);
                                clearForms();
                            }}
                            className={`rounded-full border px-3 py-1 text-[11px] font-semibold transition-colors ${
                                filter === f.key ? FILTER_TAB_ACTIVE : FILTER_TAB_IDLE
                            }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
                <button
                    type="button"
                    data-adminv2-new-task="true"
                    className="rounded-lg border border-alloy-stone/25 bg-white px-3 py-1 text-[11px] font-semibold text-alloy-blue shadow-sm hover:bg-alloy-blue/[0.05]"
                    onClick={() => setCreateOpen((o) => !o)}
                >
                    New task
                </button>
            </div>

            {createOpen ? (
                <div
                    className="shrink-0 space-y-2 rounded-xl border border-alloy-stone/15 bg-white p-3.5 text-[13px] shadow-sm"
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
                        className="w-full rounded-lg border border-alloy-stone/25 px-2.5 py-1.5 text-[13px]"
                    />
                    <input
                        type="datetime-local"
                        value={newDue}
                        min={minDatetimeLocalValue()}
                        onChange={(e) => setNewDue(e.target.value)}
                        className="w-full rounded-lg border border-alloy-stone/25 px-2.5 py-1.5 text-[13px]"
                    />
                    <textarea
                        rows={2}
                        placeholder="Notes (optional)"
                        value={newNotes}
                        onChange={(e) => setNewNotes(e.target.value)}
                        className="w-full resize-y rounded-lg border border-alloy-stone/25 px-2.5 py-1.5 text-[12px]"
                    />
                    <div className="flex flex-wrap gap-1.5">
                        <button
                            type="button"
                            disabled={createBusy || !linkedOpportunityId || !newTitle.trim() || !newDue.trim()}
                            className="rounded-md bg-alloy-midnight/90 px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-45"
                            onClick={() => void onCreateTask()}
                        >
                            Create task
                        </button>
                        <button
                            type="button"
                            className="rounded-md border border-alloy-stone/30 px-2.5 py-1 text-[11px] font-semibold"
                            onClick={() => setCreateOpen(false)}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            ) : null}

            {error ? (
                <div
                    className="shrink-0 rounded-lg border border-red-200/80 bg-red-50/90 px-3 py-2 text-[12px] font-medium text-red-900/90"
                    role="alert"
                    data-adminv2-tasks-error="true"
                >
                    {error}
                </div>
            ) : null}

            <div className={listRegionClass}>
                {loading && tasks.length === 0 ? <MyTasksLoadingState /> : null}
                {!loading && tasks.length === 0 ? <MyTasksEmptyState message={emptyLabel} /> : null}
                {tasks.length > 0 ? (
                    <ul className="space-y-2.5">
                        {tasks.map((t) => {
                            const mode =
                                editingId === t.id ? "edit"
                                : rescheduleId === t.id ? "reschedule"
                                : "view";
                            return (
                                <MyTasksTaskCard
                                    key={t.id}
                                    task={t}
                                    mode={mode}
                                    busy={actionId === t.id}
                                    canOpenRecord={t.entity_type === "opportunities" && adminDrawer != null}
                                    editTitle={editTitle}
                                    editDue={editDue}
                                    editNotes={editNotes}
                                    onEditTitleChange={setEditTitle}
                                    onEditDueChange={setEditDue}
                                    onEditNotesChange={setEditNotes}
                                    onComplete={() => void onPatchStatus(t.id, "completed")}
                                    onDismiss={() => void onPatchStatus(t.id, "canceled")}
                                    onStartEdit={() => startEdit(t)}
                                    onStartReschedule={() => startReschedule(t)}
                                    onSaveEdit={() => void saveEdit()}
                                    onSaveReschedule={() => void saveReschedule()}
                                    onCancelForm={clearForms}
                                    onOpenRecord={() => onOpenRecord(t)}
                                />
                            );
                        })}
                    </ul>
                ) : null}
            </div>
        </div>
    );
}
