"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ListTodo } from "lucide-react";

import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { defaultOperationalWorkDueLocal } from "@/lib/admin/operationalWork/operationalWorkDateTimeLocal";
import MyTasksCreateTaskCard, {
    type MyTasksCreateLinkMode,
    type MyTasksCreateLinkedRecord,
} from "@/app/adminV2/components/MyTasksCreateTaskCard";
import MyTasksTaskCard from "@/app/adminV2/components/MyTasksTaskCard";
import { useAdminDrawerOptional } from "@/contexts/AdminDrawerContext";
import { useEntityLabelsOptional } from "@/contexts/EntityLabelsContext";
import { useGlobalAssistantOptional } from "@/contexts/GlobalAssistantContext";
import { useWorkspaceSiteFilter } from "@/contexts/WorkspaceSiteFilterContext";
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
import { isOperationalWorkV1Enabled } from "@/lib/admin/operationalWork/operationalWorkV1UiGate";
import type { MyTasksTaskRow } from "@/lib/agent/taskAssist/myTasksTaskTypes";
import {
    applyEntityLabelToMyTasksCopy,
    buildMyTasksPresentationLabels,
    myTasksRowMatchesSearch,
} from "@/lib/agent/taskAssist/myTasksPresentationLabels";

export type { MyTasksTaskRow };

