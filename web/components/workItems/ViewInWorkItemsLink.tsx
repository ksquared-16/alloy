"use client";

import { ExternalLink } from "lucide-react";

import { dispatchOpenWorkItemsTask } from "@/lib/workItems/workItemsNavigation";

export type ViewInWorkItemsLinkProps = {
    taskId: string;
    opportunityId?: string | null;
    className?: string;
};

export default function ViewInWorkItemsLink({ taskId, opportunityId, className }: ViewInWorkItemsLinkProps) {
    const trimmedTaskId = taskId.trim();
    if (!trimmedTaskId) return null;

    return (
        <button
            type="button"
            className={
                className ??
                "inline-flex items-center gap-1 rounded-md border border-alloy-stone/22 bg-white px-2 py-1 text-[10px] font-semibold text-alloy-juniper hover:bg-alloy-juniper/[0.05]"
            }
            data-work-items-cross-link="view-in-queue"
            onClick={() =>
                dispatchOpenWorkItemsTask({
                    task_id: trimmedTaskId,
                    opportunity_id: opportunityId?.trim() || null,
                    filter: "open",
                })
            }
        >
            <ExternalLink className="h-3 w-3" aria-hidden />
            View in Work Items
        </button>
    );
}
