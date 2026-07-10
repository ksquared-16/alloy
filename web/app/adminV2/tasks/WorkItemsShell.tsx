"use client";

import type { ReactNode } from "react";
import { ListChecks, Plus } from "lucide-react";

import WorkspaceShell from "@/components/workspace/WorkspaceShell";
import WorkspaceSurface from "@/components/workspace/WorkspaceSurface";
import { WS_ACTION_PRIMARY } from "@/components/workspace/workspaceTokens";
import WorkItemsKpiStrip from "@/app/adminV2/tasks/WorkItemsKpiStrip";
import {
    WORK_ITEMS_MODES,
    WORK_ITEMS_WORK_TABS,
    type WorkItemsWorkView,
} from "@/app/adminV2/tasks/workItemsSections";

export type { WorkItemsWorkView };

export default function WorkItemsShell({
    workView,
    onWorkViewChange,
    onClose,
    onNewTask,
    children,
}: {
    workView: WorkItemsWorkView;
    onWorkViewChange: (view: WorkItemsWorkView) => void;
    onClose: () => void;
    onNewTask: () => void;
    children: ReactNode;
}) {
    const hideHeaderMetrics = workView === "overview";

    return (
        <WorkspaceShell
            dataTestId="work-items-shell"
            shellDataAttrs={{ "data-adminv2-tasks-modal": true }}
            header={{
                icon: <ListChecks className="h-4 w-4" aria-hidden strokeWidth={2} />,
                title: "Work Items",
                subtitle: "Where operational work gets completed.",
                titleId: "adminv2-tasks-modal-title",
                onClose,
                closeLabel: "Close Work Items",
                actions: (
                    <button
                        type="button"
                        data-adminv2-new-task="true"
                        className={WS_ACTION_PRIMARY}
                        onClick={onNewTask}
                    >
                        <Plus className="h-3.5 w-3.5" aria-hidden strokeWidth={2.25} />
                        New task
                    </button>
                ),
            }}
            modes={WORK_ITEMS_MODES}
            activeMode="work"
            onModeChange={() => {}}
            modeAriaLabel="Work Items mode"
            sectionTabs={WORK_ITEMS_WORK_TABS}
            activeSection={workView}
            onSectionChange={onWorkViewChange}
            sectionAriaLabel="Work sections"
            metricsColumn={hideHeaderMetrics ? undefined : <WorkItemsKpiStrip />}
            navDataAttr="work-items"
            sectionsDataAttr="work-items"
        >
            <WorkspaceSurface scroll={workView === "overview"} padded={workView === "overview"} tone={workView === "queue" ? "canvas" : "stone"} className={workView === "queue" ? "!p-0" : ""} data-work-items-workspace-execution="true">
                {children}
            </WorkspaceSurface>
        </WorkspaceShell>
    );
}
