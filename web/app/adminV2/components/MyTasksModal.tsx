"use client";

/**
 * Work Items — Overview + Queue inside the Digital Mailroom–aligned product shell.
 */

import { useCallback, useEffect, useState } from "react";

import AdminV2WorkspaceBosModalShell from "@/app/adminV2/components/AdminV2WorkspaceBosModalShell";
import MyTasksPanel from "@/app/adminV2/components/MyTasksPanel";
import WorkItemsOverviewLanding from "@/app/adminV2/tasks/WorkItemsOverviewLanding";
import WorkItemsShell, { type WorkItemsWorkView } from "@/app/adminV2/tasks/WorkItemsShell";
import { prefetchWorkspaceOperationalTasks } from "@/lib/agent/taskAssist/operationalTasksWorkspaceCache";
import { prefetchCommandCenterConversations } from "@/lib/communications/v2/commandCenterPrefetchCache";
import type { WorkItemSourceKey, WorkItemViewKey } from "@/lib/workItems/workItemQueueScope";
import type { OperationalTaskWorkspaceFilter } from "@/lib/agent/taskAssist/taskAssistV11OpportunityApi";
import {
    ADMIN_V2_OPEN_WORK_ITEMS_TASK,
    type OpenWorkItemsTaskDetail,
} from "@/lib/workItems/workItemsNavigation";

export type MyTasksModalProps = {
    open: boolean;
    onClose: () => void;
};

import {
    WORK_ITEMS_DEFAULT_POSITION,
    WORK_ITEMS_WORKSPACE_KEY,
    isValidWorkItemsPosition,
} from "@/app/adminV2/tasks/workItemsResume";
import {
    resolveWorkspaceOpenPosition,
    writeWorkspaceResume,
} from "@/lib/runtime/workspaceResume";

export default function MyTasksModal({ open, onClose }: MyTasksModalProps) {
    // Stable navigation resumes; the selected task and every editor/popover below it do not.
    const opened = useState(() =>
        resolveWorkspaceOpenPosition(
            WORK_ITEMS_WORKSPACE_KEY,
            WORK_ITEMS_DEFAULT_POSITION,
            isValidWorkItemsPosition,
        ),
    )[0];
    const [workView, setWorkView] = useState<WorkItemsWorkView>(
        opened.workView as WorkItemsWorkView,
    );
    const [newTaskNonce, setNewTaskNonce] = useState(0);
    const [navFilter, setNavFilter] = useState<OperationalTaskWorkspaceFilter | null>(null);
    const [navSelectedTaskId, setNavSelectedTaskId] = useState<string | null>(null);
    const [navSource, setNavSource] = useState<WorkItemSourceKey | null>(null);
    const [navView, setNavView] = useState<WorkItemViewKey | null>(null);

    useEffect(() => {
        if (open) {
            prefetchWorkspaceOperationalTasks("open");
            prefetchWorkspaceOperationalTasks("completed");
            void prefetchCommandCenterConversations();
        }
    }, [open]);
    /**
     * Closing clears TRANSIENT state only. `workView` is stable navigation and is left standing so
     * the next open resumes it.
     */
    const handleClose = useCallback(() => {
        setNavFilter(null);
        setNavSelectedTaskId(null);
        setNavSource(null);
        setNavView(null);
        setNewTaskNonce(0);
        onClose();
    }, [onClose]);

    useEffect(() => {
        writeWorkspaceResume(WORK_ITEMS_WORKSPACE_KEY, { workView });
    }, [workView]);

    const openQueue = useCallback(() => {
        setNavFilter("open");
        setNavSelectedTaskId(null);
        setWorkView("queue");
    }, []);

    const handleWorkViewChange = useCallback((view: WorkItemsWorkView) => {
        if (view === "queue") setNavFilter("open");
        setWorkView(view);
    }, []);

    const openTask = useCallback((
        taskId: string,
        filter: OperationalTaskWorkspaceFilter = "open",
        source?: WorkItemSourceKey | null,
        view?: WorkItemViewKey | null,
    ) => {
        setNavSelectedTaskId(taskId);
        setNavFilter(filter);
        setNavSource(source ?? null);
        setNavView(view ?? null);
        setWorkView("queue");
    }, []);


    useEffect(() => {
        const onOpenWorkItemsTask = (event: Event) => {
            const detail = (event as CustomEvent<OpenWorkItemsTaskDetail>).detail;
            const taskId = detail?.task_id?.trim();
            if (!taskId) return;
            openTask(taskId, detail.filter ?? "open", detail.source ?? null, detail.view ?? null);
        };
        window.addEventListener(ADMIN_V2_OPEN_WORK_ITEMS_TASK, onOpenWorkItemsTask as EventListener);
        return () => window.removeEventListener(ADMIN_V2_OPEN_WORK_ITEMS_TASK, onOpenWorkItemsTask as EventListener);
    }, [openTask]);

    const navigateFilter = useCallback((filter: OperationalTaskWorkspaceFilter) => {
        setNavFilter(filter);
        setNavSelectedTaskId(null);
        setWorkView("queue");
    }, []);

    const requestNewTask = useCallback(() => {
        setNewTaskNonce((n) => n + 1);
        setWorkView("queue");
    }, []);

    return (
        <AdminV2WorkspaceBosModalShell
            open={open}
            onClose={handleClose}
            dataModalAttr="adminv2-tasks-modal"
            ariaLabelledBy="adminv2-tasks-modal-title"
            panelClassName="max-h-[min(94vh,56rem)]"
        >
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <WorkItemsShell
                    workView={workView}
                    onWorkViewChange={handleWorkViewChange}
                    onClose={handleClose}
                    onNewTask={requestNewTask}
                >
                    {workView === "overview" ? (
                        <WorkItemsOverviewLanding
                            onOpenQueue={openQueue}
                            onOpenTask={openTask}
                            onNewTask={requestNewTask}
                            onNavigateFilter={navigateFilter}
                        />
                    ) : (
                        <MyTasksPanel
                            compact
                            onClose={handleClose}
                            requestCreateNonce={newTaskNonce}
                            navFilter={navFilter}
                            navSelectedTaskId={navSelectedTaskId}
                            navSource={navSource}
                            navView={navView}
                            onNavFilterClear={() => setNavFilter(null)}
                        />
                    )}
                </WorkItemsShell>
            </div>
        </AdminV2WorkspaceBosModalShell>
    );
}
