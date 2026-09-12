"use client";

import type { ReactNode } from "react";
import { ListChecks, Plus } from "lucide-react";

import WorkspaceShell from "@/components/workspace/WorkspaceShell";
import WorkspaceSurface from "@/components/workspace/WorkspaceSurface";
import { WS_ACTION_PRIMARY } from "@/components/workspace/workspaceTokens";
import WorkItemsKpiStrip from "@/app/adminV2/tasks/WorkItemsKpiStrip";
import {
    WORK_ITEMS_MODES,
    workItemsTabsForMode,
    type WorkItemsMode,
    type WorkItemsView,
    type WorkItemsWorkView,
} from "@/app/adminV2/tasks/workItemsSections";

export type { WorkItemsWorkView, WorkItemsView, WorkItemsMode };

export default function WorkItemsShell({
    mode,
    onModeChange,
    workView,
    onWorkViewChange,
    onClose,
    onNewTask,
    children,
}: {
    mode: WorkItemsMode;
    onModeChange: (mode: WorkItemsMode) => void;
    workView: WorkItemsView;
    onWorkViewChange: (view: WorkItemsView) => void;
    onClose: () => void;
    onNewTask: () => void;
    children: ReactNode;
}) {
    // Overview and Studio are launch/authoring surfaces; the queue health strip belongs to the queue.
    const hideHeaderMetrics = workView !== "queue";
    const isQueue = workView === "queue";

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
                actions:
                    mode === "work" ?
                        <button
                            type="button"
                            data-adminv2-new-task="true"
                            className={WS_ACTION_PRIMARY}
                            onClick={onNewTask}
                        >
                            <Plus className="h-3.5 w-3.5" aria-hidden strokeWidth={2.25} />
                            Create Work Item
                        </button>
                    :   undefined,
            }}
            modes={WORK_ITEMS_MODES}
            activeMode={mode}
            onModeChange={(next) => onModeChange(next as WorkItemsMode)}
            modeAriaLabel="Work Items mode"
            sectionTabs={workItemsTabsForMode(mode)}
            activeSection={workView}
            onSectionChange={(next) => onWorkViewChange(next as WorkItemsView)}
            sectionAriaLabel={mode === "studio" ? "Studio sections" : "Work sections"}
            metricsColumn={hideHeaderMetrics ? undefined : <WorkItemsKpiStrip />}
            navDataAttr="work-items"
            sectionsDataAttr="work-items"
        >
            <WorkspaceSurface scroll={!isQueue} padded={!isQueue} tone={isQueue ? "canvas" : "stone"} className={isQueue ? "!p-0" : ""} data-work-items-workspace-execution="true">
                {children}
            </WorkspaceSurface>
        </WorkspaceShell>
    );
}
