"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import {
    formatOperationalTaskDueDisplay,
    operationalTaskDueToLocalInput,
} from "@/lib/agent/taskAssist/formatOperationalTaskSourceLabel";
import { normalizeOperationalTaskTitleDisplay } from "@/lib/agent/taskAssist/normalizeOperationalTaskTitleDisplay";
import { operationalTaskUrgencyBadge } from "@/lib/agent/taskAssist/taskAssistOperationalUrgency";
import {
    deriveWorkItemsProcessGroups,
    filterTasksByProcessGroup,
    WORK_ITEMS_ALL_GROUP_KEY,
    type WorkItemsProcessGroup,
    type WorkItemsProcessGroupKey,
} from "@/lib/agent/taskAssist/myTasksProcessGroups";
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
import {
    completeStageWorkWithSelectedOutcome,
    fetchStageWorkOutcomeResolution,
    type StageWorkOutcomeResolution,
} from "@/lib/lifecycle/stageWorkOutcomePickerClient";
import type { StageCompletionOutcomeV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
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

// Filter rail = canonical operational section nav (matches Communications child tabs):
// subtle group container, active reads as a selected view (juniper-on-white), not a CTA.
const FILTER_RAIL_CLASS =
    "inline-flex flex-wrap items-center gap-0.5 rounded-lg bg-alloy-stone/[0.04] p-0.5 ring-1 ring-alloy-stone/12";
const FILTER_TAB_ACTIVE =
    "rounded-md bg-white text-alloy-juniper shadow-[0_1px_2px_rgba(15,23,42,0.06)] ring-1 ring-alloy-juniper/22";
const FILTER_TAB_IDLE =
    "rounded-md text-alloy-midnight/55 hover:bg-alloy-stone/[0.06] hover:text-alloy-midnight/80";

/** Resolve the queue header label for the active process / stage rail selection. */
function resolveActiveProcessLabel(
    groups: WorkItemsProcessGroup[],
    activeKey: WorkItemsProcessGroupKey,
): string {
    if (activeKey === WORK_ITEMS_ALL_GROUP_KEY) return "All work";
    for (const group of groups) {
        if (group.key === activeKey) return group.label;
        const stage = group.stages.find((s) => s.key === activeKey);
        if (stage) return `${group.label} · ${stage.label}`;
    }
    return "All work";
}

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
    /** Bump to open the create form from an external trigger (modal header "New task"). */
    requestCreateNonce?: number;
};

