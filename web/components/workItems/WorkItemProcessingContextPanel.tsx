"use client";

import type { MyTasksTaskRow } from "@/lib/agent/taskAssist/myTasksTaskTypes";
import {
    buildWorkItemProcessingProvenanceChain,
    formatWorkItemProcessingProvenanceChain,
} from "@/lib/workItems/workItemProcessingProvenance";

export type WorkItemProcessingContextPanelProps = {
    task: MyTasksTaskRow;
    onOpenProcessing?: () => void;
};

export default function WorkItemProcessingContextPanel({ task, onOpenProcessing }: WorkItemProcessingContextPanelProps) {
    const chain = buildWorkItemProcessingProvenanceChain(task);

    return (
        <div className="space-y-2 rounded-lg border border-alloy-stone/16 bg-alloy-stone/[0.02] px-3 py-2" data-work-items-processing-context="true">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">Processing context</p>
            <p className="text-[11px] leading-snug text-alloy-midnight/72" data-work-items-processing-provenance-chain="true">
                {formatWorkItemProcessingProvenanceChain(chain)}
            </p>
            <dl className="grid gap-1 text-[11px] text-alloy-midnight/65">
                <div className="flex justify-between gap-3">
                    <dt className="text-alloy-midnight/45">Case</dt>
                    <dd className="truncate text-right">{task.processing_source_label ?? task.processing_case_id}</dd>
                </div>
                <div className="flex justify-between gap-3">
                    <dt className="text-alloy-midnight/45">Lane</dt>
                    <dd>{task.processing_lane?.replace(/_/g, " ") ?? "needs review"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                    <dt className="text-alloy-midnight/45">Authority</dt>
                    <dd>Processing case remains system of record</dd>
                </div>
            </dl>
            {onOpenProcessing ?
                <button
                    type="button"
                    className="rounded-md border border-alloy-juniper/25 bg-alloy-juniper/[0.06] px-2 py-1 text-[10px] font-semibold text-alloy-juniper hover:bg-alloy-juniper/[0.1]"
                    data-work-items-cross-link="open-processing"
                    onClick={onOpenProcessing}
                >
                    Open in Processing
                </button>
            :   null}
        </div>
    );
}
