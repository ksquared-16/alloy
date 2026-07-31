"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ListTodo } from "lucide-react";

import { useAdminAuth } from "@/contexts/AdminAuthContext";
import MyTasksTaskCard from "@/app/adminV2/components/MyTasksTaskCard";
import WorkItemCreateModal from "@/components/workItems/WorkItemCreateModal";
import WorkspaceZonePanel from "@/components/workspace/WorkspaceZonePanel";
import WorkspaceQueueRow from "@/components/workspace/WorkspaceQueueRow";
import FoldersViewsSourcesRail from "@/components/workItems/FoldersViewsSourcesRail";
import WorkItemDetailPanel from "@/components/workItems/WorkItemDetailPanel";
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
    completeStageWorkWithSelectedOutcome,
    fetchStageWorkOutcomeResolution,
    type StageWorkOutcomeResolution,
} from "@/lib/lifecycle/stageWorkOutcomePickerClient";
import type { StageCompletionOutcomeV1 } from "@/lib/lifecycle/stageOperatingPlanV1";
import type { MyTasksTaskRow } from "@/lib/agent/taskAssist/myTasksTaskTypes";
import {
    buildMyTasksPresentationLabels,
    myTasksRowMatchesSearch,
} from "@/lib/agent/taskAssist/myTasksPresentationLabels";
import {
    createOperationalTask,
    patchOperationalTaskFields,
    patchOperationalTaskStatus,
    readJson,
    type OperationalTaskWorkspaceFilter,
} from "@/lib/agent/taskAssist/taskAssistV11OpportunityApi";
import {
    getCachedWorkspaceOperationalTasks,
    loadWorkspaceOperationalTasks,
} from "@/lib/agent/taskAssist/operationalTasksWorkspaceCache";
import { isOperationalWorkV1Enabled } from "@/lib/admin/operationalWork/operationalWorkV1UiGate";
import { deriveWorkItemsProcessGroups } from "@/lib/agent/taskAssist/myTasksProcessGroups";
import {
    applyWorkItemQueueScope,
    countTasksForFolder,
    countTasksForSource,
    countTasksForView,
    DEFAULT_WORK_ITEM_QUEUE_SCOPE,
    resolveWorkItemQueueEmptyState,
    resolveWorkspaceTasksFetchFilter,
    WORK_ITEM_FOLDER_DEFS,
    WORK_ITEM_SOURCE_DEFS,
    WORK_ITEM_VIEW_DEFS,
    type WorkItemQueueScope,
    type WorkItemSourceKey,
    type WorkItemViewKey,
} from "@/lib/workItems/workItemQueueScope";
import { mapWorkItemQueueRow } from "@/lib/workItems/mapWorkItemQueueRow";
import { buildWorkItemProcessLabelsFromTasks } from "@/lib/workItems/workItemBpProvenance";
import { fetchWorkItemBpLabelCatalog } from "@/lib/workItems/workItemBpLabelCatalog";
import {
    isProcessingProjectedWorkItem,
    mapProcessingQueueToWorkItemRows,
    parseProcessingCaseIdFromWorkItemId,
} from "@/lib/workItems/mapProcessingCaseToWorkItemRow";
import {
    isCommunicationsProjectedWorkItem,
    mapCommunicationsQueueToWorkItemRows,
    parseCommunicationThreadIdFromWorkItemId,
} from "@/lib/workItems/mapCommunicationThreadToWorkItemRow";
import {
    ADMIN_V2_COMMUNICATIONS_QUEUE_REFRESH,
    ADMIN_V2_PROCESSING_QUEUE_REFRESH,
    dispatchOperationalWorkRefresh,
} from "@/lib/workItems/operationalWorkRefresh";
import { dispatchOpenCommunicationsThread, dispatchOpenProcessingCase } from "@/lib/workItems/workItemsNavigation";
import { getProcessingQueueWarmSnapshot, subscribeProcessingQueueWarm, warmProcessingQueueCache } from "@/lib/pos/processingQueueWarmCache";
import {
    getCommandCenterCacheSnapshot,
    prefetchCommandCenterConversations,
    subscribeCommandCenterCache,
} from "@/lib/communications/v2/commandCenterPrefetchCache";
import { dispatchFocusCurrentWork } from "@/lib/workItems/workItemsNavigation";

