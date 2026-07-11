"use client";

import { useMemo } from "react";

import type { ValidationIssueV1, WorkItemDraftV1 } from "@/lib/workItems/workItemDraftV1";
import { mapWorkItemDraftPreview } from "@/lib/workItems/mapWorkItemDraftPreview";

export type WorkItemCreatePreviewPanelProps = {
    draft: WorkItemDraftV1;
    validationIssues: ValidationIssueV1[];
};

function PreviewField({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-start justify-between gap-3 text-[11px]">
            <dt className="shrink-0 text-alloy-midnight/45">{label}</dt>
            <dd className="min-w-0 text-right text-alloy-midnight/78">{value}</dd>
        </div>
    );
}

export default function WorkItemCreatePreviewPanel({ draft, validationIssues }: WorkItemCreatePreviewPanelProps) {
    const preview = useMemo(() => mapWorkItemDraftPreview(draft), [draft]);
    const blocking = validationIssues.filter((i) => i.severity === "block");

    return (
        <div className="flex min-h-0 flex-1 flex-col" data-work-item-create-preview="true" aria-live="polite">
            <div className="border-b border-alloy-stone/15 pb-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/45">Live preview</p>
                <h3 className="mt-1 text-[15px] font-semibold text-alloy-midnight">{preview.title}</h3>
                <div className="mt-1 flex flex-wrap gap-1">
                    <span className="rounded-full border border-alloy-stone/20 bg-white px-2 py-0.5 text-[10px] font-semibold text-alloy-midnight/65">
                        {preview.categoryLabel}
                    </span>
                    <span className="rounded-full border border-alloy-juniper/20 bg-alloy-juniper/[0.06] px-2 py-0.5 text-[10px] font-semibold text-alloy-juniper">
                        {preview.priorityLabel}
                    </span>
                    <span
                        className="rounded-full border border-alloy-stone/20 bg-alloy-stone/[0.04] px-2 py-0.5 text-[10px] font-semibold capitalize text-alloy-midnight/60"
                        data-work-item-draft-status={draft.status}
                    >
                        {draft.status.replace(/_/g, " ")}
                    </span>
                </div>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto py-3">
                <div className="rounded-lg border border-alloy-juniper/20 bg-alloy-juniper/[0.06] px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-juniper/80">BOS summary</p>
                    <p className="mt-1 text-[11px] leading-snug text-alloy-midnight/72">{preview.bosSummary}</p>
                </div>

                <div className="rounded-lg border border-alloy-stone/16 bg-white px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">Work item fields</p>
                    <dl className="mt-2 space-y-1.5">
                        <PreviewField label="Record" value={preview.recordLabel} />
                        <PreviewField label="Process" value={preview.processLabel} />
                        <PreviewField label="Due" value={preview.dueLabel} />
                        <PreviewField label="Assignee" value={preview.assigneeLabel} />
                        <PreviewField label="Waiting" value={preview.waitingLabel ?? "Not waiting"} />
                        <PreviewField label="Follow-on" value={preview.followOnLabel ?? "None yet"} />
                        <PreviewField label="Checklist" value={preview.checklistLabel} />
                        <PreviewField label="Provenance" value={preview.provenanceLabel} />
                    </dl>
                </div>

                {draft.description?.trim() ? (
                    <div className="rounded-lg border border-alloy-stone/16 bg-white px-3 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">Description</p>
                        <p className="mt-1 whitespace-pre-wrap text-[11px] leading-snug text-alloy-midnight/70">{draft.description}</p>
                    </div>
                ) : null}

                {preview.tags.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                        {preview.tags.map((tag) => (
                            <span key={tag} className="rounded-full border border-alloy-stone/20 px-2 py-0.5 text-[10px] text-alloy-midnight/60">
                                {tag}
                            </span>
                        ))}
                    </div>
                ) : null}

                {blocking.length > 0 ? (
                    <div className="rounded-lg border border-amber-200/80 bg-amber-50/70 px-3 py-2" role="status">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-900/70">Needs clarification</p>
                        <ul className="mt-1 space-y-0.5 text-[11px] text-amber-950/85">
                            {blocking.map((issue) => (
                                <li key={issue.code}>{issue.message}</li>
                            ))}
                        </ul>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
