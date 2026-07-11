"use client";

import { MessageSquare, Link2, ListTodo, Clock3 } from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";

import type { EntityLabelsMap } from "@/contexts/EntityLabelsContext";
import type { MyTasksPresentationLabels } from "@/lib/agent/taskAssist/myTasksPresentationLabels";
import type { MyTasksTaskRow } from "@/lib/agent/taskAssist/myTasksTaskTypes";
import { formatOperationalTaskDueDisplay } from "@/lib/agent/taskAssist/formatOperationalTaskSourceLabel";
import WorkItemActivityPanel from "@/components/workItems/WorkItemActivityPanel";
import WorkItemBpContextPanel from "@/components/workItems/WorkItemBpContextPanel";
import WorkItemConversationPanel from "@/components/workItems/WorkItemConversationPanel";
import WorkItemProcessingContextPanel from "@/components/workItems/WorkItemProcessingContextPanel";
import WorkItemCommunicationsContextPanel from "@/components/workItems/WorkItemCommunicationsContextPanel";
import WorkItemCreateModal from "@/components/workItems/WorkItemCreateModal";
import { buildWorkItemBosSummary, buildWorkItemBreadcrumb } from "@/lib/workItems/mapWorkItemQueueRow";
import type { WorkItemCreationSession } from "@/lib/workItems/workItemCreationRuntime";
import type { WorkItemDraftEntity } from "@/lib/workItems/workItemDraftV1";
import type { WorkItemBpLabelOptions } from "@/lib/workItems/workItemBpProvenance";
import { isProcessingProjectedWorkItem } from "@/lib/workItems/mapProcessingCaseToWorkItemRow";
import { isCommunicationsProjectedWorkItem } from "@/lib/workItems/mapCommunicationThreadToWorkItemRow";

type DetailTabKey = "overview" | "activity" | "conversation" | "related";

const DETAIL_TABS: { key: DetailTabKey; label: string; icon: ReactNode }[] = [
    { key: "overview", label: "Overview", icon: <ListTodo className="h-3.5 w-3.5" aria-hidden /> },
    { key: "activity", label: "Activity", icon: <Clock3 className="h-3.5 w-3.5" aria-hidden /> },
    { key: "conversation", label: "Conversation", icon: <MessageSquare className="h-3.5 w-3.5" aria-hidden /> },
    { key: "related", label: "Related", icon: <Link2 className="h-3.5 w-3.5" aria-hidden /> },
];

export type WorkItemDetailPanelProps = {
    task: MyTasksTaskRow | null;
    taskCard: ReactNode | null;
    createOpen: boolean;
    createBusy: boolean;
    contextPrefill: WorkItemDraftEntity | null;
    workspaceSiteId: string | null;
    onCommitCreate: (session: WorkItemCreationSession) => Promise<void>;
    onCancelCreate: () => void;
    presentation: MyTasksPresentationLabels;
    entityLabels: EntityLabelsMap;
    bpLabelOptions?: WorkItemBpLabelOptions;
    onOpenRecord?: () => void;
    onOpenCurrentWork?: () => void;
    onOpenProcessing?: () => void;
    onOpenCommunications?: () => void;
};

function EmptyDetailState() {
    return (
        <div className="flex h-full flex-col items-center justify-center px-6 py-10 text-center" data-work-items-detail-empty="true">
            <ListTodo className="mb-2 h-9 w-9 text-alloy-midnight/20" aria-hidden strokeWidth={1.5} />
            <p className="text-[13px] font-medium text-alloy-midnight/70">Select a work item</p>
            <p className="mt-1 max-w-xs text-[11px] leading-snug text-alloy-midnight/45">
                Choose a work item from the queue to review its context and actions.
            </p>
        </div>
    );
}