import { draftToOperationalTaskBody } from "@/lib/workItems/commitWorkItemDraft";
import { markSessionCommitted, type WorkItemCreationSession } from "@/lib/workItems/workItemCreationRuntime";
import type { WorkItemDraftEntity } from "@/lib/workItems/workItemDraftV1";
import { WS_QUEUE_RAIL } from "@/components/workspace/workspaceTokens";

export type { MyTasksTaskRow };

function mapServerFilterToScopeView(filter: OperationalTaskWorkspaceFilter): WorkItemViewKey {
    switch (filter) {
        case "assigned_to_me":
            return "mine";
        case "unassigned":
            return "unassigned";
        case "due_today":
            return "due_today";
        case "overdue":
            return "overdue";
        case "completed":
            return "completed";
        case "open":
        default:
            return "mine";
    }
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
    onFilterCountChange?: (count: number) => void;
    requestCreateNonce?: number;
    navFilter?: OperationalTaskWorkspaceFilter | null;
    navSelectedTaskId?: string | null;
    navSource?: WorkItemSourceKey | null;
    navView?: WorkItemViewKey | null;
    onNavFilterClear?: () => void;
};

export default function MyTasksPanel({
    compact = false,
    onClose,
    onFilterCountChange,
    requestCreateNonce = 0,
    navFilter,
    navSelectedTaskId,
    navSource,
    navView,
    onNavFilterClear,
}: MyTasksPanelProps) {
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
    const contextPrefill = useMemo<WorkItemDraftEntity | null>(() => {
        if (!linkedOpportunityId) return null;
        return {
            type: "opportunities",
            id: linkedOpportunityId,
            label: linkedRecordLabel || "Open record",
        };
    }, [linkedOpportunityId, linkedRecordLabel]);

    const initialScope = useMemo<WorkItemQueueScope>(() => {
        if (!navFilter) return DEFAULT_WORK_ITEM_QUEUE_SCOPE;
        return {
            ...DEFAULT_WORK_ITEM_QUEUE_SCOPE,
            view: mapServerFilterToScopeView(navFilter),
        };
    }, [navFilter]);

    const [scope, setScope] = useState<WorkItemQueueScope>(initialScope);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedTaskId, setSelectedTaskId] = useState<string | null>(navSelectedTaskId ?? null);
    const [tasks, setTasks] = useState<MyTasksTaskRow[]>(() => {
        const serverFilter = resolveWorkspaceTasksFetchFilter(initialScope.view, navFilter);
        return getCachedWorkspaceOperationalTasks(serverFilter) ?? [];
    });
    const [loading, setLoading] = useState(() => {
        const serverFilter = resolveWorkspaceTasksFetchFilter(initialScope.view, navFilter);
        return getCachedWorkspaceOperationalTasks(serverFilter) == null;
    });
    const [error, setError] = useState<string | null>(null);
    const [actionId, setActionId] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [rescheduleId, setRescheduleId] = useState<string | null>(null);
    const [editTitle, setEditTitle] = useState("");
    const [editDue, setEditDue] = useState("");
    const [editNotes, setEditNotes] = useState("");
    const [createOpen, setCreateOpen] = useState(false);
    const [editAssignedToUserId, setEditAssignedToUserId] = useState<string | null>(null);
    const [createBusy, setCreateBusy] = useState(false);
    const [outcomeTaskId, setOutcomeTaskId] = useState<string | null>(null);
    const [outcomeContext, setOutcomeContext] = useState<StageWorkOutcomeResolution | null>(null);
    const [outcomeOptions, setOutcomeOptions] = useState<StageCompletionOutcomeV1[]>([]);
    const [catalogProcessLabels, setCatalogProcessLabels] = useState<Record<string, string>>({});
    const [processingWarmNonce, setProcessingWarmNonce] = useState(0);
    const [commsWarmNonce, setCommsWarmNonce] = useState(0);

    const openCreateForm = useCallback(() => {
        setCreateOpen(true);
    }, []);

    const openCreateFormRef = useRef(openCreateForm);
    openCreateFormRef.current = openCreateForm;
    useEffect(() => {
        if (requestCreateNonce > 0) openCreateFormRef.current();
    }, [requestCreateNonce]);

    useEffect(() => {
        if (navFilter) {
            setScope((prev) => ({ ...prev, view: mapServerFilterToScopeView(navFilter) }));
        }
    }, [navFilter]);

    useEffect(() => {
        if (navSelectedTaskId) setSelectedTaskId(navSelectedTaskId);
    }, [navSelectedTaskId]);

    useEffect(() => {
        if (!navSource && !navView) return;
        setScope((prev) => ({
            ...prev,
            ...(navSource ? { source: navSource } : {}),
            ...(navView ? { view: navView } : {}),
        }));
    }, [navSource, navView]);
    const load = useCallback(async (opts?: { force?: boolean }) => {
        if (!workEnabled) return;
        const serverFilter = resolveWorkspaceTasksFetchFilter(scope.view, navFilter);
        const cached = getCachedWorkspaceOperationalTasks(serverFilter);
        if (cached) {
            setTasks(cached);
            setLoading(false);
        } else {
            setLoading(true);
        }
        setError(null);
        // Warm-first + deduped: mount/scope loads reuse a fresh cache and coalesce with the overview
        // landing + KPI strip into ONE request per filter; mutations pass `{ force: true }` to revalidate.
        const { tasks: rows, error: loadError } = await loadWorkspaceOperationalTasks(serverFilter, opts);
        if (loadError) {
            setError(formatTaskAssistClientError(loadError));
            if (!cached) setTasks([]);
        } else if (rows) {
            setTasks(rows);
        }
        setLoading(false);
    }, [navFilter, scope.view, workEnabled]);

    useEffect(() => {
        void load();
    }, [load]);
    useEffect(() => {
        if (!workEnabled) return;
        void fetchWorkItemBpLabelCatalog().then((catalog) => setCatalogProcessLabels(catalog.processLabels));
        void warmProcessingQueueCache();
        void prefetchCommandCenterConversations();
    }, [workEnabled]);

    useEffect(() => {
        if (!workEnabled) return;
        return subscribeProcessingQueueWarm(() => setProcessingWarmNonce((n) => n + 1));
    }, [workEnabled]);

    useEffect(() => {
        if (!workEnabled) return;
        return subscribeCommandCenterCache(() => setCommsWarmNonce((n) => n + 1));
    }, [workEnabled]);

    useEffect(() => {
        if (!workEnabled) return;
        const onProcessingRefresh = () => {
            setProcessingWarmNonce((n) => n + 1);
        };
        window.addEventListener(ADMIN_V2_PROCESSING_QUEUE_REFRESH, onProcessingRefresh);
        return () => window.removeEventListener(ADMIN_V2_PROCESSING_QUEUE_REFRESH, onProcessingRefresh);
    }, [load, workEnabled]);

    useEffect(() => {
        if (!workEnabled) return;
        const onCommsRefresh = () => {
            void prefetchCommandCenterConversations({ force: true }).finally(() => {
                setCommsWarmNonce((n) => n + 1);
            });
        };
        window.addEventListener(ADMIN_V2_COMMUNICATIONS_QUEUE_REFRESH, onCommsRefresh);
        return () => window.removeEventListener(ADMIN_V2_COMMUNICATIONS_QUEUE_REFRESH, onCommsRefresh);
    }, [workEnabled]);




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

    const bpLabelOptions = useMemo(() => {
        const derived = buildWorkItemProcessLabelsFromTasks(siteScopedTasks, "Enrollment");
        return {
            processLabels: { ...derived, ...catalogProcessLabels },
            fallbackProcessLabel: "Enrollment",
        };
    }, [catalogProcessLabels, siteScopedTasks]);

    const processGroups = useMemo(
        () =>
            deriveWorkItemsProcessGroups(siteScopedTasks, {
                fallbackProcessLabel: "Enrollment",
                processLabels: bpLabelOptions.processLabels,
            }),
        [bpLabelOptions.processLabels, siteScopedTasks],
    );

    const processingProjectedTasks = useMemo(() => {
        void processingWarmNonce;
        const warm = getProcessingQueueWarmSnapshot().data?.rows ?? [];
        return mapProcessingQueueToWorkItemRows(warm);
    }, [processingWarmNonce]);

    const communicationsProjectedTasks = useMemo(() => {
        void commsWarmNonce;
        const warm = getCommandCenterCacheSnapshot()?.conversations ?? [];
        return mapCommunicationsQueueToWorkItemRows(warm);
    }, [commsWarmNonce]);

    const mergedTasks = useMemo(() => {
        const byId = new Map<string, MyTasksTaskRow>();
        for (const t of siteScopedTasks) byId.set(t.id, t);
        for (const t of processingProjectedTasks) {
            if (!byId.has(t.id)) byId.set(t.id, t);
        }
        for (const t of communicationsProjectedTasks) {
            if (!byId.has(t.id)) byId.set(t.id, t);
        }
        return Array.from(byId.values());
    }, [communicationsProjectedTasks, processingProjectedTasks, siteScopedTasks]);

    const scopedTasks = useMemo(() => {
        return applyWorkItemQueueScope(mergedTasks, scope, processGroups, userId?.trim() || null);
    }, [mergedTasks, processGroups, scope, userId]);

    const visibleTasks = useMemo(() => {
        const q = searchQuery.trim();
        if (!q) return scopedTasks;
        return scopedTasks.filter((t) => myTasksRowMatchesSearch(t, q, entityLabels));
    }, [entityLabels, scopedTasks, searchQuery]);

    const folderCounts = useMemo(
        () =>
            Object.fromEntries(
                WORK_ITEM_FOLDER_DEFS.map((def) => [
                    def.key,
                    countTasksForFolder(mergedTasks, def.key, processGroups, userId?.trim() || null),
                ]),
            ),
        [mergedTasks, processGroups, userId],
    );

    const viewCounts = useMemo(
        () => Object.fromEntries(
            WORK_ITEM_VIEW_DEFS.map((def) => [def.key, countTasksForView(mergedTasks, def.key, userId?.trim() || null)]),
        ),
        [mergedTasks, userId],
    );

    const sourceCounts = useMemo(
        () => Object.fromEntries(WORK_ITEM_SOURCE_DEFS.map((def) => [def.key, countTasksForSource(mergedTasks, def.key)])),
        [mergedTasks],
    );


    useEffect(() => {
        if (!selectedTaskId) return;
        const stillExists = mergedTasks.some((t) => t.id === selectedTaskId);
        if (!stillExists) setSelectedTaskId(null);
    }, [mergedTasks, selectedTaskId]);

    const opportunityEntitySingular = presentation.opportunityEntitySingular;

    useEffect(() => {
        onFilterCountChange?.(visibleTasks.length);
    }, [onFilterCountChange, visibleTasks.length]);

    useEffect(() => {
        const onRefresh = () => void load({ force: true });
        window.addEventListener(ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH, onRefresh);
        return () => window.removeEventListener(ADMIN_V2_OPPORTUNITY_OPERATIONAL_TASKS_REFRESH, onRefresh);
    }, [load]);

    const dispatchRefresh = useCallback(
        (detail?: { opportunity_id?: string | null; processing_case_id?: string | null; communication_thread_id?: string | null; task_id?: string | null; kind?: "mutation" | "complete" | "processing_review" | "communications_reply" }) => {
            dispatchOperationalWorkRefresh(detail ?? {});
        },
        [],
    );

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
                    }),
                );
            }
            onClose?.();
        },
        [adminDrawer, onClose],
    );

    const onOpenCurrentWork = useCallback(
        (task: MyTasksTaskRow) => {
            if (task.entity_type !== "opportunities" || !task.entity_id?.trim() || !adminDrawer) return;
            adminDrawer.openDrawer({
                type: "opportunities",
                id: task.entity_id,
                opportunityWorkspaceContext: null,
            });
            dispatchFocusCurrentWork({ opportunity_id: task.entity_id, task_id: task.id });
            onClose?.();
        },
        [adminDrawer, onClose],
    );

    const onOpenProcessing = useCallback((task: MyTasksTaskRow) => {
        const caseId = task.processing_case_id?.trim() || parseProcessingCaseIdFromWorkItemId(task.id);
        if (!caseId) return;
        dispatchOpenProcessingCase(caseId);
        onClose?.();
    }, [onClose]);

    const onOpenCommunications = useCallback((task: MyTasksTaskRow) => {
        const threadId = task.communication_thread_id?.trim() || parseCommunicationThreadIdFromWorkItemId(task.id);
        if (!threadId) return;
        dispatchOpenCommunicationsThread(threadId);
        onClose?.();
    }, [onClose]);

    const onPatchStatus = useCallback(
        async (id: string, status: "completed" | "canceled") => {
            const processingCaseId = parseProcessingCaseIdFromWorkItemId(id);
            if (processingCaseId) {
                dispatchRefresh({ processing_case_id: processingCaseId, kind: "processing_review" });
                await load({ force: true });
                return;
            }
            const communicationThreadId = parseCommunicationThreadIdFromWorkItemId(id);
            if (communicationThreadId) {
                onOpenCommunications({ id, communication_thread_id: communicationThreadId } as MyTasksTaskRow);
                return;
            }
            setActionId(id);
            try {
                const res = await patchOperationalTaskStatus(id, status);
                const json = await readJson<{ ok?: boolean; error?: string; message?: string }>(res);
                if (!res.ok || !json.ok) throw new Error(formatTaskAssistClientError(json.message || json.error, json.error));
                clearForms();
                await load({ force: true });
                dispatchRefresh();
            } catch (e: unknown) {
                setError(formatTaskAssistClientError((e as Error).message));
            } finally {
                setActionId(null);
            }
        },
        [clearForms, dispatchRefresh, load, onOpenCommunications],
    );

    const onCompleteTask = useCallback(
        async (task: MyTasksTaskRow) => {
            if (isProcessingProjectedWorkItem(task)) {
                onOpenProcessing(task);
                return;
            }
            if (isCommunicationsProjectedWorkItem(task)) {
                onOpenCommunications(task);
                return;
            }
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
        [onOpenCommunications, onOpenProcessing, onPatchStatus],
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
                if (!result.ok) throw new Error(result.error ?? "Failed to complete work item");
                clearForms();
                await load({ force: true });
                dispatchRefresh();
            } catch (e: unknown) {
                setError(formatTaskAssistClientError((e as Error).message));
            } finally {
                setActionId(null);
            }
        },
        [clearForms, dispatchRefresh, load, outcomeContext],
    );

    const startEdit = useCallback((task: MyTasksTaskRow) => {
        setRescheduleId(null);
        setEditingId(task.id);
        setEditTitle(task.title);
        setEditDue(operationalTaskDueToLocalInput(task.due_at));
        setEditNotes(task.description ?? "");
        setEditAssignedToUserId(task.assigned_to_user_id ?? null);
    }, []);

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
            await load({ force: true });
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
            await load({ force: true });
            dispatchRefresh();
        } catch (e: unknown) {
            setError(formatTaskAssistClientError((e as Error).message));
        } finally {
            setActionId(null);
        }
    }, [clearForms, dispatchRefresh, editDue, load, rescheduleId]);

    const onCommitCreate = useCallback(async (session: WorkItemCreationSession) => {
        setCreateBusy(true);
        setError(null);
        try {
            const body = draftToOperationalTaskBody(session.draft);
            const res = await createOperationalTask(body);
            const json = await readJson<{ ok?: boolean; error?: string; message?: string }>(res);
            if (!res.ok || !json.ok) throw new Error(formatTaskAssistClientError(json.message || json.error, json.error));
            markSessionCommitted(session);
            setCreateOpen(false);
            await load({ force: true });
            dispatchRefresh();
        } catch (e: unknown) {
            setError(formatTaskAssistClientError((e as Error).message));
        } finally {
            setCreateBusy(false);
        }
    }, [dispatchRefresh, load]);

    const queueEmptyState = useMemo(
        () =>
            resolveWorkItemQueueEmptyState(scope, {
                hasSearch: Boolean(searchQuery.trim()),
                hasSiteFilter: siteScopedTasks.length === 0 && tasks.length > 0,
                opportunityEntitySingular,
            }),
        [scope, searchQuery, siteScopedTasks.length, tasks.length, opportunityEntitySingular],
    );

    if (!workEnabled) {
        return <p className="text-sm text-alloy-midnight/70">Operational work is not enabled.</p>;
    }

    const activeViewLabel = WORK_ITEM_VIEW_DEFS.find((f) => f.key === scope.view)?.label ?? "Mine";
    const selectedTask = visibleTasks.find((t) => t.id === selectedTaskId) ?? null;

    const renderTaskCard = (t: MyTasksTaskRow) => {
        if (isProcessingProjectedWorkItem(t) || isCommunicationsProjectedWorkItem(t)) return null;
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
                canOpenRecord={t.entity_type === "opportunities" && Boolean(t.entity_id?.trim()) && adminDrawer != null}
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
        <MyTasksEmptyState message={queueEmptyState.message} helper={queueEmptyState.helper} />
    );

    if (!compact) {
        return (
            <div className="flex flex-col gap-4" data-adminv2-tasks-panel="true">
                <header>
                    <h1 className="text-xl font-semibold tracking-tight text-alloy-midnight">My work items</h1>
                    <p className="mt-0.5 text-[12px] text-alloy-midnight/55">
                        Follow-ups and reminders linked to {opportunityEntitySingular.toLowerCase()}s in your org.
                    </p>
                </header>

                <div
                    className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-xl border border-alloy-stone/15 bg-white p-2.5 shadow-sm"
                    data-adminv2-tasks-toolbar="true"
                >
                    <div className="inline-flex flex-wrap items-center gap-0.5 rounded-lg bg-alloy-stone/[0.04] p-0.5 ring-1 ring-alloy-stone/12">
                        {WORK_ITEM_VIEW_DEFS.map((def) => (
                            <button
                                key={def.key}
                                type="button"
                                onClick={() => {
                                    setScope((prev) => ({ ...prev, view: def.key }));
                                    setSelectedTaskId(null);
                                    clearForms();
                                }}
                                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                                    scope.view === def.key ?
                                        "bg-white text-alloy-juniper shadow-[0_1px_2px_rgba(15,23,42,0.06)] ring-1 ring-alloy-juniper/22"
                                    :   "text-alloy-midnight/55 hover:bg-alloy-stone/[0.06] hover:text-alloy-midnight/80"
                                }`}
                            >
                                {def.label}
                            </button>
                        ))}
                    </div>
                    <button
                        type="button"
                        data-adminv2-new-task="true"
                        className="rounded-lg border border-alloy-stone/25 bg-white px-3 py-1 text-[11px] font-semibold text-alloy-juniper shadow-sm hover:bg-alloy-juniper/[0.05]"
                        onClick={() => (createOpen ? setCreateOpen(false) : openCreateForm())}
                    >
                        New work item
                    </button>
                </div>

                <div className="shrink-0" data-adminv2-tasks-search="true">
                    <input
                        type="search"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search work items, records, households, children…"
                        className="w-full rounded-lg border border-alloy-stone/22 bg-white px-3 py-2 text-[12px] text-alloy-midnight/85 shadow-sm placeholder:text-alloy-midnight/40"
                        aria-label="Search work items"
                    />
                </div>
                {createOpen ? (
                    <WorkItemCreateModal
                        open={createOpen}
                        busy={createBusy}
                        presentation={presentation}
                        workspaceSiteId={selectedSiteId}
                        contextPrefill={contextPrefill}
                        onCommit={onCommitCreate}
                        onCancel={() => setCreateOpen(false)}
                    />
                ) : null}
                {errorBanner}

                <div>
                    {loading && visibleTasks.length === 0 && tasks.length === 0 ? <MyTasksLoadingState /> : null}
                    {!loading && visibleTasks.length === 0 ? emptyState : null}
                    {visibleTasks.length > 0 ? (
                        <>
                            <div className="flex items-baseline justify-between px-0.5 pb-1.5" data-adminv2-tasks-queue-header="true">
                                <h3 className="text-[13px] font-semibold text-alloy-midnight">{activeViewLabel}</h3>
                                <span className="text-[11px] tabular-nums text-alloy-midnight/45">
                                    {visibleTasks.length} item{visibleTasks.length === 1 ? "" : "s"}
                                </span>
                            </div>
                            <ul className="space-y-2">{visibleTasks.map((t) => renderTaskCard(t))}</ul>
                        </>
                    ) : null}
                </div>
            </div>
        );
    }

    const queueRows = visibleTasks.map((task) => ({
        task,
        row: mapWorkItemQueueRow(task, { presentation, entityLabels, labelOptions: bpLabelOptions }),
    }));

    return (
        <div className="flex min-h-0 flex-1 overflow-hidden bg-white" data-adminv2-tasks-panel="true" data-adminv2-tasks-workspace="true">
            <WorkspaceZonePanel
                title="Folders, views, sources"
                className={`w-[24%] min-w-[12rem] max-w-[16rem] shrink-0 self-stretch border-0 ${WS_QUEUE_RAIL}`}
                data-testid="work-items-fvs-rail"
            >
                <FoldersViewsSourcesRail
                    scope={scope}
                    onScopeChange={(nextScope) => {
                        setScope(nextScope);
                        onNavFilterClear?.();
                        setSelectedTaskId(null);
                        clearForms();
                    }}
                    folderCounts={folderCounts}
                    viewCounts={viewCounts}
                    sourceCounts={sourceCounts}
                    processGroups={processGroups}
                />
            </WorkspaceZonePanel>

            <WorkspaceZonePanel
                title="Queue"
                className={`w-[31%] min-w-[15rem] max-w-[20rem] shrink-0 self-stretch border-0 ${WS_QUEUE_RAIL}`}
                data-testid="work-items-queue"
            >
                <div className="flex min-h-0 flex-1 flex-col gap-2 p-2" data-adminv2-tasks-queue="true">
                    <input
                        type="search"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search work items"
                        className="w-full rounded-lg border border-alloy-stone/22 bg-white px-3 py-2 text-[12px] text-alloy-midnight/85 shadow-sm placeholder:text-alloy-midnight/40"
                        aria-label="Search work items"
                    />
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold text-alloy-midnight/55">Sort</span>
                        <select
                            value={scope.sort}
                            onChange={(e) => setScope((prev) => ({ ...prev, sort: e.target.value as WorkItemQueueScope["sort"] }))}
                            className="w-40 rounded-md border border-alloy-stone/20 bg-white px-2 py-1 text-[11px] text-alloy-midnight/75"
                            aria-label="Sort work items"
                        >
                            <option value="due_date">Due date</option>
                            <option value="title">Title</option>
                            <option value="recently_updated">Recently updated</option>
                        </select>
                    </div>
                    {errorBanner}
                    <div className="min-h-0 flex-1 overflow-y-auto">
                        {loading && visibleTasks.length === 0 && tasks.length === 0 ? <MyTasksLoadingState /> : null}
                        {!loading && queueRows.length === 0 ? emptyState : null}
                        {queueRows.length > 0 ? (
                            <>
                                <div className="flex items-baseline justify-between px-0.5 pb-1.5" data-adminv2-tasks-queue-header="true">
                                    <h3 className="text-[13px] font-semibold text-alloy-midnight">{activeViewLabel}</h3>
                                    <span className="text-[11px] tabular-nums text-alloy-midnight/45">{queueRows.length}</span>
                                </div>
                                <ul className="space-y-1.5">
                                    {queueRows.map(({ task, row }) => (
                                        <li key={task.id}>
                                            <WorkspaceQueueRow
                                                {...row}
                                                selected={task.id === selectedTaskId}
                                                onSelect={(id) => {
                                                    clearForms();
                                                    setSelectedTaskId(id);
                                                    if (createOpen) setCreateOpen(false);
                                                }}
                                            />
                                        </li>
                                    ))}
                                </ul>
                            </>
                        ) : null}
                    </div>
                </div>
            </WorkspaceZonePanel>

            <WorkspaceZonePanel
                title="Work item detail"
                className="min-w-[20rem] flex-1 self-stretch border-0"
                data-testid="work-items-task-detail"
            >
                <div className="min-h-0 flex-1 overflow-y-auto p-3" data-adminv2-tasks-detail="true">
                    <WorkItemDetailPanel
                        key={`${selectedTask?.id ?? "none"}:${createOpen ? "create" : "view"}`}
                        task={selectedTask}
                        taskCard={selectedTask ? <ul className="list-none">{renderTaskCard(selectedTask)}</ul> : null}
                        createOpen={createOpen}
                        createBusy={createBusy}
                        contextPrefill={contextPrefill}
                        workspaceSiteId={selectedSiteId}
                        onCommitCreate={onCommitCreate}
                        onCancelCreate={() => setCreateOpen(false)}
                        presentation={presentation}
                        entityLabels={entityLabels}
                        bpLabelOptions={bpLabelOptions}
                        onOpenRecord={selectedTask ? () => onOpenRecord(selectedTask) : undefined}
                        onOpenCurrentWork={selectedTask ? () => onOpenCurrentWork(selectedTask) : undefined}
                        onOpenProcessing={selectedTask ? () => onOpenProcessing(selectedTask) : undefined}
                        onOpenCommunications={selectedTask ? () => onOpenCommunications(selectedTask) : undefined}
                    />
                </div>
            </WorkspaceZonePanel>
        </div>
    );
}
