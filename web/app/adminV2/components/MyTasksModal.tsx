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
import type { OperationalTaskWorkspaceFilter } from "@/lib/agent/taskAssist/taskAssistV11OpportunityApi";
import {
    ADMIN_V2_OPEN_WORK_ITEMS_TASK,
    type OpenWorkItemsTaskDetail,
} from "@/lib/workItems/workItemsNavigation";

export type MyTasksModalProps = {
    open: boolean;
    onClose: () => void;
};

export default function MyTasksModal({ open, onClose }: MyTasksModalProps) {
    const [workView, setWorkView] = useState<WorkItemsWorkView>("overview");
    const [newTaskNonce, setNewTaskNonce] = useState(0);
    const [navFilter, setNavFilter] = useState<OperationalTaskWorkspaceFilter | null>(null);
    const [navSelectedTaskId, setNavSelectedTaskId] = useState<string | null>(null);

    useEffect(() => {
        if (open) {
            prefetchWorkspaceOperationalTasks("open");
            prefetchWorkspaceOperationalTasks("completed");
        }
    }, [open]);
    const handleClose = useCallback(() => {
        setWorkView("overview");
        setNavFilter(null);
        setNavSelectedTaskId(null);
        setNewTaskNonce(0);
        onClose();
    }, [onClose]);

    const openQueue = useCallback(() => {
        setNavFilter("open");
        setNavSelectedTaskId(null);
        setWorkView("queue");
    }, []);

    const handleWorkViewChange = useCallback((view: WorkItemsWorkView) => {
        if (view === "queue") setNavFilter("open");
        setWorkView(view);
    }, []);

    const openTask = useCallback((taskId: string, filter: OperationalTaskWorkspaceFilter = "open") => {
        setNavSelectedTaskId(taskId);
        setNavFilter(filter);
        setWorkView("queue");
    }, []);


    useEffect(() => {
        const onOpenWorkItemsTask = (event: Event) => {
            const detail = (event as CustomEvent<OpenWorkItemsTaskDetail>).detail;
            const taskId = detail?.task_id?.trim();
            if (!taskId) return;
            openTask(taskId, detail.filter ?? "open");
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
                            onNavFilterClear={() => setNavFilter(null)}
                        />
                    )}
                </WorkItemsShell>
            </div>
        </AdminV2WorkspaceBosModalShell>
    );
}