export default function WorkItemDetailPanel({
    task,
    taskCard,
    createOpen,
    createBusy,
    contextPrefill,
    workspaceSiteId,
    onCommitCreate,
    onCancelCreate,
    presentation,
    entityLabels,
    bpLabelOptions,
    onOpenRecord,
    onOpenCurrentWork,
    onOpenProcessing,
    onOpenCommunications,
}: WorkItemDetailPanelProps) {
    const [activeTab, setActiveTab] = useState<DetailTabKey>("overview");

    const breadcrumb = useMemo(() => {
        if (!task) return null;
        return buildWorkItemBreadcrumb(task, presentation, entityLabels, bpLabelOptions);
    }, [bpLabelOptions, entityLabels, presentation, task]);

    const bosSummary = useMemo(() => {
        if (!task) return null;
        return buildWorkItemBosSummary(task, bpLabelOptions);
    }, [bpLabelOptions, task]);

    if (createOpen) {
        return (
            <WorkItemCreateModal
                open={createOpen}
                busy={createBusy}
                presentation={presentation}
                workspaceSiteId={workspaceSiteId}
                contextPrefill={contextPrefill}
                onCommit={onCommitCreate}
                onCancel={onCancelCreate}
            />
        );
    }

    if (!task) return <EmptyDetailState />;

    return (
        <div className="flex min-h-0 flex-1 flex-col" data-work-items-detail-panel="true">
            <div className="border-b border-alloy-stone/15 pb-2">
                <nav className="flex flex-wrap items-center gap-1" aria-label="Work item detail tabs">
                    {DETAIL_TABS.map((tab) => {
                        const active = tab.key === activeTab;
                        return (
                            <button
                                key={tab.key}
                                type="button"
                                onClick={() => setActiveTab(tab.key)}
                                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                                    active ?
                                        "bg-alloy-juniper/[0.08] text-alloy-juniper ring-1 ring-alloy-juniper/20"
                                    :   "text-alloy-midnight/58 hover:bg-alloy-stone/[0.05] hover:text-alloy-midnight/85"
                                }`}
                            >
                                {tab.icon}
                                <span>{tab.label}</span>
                            </button>
                        );
                    })}
                </nav>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto pt-3">
                {activeTab === "overview" ? (
                    <div className="space-y-3">
                        {task && isProcessingProjectedWorkItem(task) ?
                            <WorkItemProcessingContextPanel task={task} onOpenProcessing={onOpenProcessing} />
                        :   null}
                        {task && isCommunicationsProjectedWorkItem(task) ?
                            <WorkItemCommunicationsContextPanel task={task} onOpenCommunications={onOpenCommunications} />
                        :   null}
                        {!isCommunicationsProjectedWorkItem(task) ?
                            <WorkItemBpContextPanel
                            task={task}
                            labelOptions={bpLabelOptions}
                            onOpenRecord={onOpenRecord}
                            onOpenCurrentWork={onOpenCurrentWork}
                        />
                        :   null}
                        <div className="rounded-lg border border-alloy-juniper/20 bg-alloy-juniper/[0.06] px-3 py-2" data-work-items-bos-summary="true">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-juniper/80">BOS summary</p>
                            <p className="mt-1 text-[11px] leading-snug text-alloy-midnight/72">{bosSummary}</p>
                        </div>

                        <div className="rounded-lg border border-alloy-stone/16 bg-white px-3 py-2" data-work-items-overview-fields="true">
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">Work item fields</p>
                            <dl className="mt-1 space-y-1 text-[11px] text-alloy-midnight/65">
                                <div className="flex items-center justify-between gap-3">
                                    <dt className="text-alloy-midnight/45">Breadcrumb</dt>
                                    <dd className="truncate text-right">{breadcrumb ?? "General work"}</dd>
                                </div>
                                {!isCommunicationsProjectedWorkItem(task) ?
                                    <div className="flex items-center justify-between gap-3">
                                        <dt className="text-alloy-midnight/45">Due</dt>
                                        <dd>{formatOperationalTaskDueDisplay(task.due_at)}</dd>
                                    </div>
                                :   null}
                                <div className="flex items-center justify-between gap-3">
                                    <dt className="text-alloy-midnight/45">Status</dt>
                                    <dd className="capitalize">{task.status}</dd>
                                </div>
                                <div className="flex items-center justify-between gap-3">
                                    <dt className="text-alloy-midnight/45">Source</dt>
                                    <dd className="capitalize">{task.source.replace(/_/g, " ")}</dd>
                                </div>
                            </dl>
                        </div>

                        {!isProcessingProjectedWorkItem(task) && !isCommunicationsProjectedWorkItem(task) ?
                            <div data-work-items-detail-task-card="true">{taskCard}</div>
                        :   null}
                    </div>
                ) : null}

                {activeTab === "activity" ? <WorkItemActivityPanel task={task} /> : null}

                {activeTab === "conversation" ? <WorkItemConversationPanel task={task} /> : null}

                {activeTab === "related" ? (
                    <div className="space-y-3">
                        {isProcessingProjectedWorkItem(task) ?
                            <WorkItemProcessingContextPanel task={task} onOpenProcessing={onOpenProcessing} />
                        :   null}
                        {isCommunicationsProjectedWorkItem(task) ?
                            <WorkItemCommunicationsContextPanel task={task} onOpenCommunications={onOpenCommunications} />
                        :   null}
                        {!isCommunicationsProjectedWorkItem(task) ?
                            <WorkItemBpContextPanel
                            task={task}
                            labelOptions={bpLabelOptions}
                            onOpenRecord={onOpenRecord}
                            onOpenCurrentWork={onOpenCurrentWork}
                        />
                        :   null}
                        {!isProcessingProjectedWorkItem(task) && !isCommunicationsProjectedWorkItem(task) ?
                            <p className="text-[11px] text-alloy-midnight/55">
                                This work item shares execution state with Current Work on the linked record.
                            </p>
                        :   null}
                    </div>
                ) : null}
            </div>

            <footer className="mt-3 border-t border-alloy-stone/12 pt-2" data-work-items-detail-footer-composer="true">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">BOS composer</p>
                <div className="rounded-md border border-alloy-stone/18 bg-alloy-stone/[0.03] px-2.5 py-2 text-[11px] text-alloy-midnight/55">
                    BOS can summarize this work item now. Creating new BOS work items from this composer ships in a later slice.
                </div>
            </footer>
        </div>
    );
}
