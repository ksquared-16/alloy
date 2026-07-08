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

export type MyTasksModalProps = {
    open: boolean;
    onClose: () => void;
};

export default function MyTasksModal({ open, onClose }: MyTasksModalProps) {
    const [workView, setWorkView] = useState<WorkItemsWorkView>("overview");
    const [newTaskNonce, setNewTaskNonce] = useState(0);
    const [navFilter, setNavFilter] = useState<OperationalTaskWorkspaceFilter>("open");
    const [navSelectedTaskId, setNavSelectedTaskId] = useState<string | null>(null);

    useEffect(() => {
        if (open) {
            prefetchWorkspaceOperationalTasks("open");
            prefetchWorkspaceOperationalTasks("completed");
        }
    }, [open]);

    const handleClose = useCallback(() => {
        setWorkView("overview");
        setNavFilter("open");
        setNavSelectedTaskId(null);
        setNewTaskNonce(0);
        onClose();
    }, [onClose]);

    const openQueue = useCallback(() => {
        setWorkView("queue");
    }, []);

    const openTask = useCallback((taskId: string, filter: OperationalTaskWorkspaceFilter = "open") => {
        setNavSelectedTaskId(taskId);
        setNavFilter(filter);
        setWorkView("queue");
    }, []);

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
                    onWorkViewChange={setWorkView}
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
                        />
                    )}
                </WorkItemsShell>
            </div>
        </AdminV2WorkspaceBosModalShell>
    );
}
