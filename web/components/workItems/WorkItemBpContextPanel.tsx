"use client";

import type { MyTasksTaskRow } from "@/lib/agent/taskAssist/myTasksTaskTypes";
import {
    buildWorkItemBpProvenanceChain,
    formatWorkItemBpProvenanceChain,
    resolveWorkItemProcessLabel,
    resolveWorkItemStageLabel,
    type WorkItemBpLabelOptions,
} from "@/lib/workItems/workItemBpProvenance";
import { isBusinessProcessStageWorkTaskRow } from "@/lib/lifecycle/isBusinessProcessStageWorkTaskRow";

export type WorkItemBpContextPanelProps = {
    task: MyTasksTaskRow;
    labelOptions?: WorkItemBpLabelOptions;
    onOpenRecord?: () => void;
    onOpenCurrentWork?: () => void;
};

export default function WorkItemBpContextPanel({
    task,
    labelOptions,
    onOpenRecord,
    onOpenCurrentWork,
}: WorkItemBpContextPanelProps) {
    if (!isBusinessProcessStageWorkTaskRow(task)) return null;

    const chain = buildWorkItemBpProvenanceChain(task, labelOptions);
    const processLabel = resolveWorkItemProcessLabel(task, labelOptions);
    const stageLabel = resolveWorkItemStageLabel(task, labelOptions);
    const canOpenRecord = Boolean(task.entity_id?.trim() && task.entity_type === "opportunities");

    return (
        <div
            className="space-y-2 rounded-lg border border-alloy-stone/16 bg-alloy-stone/[0.02] px-3 py-2"
            data-work-items-bp-context="true"
        >
            <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">Business Process context</p>
            <p className="text-[11px] leading-snug text-alloy-midnight/72" data-work-items-bp-provenance-chain="true">
                {formatWorkItemBpProvenanceChain(chain)}
            </p>
            <dl className="grid gap-1 text-[11px] text-alloy-midnight/65">
                <div className="flex justify-between gap-3">
                    <dt className="text-alloy-midnight/45">Business Process</dt>
                    <dd>{processLabel}</dd>
                </div>
                <div className="flex justify-between gap-3">
                    <dt className="text-alloy-midnight/45">Current stage</dt>
                    <dd>{stageLabel ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                    <dt className="text-alloy-midnight/45">Operating plan work</dt>
                    <dd className="truncate text-right">{task.title}</dd>
                </div>
                <div className="flex justify-between gap-3">
                    <dt className="text-alloy-midnight/45">Stage position</dt>
                    <dd>{stageLabel ? `In ${stageLabel}` : "Unavailable until stage runtime is linked"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                    <dt className="text-alloy-midnight/45">Operating plan</dt>
                    <dd>{task.work_definition_key?.replace(/[_-]+/g, " ") ?? task.title}</dd>
                </div>
                <div className="flex justify-between gap-3">
                    <dt className="text-alloy-midnight/45">Previous outcome</dt>
                    <dd>See Current Work on the record</dd>
                </div>
                <div className="flex justify-between gap-3">
                    <dt className="text-alloy-midnight/45">Next expected outcome</dt>
                    <dd>Configured in stage operating plan</dd>
                </div>
                <div className="flex justify-between gap-3">
                    <dt className="text-alloy-midnight/45">Current Work state</dt>
                    <dd>Same execution on the linked record</dd>
                </div>
            </dl>
            <div className="flex flex-wrap gap-1.5 pt-0.5">
                {canOpenRecord && onOpenRecord ?
                    <button
                        type="button"
                        className="rounded-md border border-alloy-stone/22 px-2 py-1 text-[10px] font-semibold text-alloy-midnight/75 hover:bg-alloy-stone/[0.04]"
                        data-work-items-cross-link="open-record"
                        onClick={onOpenRecord}
                    >
                        Open record
                    </button>
                :   null}
                {canOpenRecord && onOpenCurrentWork ?
                    <button
                        type="button"
                        className="rounded-md border border-alloy-juniper/25 bg-alloy-juniper/[0.06] px-2 py-1 text-[10px] font-semibold text-alloy-juniper hover:bg-alloy-juniper/[0.1]"
                        data-work-items-cross-link="open-current-work"
                        onClick={onOpenCurrentWork}
                    >
                        Open Current Work
                    </button>
                :   null}
            </div>
        </div>
    );
}
