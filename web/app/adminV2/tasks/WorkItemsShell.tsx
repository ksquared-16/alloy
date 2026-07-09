"use client";

import type { ReactNode } from "react";
import { ListChecks, Plus } from "lucide-react";

import OperationalWorkspaceModeNav from "@/app/adminV2/components/OperationalWorkspaceModeNav";
import OperationalModalHeader, {
    OPERATIONAL_PRIMARY_ACTION_CLASS,
} from "@/app/adminV2/components/OperationalModalHeader";
import { COMMS_WORKSPACE_EXECUTION_CLASS } from "@/app/adminV2/communications/commsWorkspaceUi";
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
    return (
        <div
            className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-alloy-stone/20 bg-white"
            data-testid="work-items-shell"
            data-adminv2-tasks-modal="true"
        >
            <OperationalModalHeader
                icon={<ListChecks className="h-4 w-4" aria-hidden strokeWidth={2} />}
                title="Work Items"
                subtitle="Where operational work gets completed."
                titleId="adminv2-tasks-modal-title"
                onClose={onClose}
                closeLabel="Close Work Items"
                actions={
                    <button
                        type="button"
                        data-adminv2-new-task="true"
                        className={OPERATIONAL_PRIMARY_ACTION_CLASS}
                        onClick={onNewTask}
                    >
                        <Plus className="h-3.5 w-3.5" aria-hidden strokeWidth={2.25} />
                        New task
                    </button>
                }
            />

            <OperationalWorkspaceModeNav
                modes={WORK_ITEMS_MODES}
                activeMode="work"
                onModeChange={() => {}}
                modeAriaLabel="Work Items mode"
                sectionTabs={WORK_ITEMS_WORK_TABS}
                activeSection={workView}
                onSectionChange={onWorkViewChange}
                sectionAriaLabel="Work sections"
                navDataAttr="work-items"
                sectionsDataAttr="work-items"
            />

            <div
                className={`${COMMS_WORKSPACE_EXECUTION_CLASS} !min-h-0 !border-t-0 !bg-white !p-0`}
                data-work-items-workspace-execution="true"
            >
                {children}
            </div>
        </div>
    );
}