const FILTERS: { key: OperationalTaskWorkspaceFilter; label: string }[] = [
    { key: "open", label: "Open" },
    { key: "assigned_to_me", label: "Mine" },
    { key: "unassigned", label: "Unassigned" },
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

function MyTasksEmptyState({ message, helper }: { message: string; helper: string }) {
    return (
        <div
            className="flex flex-col items-center justify-center rounded-xl border border-dashed border-alloy-stone/22 bg-white/80 px-6 py-10 text-center shadow-sm"
            data-adminv2-tasks-empty="true"
        >
            <ListTodo className="mb-2 h-8 w-8 text-alloy-midnight/25" aria-hidden strokeWidth={1.5} />
            <p className="text-[13px] font-medium text-alloy-midnight/75">{message}</p>
            <p className="mt-1 max-w-sm text-[11px] leading-snug text-alloy-midnight/48">{helper}</p>
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
    const workEnabled = isOperationalWorkV1Enabled();
    const { userId } = useAdminAuth();
    const { labels: entityLabels } = useEntityLabelsOptional();
    const siteFilter = useWorkspaceSiteFilter();
    const adminDrawer = useAdminDrawerOptional();
    const globalAssistant = useGlobalAssistantOptional();
    const linkedOpportunityId =
        globalAssistant?.currentContext?.entity_type === "opportunities" ?
            globalAssistant.currentContext.entity_id?.trim() || null
        :   null;
    const linkedRecordLabel = globalAssistant?.currentContext?.label?.trim() || null;
    const contextPrefill = useMemo<MyTasksCreateLinkedRecord | null>(() => {
        if (!linkedOpportunityId) return null;
        return {
            entity_type: "opportunities",
            entity_id: linkedOpportunityId,
            label: linkedRecordLabel || "Open record",
        };
    }, [linkedOpportunityId, linkedRecordLabel]);

    const [filter, setFilter] = useState<OperationalTaskWorkspaceFilter>("open");
    const [searchQuery, setSearchQuery] = useState("");
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
    const [createLinkMode, setCreateLinkMode] = useState<MyTasksCreateLinkMode>("general");
    const [createLinkedRecord, setCreateLinkedRecord] = useState<MyTasksCreateLinkedRecord | null>(null);
    const [newTitle, setNewTitle] = useState("");
    const [newDue, setNewDue] = useState(defaultOperationalWorkDueLocal);
    const [newNotes, setNewNotes] = useState("");
    const [newAssignedToUserId, setNewAssignedToUserId] = useState<string | null>(null);
    const [editAssignedToUserId, setEditAssignedToUserId] = useState<string | null>(null);
    const [createBusy, setCreateBusy] = useState(false);

    const resetCreateForm = useCallback(() => {
        setNewTitle("");
        setNewDue(defaultOperationalWorkDueLocal());
        setNewNotes("");
        setNewAssignedToUserId(userId?.trim() || null);
        setCreateLinkMode(contextPrefill ? "linked" : "general");
        setCreateLinkedRecord(contextPrefill);
    }, [contextPrefill, userId]);

    const openCreateForm = useCallback(() => {
        resetCreateForm();
        setCreateOpen(true);
    }, [resetCreateForm]);

    const load = useCallback(async () => {
        if (!workEnabled) return;
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
    }, [filter, workEnabled]);

    useEffect(() => {
        void load();
    }, [load]);

    const presentation = useMemo(() => {
        const guardianFromTasks = tasks.find((t) => t.contact_field_label?.trim())?.contact_field_label ?? null;
        return buildMyTasksPresentationLabels(entityLabels, guardianFromTasks);
    }, [entityLabels, tasks]);

    const selectedSiteId = siteFilter?.selectedSiteId ?? null;

    const siteScopedTasks = useMemo(() => {
        if (!selectedSiteId) return tasks;
        return tasks.filter((t) => {
            const loc = t.location_id?.trim();
            return !loc || loc === selectedSiteId;
        });
    }, [selectedSiteId, tasks]);

    const visibleTasks = useMemo(() => {
        const q = searchQuery.trim();
        if (!q) return siteScopedTasks;
        return siteScopedTasks.filter((t) => myTasksRowMatchesSearch(t, q, entityLabels));
    }, [entityLabels, searchQuery, siteScopedTasks]);

    const opportunityEntitySingular = presentation.opportunityEntitySingular;

    useEffect(() => {
        onFilterCountChange?.(visibleTasks.length);
    }, [onFilterCountChange, visibleTasks.length]);

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
        setEditTitle("");
        setEditDue("");
        setEditNotes("");
        setEditAssignedToUserId(null);
    }, []);

    const onOpenRecord = useCallback(
        (task: MyTasksTaskRow) => {
            if (task.entity_type !== "opportunities" || !task.entity_id?.trim() || !adminDrawer) return;
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
            setEditAssignedToUserId(task.assigned_to_user_id ?? null);
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
                assigned_to_user_id: editAssignedToUserId,
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
    }, [clearForms, dispatchRefresh, editAssignedToUserId, editDue, editNotes, editTitle, editingId, load]);

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
        if (!newTitle.trim() || !newDue.trim()) return;
        if (createLinkMode === "linked" && !createLinkedRecord?.entity_id) return;
        setCreateBusy(true);
        setError(null);
        try {
            const body = buildOperationalTaskBody({
                entityId: createLinkMode === "linked" ? createLinkedRecord?.entity_id ?? null : null,
                title: newTitle,
                dueAtIso: new Date(newDue).toISOString(),
                description: newNotes,
                source: "manual",
                proposalId: null,
                assignedToUserId: newAssignedToUserId,
            });
            const res = await createOperationalTask(body);
            const json = await readJson<{ ok?: boolean; error?: string; message?: string }>(res);
            if (!res.ok || !json.ok) throw new Error(formatTaskAssistClientError(json.message || json.error, json.error));
            setCreateOpen(false);
            resetCreateForm();
            await load();
            dispatchRefresh();
        } catch (e: unknown) {
            setError(formatTaskAssistClientError((e as Error).message));
        } finally {
            setCreateBusy(false);
        }
    }, [createLinkMode, createLinkedRecord, dispatchRefresh, load, newAssignedToUserId, newDue, newNotes, newTitle, resetCreateForm]);

    const emptyLabel = useMemo(() => {
        switch (filter) {
            case "due_today":
                return "No tasks due today";
            case "overdue":
                return "No overdue tasks";
            case "assigned_to_me":
                return "Nothing assigned to you";
            case "unassigned":
                return "No unassigned tasks";
            case "completed":
                return "No completed or dismissed tasks";
            default:
                return "No open tasks";
        }
    }, [filter]);

    if (!workEnabled) {
        return <p className="text-sm text-alloy-midnight/70">Operational work is not enabled.</p>;
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
                        Follow-ups and reminders linked to {opportunityEntitySingular.toLowerCase()}s in your org.
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
                    onClick={() => (createOpen ? setCreateOpen(false) : openCreateForm())}
                >
                    New task
                </button>
            </div>

            <div className="shrink-0" data-adminv2-tasks-search="true">
                <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search tasks, records, households, children…"
                    className="w-full rounded-lg border border-alloy-stone/22 bg-white px-3 py-2 text-[12px] text-alloy-midnight/85 shadow-sm placeholder:text-alloy-midnight/40"
                    aria-label="Search tasks"
                />
            </div>

            <MyTasksCreateTaskCard
                open={createOpen}
                presentation={presentation}
                linkMode={createLinkMode}
                linkedRecord={createLinkedRecord}
                contextPrefill={contextPrefill}
                workspaceSiteId={selectedSiteId}
                title={newTitle}
                due={newDue}
                notes={newNotes}
                assignedToUserId={newAssignedToUserId}
                busy={createBusy}
                onLinkModeChange={setCreateLinkMode}
                onLinkedRecordChange={setCreateLinkedRecord}
                onTitleChange={setNewTitle}
                onDueChange={setNewDue}
                onNotesChange={setNewNotes}
                onAssignedToUserIdChange={setNewAssignedToUserId}
                onCreate={() => void onCreateTask()}
                onCancel={() => setCreateOpen(false)}
            />

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
                {loading && visibleTasks.length === 0 && tasks.length === 0 ? <MyTasksLoadingState /> : null}
                {!loading && visibleTasks.length === 0 ? (
                    <MyTasksEmptyState
                        message={
                            searchQuery.trim() ? "No tasks match your search."
                            : siteScopedTasks.length === 0 && tasks.length > 0 ?
                                "No tasks for this site."
                            :   emptyLabel
                        }
                        helper={
                            searchQuery.trim() ?
                                "Try a different name, household, or child."
                            :   `Create a general task or link one to a ${opportunityEntitySingular.toLowerCase()}.`
                        }
                    />
                ) : null}
                {visibleTasks.length > 0 ? (
                    <ul className="space-y-2.5">
                        {visibleTasks.map((t) => {
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
                                    canOpenRecord={
                                        t.entity_type === "opportunities" &&
                                        Boolean(t.entity_id?.trim()) &&
                                        adminDrawer != null
                                    }
                                    presentation={presentation}
                                    entityLabels={entityLabels}
                                    editTitle={editTitle}
                                    editDue={editDue}
                                    editNotes={editNotes}
                                    editAssignedToUserId={editAssignedToUserId}
                                    onEditTitleChange={setEditTitle}
                                    onEditDueChange={setEditDue}
                                    onEditNotesChange={setEditNotes}
                                    onEditAssignedToUserIdChange={setEditAssignedToUserId}
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
