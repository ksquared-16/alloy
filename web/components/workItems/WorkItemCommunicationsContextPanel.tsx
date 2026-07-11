"use client";

import type { MyTasksTaskRow } from "@/lib/agent/taskAssist/myTasksTaskTypes";
import { conversationChannelLabel } from "@/lib/communications/v2/commandCenterViewModel";
import {
    buildWorkItemCommunicationsProvenanceChain,
    formatWorkItemCommunicationsProvenanceChain,
} from "@/lib/workItems/workItemCommunicationsProvenance";

export type WorkItemCommunicationsContextPanelProps = {
    task: MyTasksTaskRow;
    onOpenCommunications?: () => void;
};

export default function WorkItemCommunicationsContextPanel({
    task,
    onOpenCommunications,
}: WorkItemCommunicationsContextPanelProps) {
    const chain = buildWorkItemCommunicationsProvenanceChain(task);

    return (
        <div className="space-y-2 rounded-lg border border-alloy-stone/16 bg-alloy-stone/[0.02] px-3 py-2" data-work-items-communications-context="true">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">Communications context</p>
            <p className="text-[11px] leading-snug text-alloy-midnight/72" data-work-items-communications-provenance-chain="true">
                {formatWorkItemCommunicationsProvenanceChain(chain)}
            </p>
            <dl className="grid gap-1 text-[11px] text-alloy-midnight/65">
                <div className="flex justify-between gap-3">
                    <dt className="text-alloy-midnight/45">Family</dt>
                    <dd className="truncate text-right">{task.communication_family_label ?? task.entity_label ?? "Thread"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                    <dt className="text-alloy-midnight/45">Channel</dt>
                    <dd>{conversationChannelLabel(task.communication_channel)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                    <dt className="text-alloy-midnight/45">State</dt>
                    <dd>Needs Reply</dd>
                </div>
                <div className="flex justify-between gap-3">
                    <dt className="text-alloy-midnight/45">Authority</dt>
                    <dd>Communications thread remains system of record</dd>
                </div>
            </dl>
            {onOpenCommunications ?
                <button
                    type="button"
                    className="rounded-md border border-alloy-juniper/25 bg-alloy-juniper/[0.06] px-2 py-1 text-[10px] font-semibold text-alloy-juniper hover:bg-alloy-juniper/[0.1]"
                    data-work-items-cross-link="open-communications"
                    onClick={onOpenCommunications}
                >
                    Open in Communications
                </button>
            :   null}
        </div>
    );
}