export default function MyTasksPanel({ compact = false, onClose, onFilterCountChange, requestCreateNonce = 0 }: MyTasksPanelProps) {
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
    // Two-pane (modal) workspace: which queue row is open in the right detail pane.
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
    // Business Process → Stage doctrine: selected process / stage rail key (modal only).
    const [processGroup, setProcessGroup] = useState<WorkItemsProcessGroupKey>(WORK_ITEMS_ALL_GROUP_KEY);
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
    const [outcomeTaskId, setOutcomeTaskId] = useState<string | null>(null);
    const [outcomeContext, setOutcomeContext] = useState<StageWorkOutcomeResolution | null>(null);
    const [outcomeOptions, setOutcomeOptions] = useState<StageCompletionOutcomeV1[]>([]);

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

    // External "New task" trigger (modal header). Ref avoids re-firing when the create
    // callback identity changes; only a nonce bump opens the form.
    const openCreateFormRef = useRef(openCreateForm);
    openCreateFormRef.current = openCreateForm;
    useEffect(() => {
        if (requestCreateNonce > 0) openCreateFormRef.current();
    }, [requestCreateNonce]);

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
        setOutcomeTaskId(null);
        setOutcomeContext(null);
        setOutcomeOptions([]);
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

    const onCompleteTask = useCallback(
        async (task: MyTasksTaskRow) => {
            setActionId(task.id);
            setError(null);
            try {
                const resolution = await fetchStageWorkOutcomeResolution({ taskId: task.id });
                if (
                    resolution.requires_outcome_picker &&
                    resolution.outcomes?.length &&
                    resolution.department_id &&
                    resolution.stage_key &&
                    resolution.work_id &&
                    resolution.subject
                ) {
                    setOutcomeTaskId(task.id);
                    setOutcomeContext(resolution);
                    setOutcomeOptions(resolution.outcomes);
                    return;
                }
                await onPatchStatus(task.id, "completed");
            } catch (e: unknown) {
                setError(formatTaskAssistClientError((e as Error).message));
            } finally {
                setActionId(null);
            }
        },
        [onPatchStatus],
    );

    const onSelectOutcome = useCallback(
        async (outcomeKey: string) => {
            if (!outcomeContext?.department_id || !outcomeContext.stage_key || !outcomeContext.work_id || !outcomeContext.subject) {
                return;
            }
            const workId = outcomeContext.work_id;
            setActionId(workId);
            setError(null);
            try {
                const result = await completeStageWorkWithSelectedOutcome({
                    departmentId: outcomeContext.department_id,
                    stageKey: outcomeContext.stage_key,
                    workId: outcomeContext.work_id,
                    outcomeKey,
                    subject: outcomeContext.subject,
                });
                if (!result.ok) throw new Error(result.error ?? "Failed to complete work");
                clearForms();
                await load();
                dispatchRefresh();
            } catch (e: unknown) {
                setError(formatTaskAssistClientError((e as Error).message));
            } finally {
                setActionId(null);
            }
        },
        [clearForms, dispatchRefresh, load, outcomeContext],
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

    const activeFilterLabel = FILTERS.find((f) => f.key === filter)?.label ?? "Open";
    // Process rail (modal): Business Process → Stage groups derived from real task metadata
    // (department_id / lifecycle_stage_key). Tasks without Business Process metadata fall
    // into General / Cross-process. See myTasksProcessGroups.ts for the doctrine + label gap.
    const processGroups = deriveWorkItemsProcessGroups(visibleTasks);
    const isValidProcessSelection =
        processGroup === WORK_ITEMS_ALL_GROUP_KEY ||
        processGroups.some((g) => g.key === processGroup || g.stages.some((s) => s.key === processGroup));
    const activeProcessGroup = isValidProcessSelection ? processGroup : WORK_ITEMS_ALL_GROUP_KEY;
    const processTasks = filterTasksByProcessGroup(visibleTasks, activeProcessGroup);
    const activeProcessLabel = resolveActiveProcessLabel(processGroups, activeProcessGroup);
    // Selection is scoped to the visible (server-filtered) set; detail clears when the
    // selected item leaves the current process/filter.
    const selectedTask = visibleTasks.find((t) => t.id === selectedTaskId) ?? null;

    const renderTaskCard = (t: MyTasksTaskRow) => {
        const mode =
            editingId === t.id ? "edit"
            : rescheduleId === t.id ? "reschedule"
            : outcomeTaskId === t.id ? "outcome"
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
                onComplete={() => void onCompleteTask(t)}
                onDismiss={() => void onPatchStatus(t.id, "canceled")}
                onStartEdit={() => startEdit(t)}
                onStartReschedule={() => startReschedule(t)}
                onSaveEdit={() => void saveEdit()}
                onSaveReschedule={() => void saveReschedule()}
                onCancelForm={clearForms}
                onOpenRecord={() => onOpenRecord(t)}
                outcomeWorkTitle={outcomeContext?.work_title ?? t.title}
                outcomeOptions={outcomeTaskId === t.id ? outcomeOptions : undefined}
                onSelectOutcome={(key) => void onSelectOutcome(key)}
            />
        );
    };

    const filterRail = (
        <div className={FILTER_RAIL_CLASS} role="tablist" aria-label="Task filters">
            {FILTERS.map((f) => (
                <button
                    key={f.key}
                    type="button"
                    role="tab"
                    aria-selected={filter === f.key}
                    onClick={() => {
                        setFilter(f.key);
                        setSelectedTaskId(null);
                        clearForms();
                    }}
                    className={`px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                        filter === f.key ? FILTER_TAB_ACTIVE : FILTER_TAB_IDLE
                    }`}
                >
                    {f.label}
                </button>
            ))}
        </div>
    );

    const searchInput = (
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
    );

    const createCard = (
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
    );

    const errorBanner = error ? (
        <div
            className="shrink-0 rounded-lg border border-red-200/80 bg-red-50/90 px-3 py-2 text-[12px] font-medium text-red-900/90"
            role="alert"
            data-adminv2-tasks-error="true"
        >
            {error}
        </div>
    ) : null;

    const emptyState = (
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
    );

    const queueHeader = (
        <div className="flex items-baseline justify-between px-0.5 pb-1.5" data-adminv2-tasks-queue-header="true">
            <h3 className="text-[13px] font-semibold text-alloy-midnight">{activeFilterLabel}</h3>
            <span className="text-[11px] tabular-nums text-alloy-midnight/45">
                {visibleTasks.length} item{visibleTasks.length === 1 ? "" : "s"}
            </span>
        </div>
    );

    // Standalone page (/adminV2/tasks): single-column list with inline cards.
    if (!compact) {
        return (
            <div className="flex flex-col gap-4" data-adminv2-tasks-panel="true">
                <header>
                    <h1 className="text-xl font-semibold tracking-tight text-alloy-midnight">My tasks</h1>
                    <p className="mt-0.5 text-[12px] text-alloy-midnight/55">
                        Follow-ups and reminders linked to {opportunityEntitySingular.toLowerCase()}s in your org.
                    </p>
                </header>

                <div
                    className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-alloy-stone/15 bg-white p-2.5 shadow-sm"
                    data-adminv2-tasks-toolbar="true"
                >
                    {filterRail}
                    <button
                        type="button"
                        data-adminv2-new-task="true"
                        className="rounded-lg border border-alloy-stone/25 bg-white px-3 py-1 text-[11px] font-semibold text-alloy-juniper shadow-sm hover:bg-alloy-juniper/[0.05]"
                        onClick={() => (createOpen ? setCreateOpen(false) : openCreateForm())}
                    >
                        New task
                    </button>
                </div>

                {searchInput}
                {createCard}
                {errorBanner}

                <div>
                    {loading && visibleTasks.length === 0 && tasks.length === 0 ? <MyTasksLoadingState /> : null}
                    {!loading && visibleTasks.length === 0 ? emptyState : null}
                    {visibleTasks.length > 0 ? (
                        <>
                            {queueHeader}
                            <ul className="space-y-2">{visibleTasks.map((t) => renderTaskCard(t))}</ul>
                        </>
                    ) : null}
                </div>
            </div>
        );
    }

    // Modal (compact): Process rail → Queue → Workspace, the Business Process → Stage →
    // Item → Focus Panel/record doctrine. Process/Stage groups partition work; the legacy
    // filters (Open/Mine/Overdue…) live inside the selected process, not as the primary axis.
    return (
        <div className="flex min-h-0 flex-1 gap-3" data-adminv2-tasks-panel="true" data-adminv2-tasks-workspace="true">
            {/* Process rail — primary organization (Process → Work View). */}
            <aside className="flex w-[11.5rem] shrink-0 flex-col gap-1.5" data-adminv2-tasks-process-rail="true">
                <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-alloy-midnight/45">
                    Process
                </p>
                <nav className="space-y-0.5" role="tablist" aria-label="Work by process">
                    {processGroups.map((g) => {
                        const stageActive = g.stages.some((s) => s.key === activeProcessGroup);
                        const on = g.key === activeProcessGroup || stageActive;
                        return (
                            <div key={g.key}>
                                <button
                                    type="button"
                                    role="tab"
                                    aria-selected={g.key === activeProcessGroup}
                                    data-adminv2-process-group={g.key}
                                    onClick={() => {
                                        setProcessGroup(g.key);
                                        setSelectedTaskId(null);
                                        clearForms();
                                    }}
                                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] font-semibold transition-colors ${
                                        on ?
                                            "bg-alloy-juniper/[0.08] text-alloy-juniper ring-1 ring-alloy-juniper/20"
                                        :   "text-alloy-midnight/65 hover:bg-alloy-stone/[0.06] hover:text-alloy-midnight/85"
                                    }`}
                                >
                                    <span className="truncate">{g.label}</span>
                                    <span className={`shrink-0 tabular-nums text-[10px] ${on ? "text-alloy-juniper/80" : "text-alloy-midnight/40"}`}>
                                        {g.count}
                                    </span>
                                </button>
                                {on && g.stages.length > 0 ? (
                                    <div
                                        className="mt-0.5 space-y-0.5 border-l border-alloy-stone/15 pl-2"
                                        role="group"
                                        aria-label={`${g.label} stages`}
                                    >
                                        {g.stages.map((s) => {
                                            const stageOn = s.key === activeProcessGroup;
                                            return (
                                                <button
                                                    key={s.key}
                                                    type="button"
                                                    role="tab"
                                                    aria-selected={stageOn}
                                                    data-adminv2-process-stage={s.key}
                                                    onClick={() => {
                                                        setProcessGroup(s.key);
                                                        setSelectedTaskId(null);
                                                        clearForms();
                                                    }}
                                                    className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-[11px] font-medium transition-colors ${
                                                        stageOn ?
                                                            "bg-alloy-juniper/[0.06] text-alloy-juniper"
                                                        :   "text-alloy-midnight/55 hover:bg-alloy-stone/[0.05] hover:text-alloy-midnight/80"
                                                    }`}
                                                >
                                                    <span className="truncate">{s.label}</span>
                                                    <span className="shrink-0 tabular-nums text-[10px] text-alloy-midnight/40">
                                                        {s.count}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                ) : null}
                            </div>
                        );
                    })}
                </nav>
                {/* Work views appear here once processes expose them (see data gap). */}
                <div className="mt-1 rounded-lg border border-dashed border-alloy-stone/20 px-2 py-1.5" data-adminv2-tasks-work-views="true">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">Work views</p>
                    <p className="mt-0.5 text-[10px] leading-snug text-alloy-midnight/40">
                        Appear here once a process publishes work views.
                    </p>
                </div>
            </aside>

            {/* Queue — work items for the selected process, with filters as a secondary axis. */}
            <div className="flex min-h-0 w-[18.5rem] shrink-0 flex-col gap-2" data-adminv2-tasks-queue="true">
                {searchInput}
                {filterRail}
                {errorBanner}
                <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
                    {loading && visibleTasks.length === 0 && tasks.length === 0 ? <MyTasksLoadingState /> : null}
                    {!loading && processTasks.length === 0 ? emptyState : null}
                    {processTasks.length > 0 ? (
                        <>
                            <div
                                className="flex items-baseline justify-between px-0.5 pb-1.5"
                                data-adminv2-tasks-queue-header="true"
                            >
                                <h3 className="text-[13px] font-semibold text-alloy-midnight">{activeProcessLabel}</h3>
                                <span className="text-[11px] tabular-nums text-alloy-midnight/45">
                                    {activeFilterLabel} · {processTasks.length}
                                </span>
                            </div>
                            <ul className="space-y-1.5">
                                {processTasks.map((t) => {
                                    const badge = operationalTaskUrgencyBadge(t);
                                    const isSelected = t.id === selectedTaskId;
                                    return (
                                        <li key={t.id}>
                                            <button
                                                type="button"
                                                data-adminv2-task-queue-row={t.id}
                                                aria-pressed={isSelected}
                                                onClick={() => {
                                                    clearForms();
                                                    setSelectedTaskId(t.id);
                                                    if (createOpen) setCreateOpen(false);
                                                }}
                                                className={`w-full rounded-lg border px-2.5 py-2 text-left shadow-sm transition-colors ${
                                                    isSelected ?
                                                        "border-alloy-juniper/45 border-l-2 border-l-alloy-juniper bg-alloy-juniper/[0.06] ring-1 ring-alloy-juniper/15"
                                                    : badge.urgency === "overdue" ?
                                                        "border-alloy-stone/18 border-l-2 border-l-red-400/80 bg-white hover:bg-alloy-stone/[0.04]"
                                                    :   "border-alloy-stone/18 bg-white hover:bg-alloy-stone/[0.04]"
                                                }`}
                                            >
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="truncate text-[12.5px] font-semibold text-alloy-midnight/90">
                                                        {normalizeOperationalTaskTitleDisplay(t.title)}
                                                    </span>
                                                    <span
                                                        className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold ${badge.className}`}
                                                    >
                                                        {badge.label}
                                                    </span>
                                                </div>
                                                <p className="mt-0.5 truncate text-[11px] text-alloy-midnight/55">
                                                    Due {formatOperationalTaskDueDisplay(t.due_at)}
                                                </p>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </>
                    ) : null}
                </div>
            </div>

            {/* Workspace — selected work item detail, create form, or calm empty state. */}
            <div
                className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-alloy-stone/15 bg-alloy-stone/[0.02]"
                data-adminv2-tasks-detail="true"
            >
                <div className="min-h-0 flex-1 overflow-y-auto p-3">
                    {createOpen ? (
                        createCard
                    ) : selectedTask ? (
                        <ul className="list-none">{renderTaskCard(selectedTask)}</ul>
                    ) : (
                        <div
                            className="flex h-full flex-col items-center justify-center px-6 py-10 text-center"
                            data-adminv2-tasks-detail-empty="true"
                        >
                            <ListTodo className="mb-2 h-9 w-9 text-alloy-midnight/20" aria-hidden strokeWidth={1.5} />
                            <p className="text-[13px] font-medium text-alloy-midnight/70">Select a work item</p>
                            <p className="mt-1 max-w-xs text-[11px] leading-snug text-alloy-midnight/45">
                                Choose a work item from the queue to view its details, record context, and actions — or
                                start a new one.
                            </p>
                        </div>
                        )}
                    </div>
                </div>
            </div>
    );
}
