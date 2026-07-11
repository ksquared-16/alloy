"use client";

import type { ProcessingCollectionGroupEvidence, ProcessingCollectionInstanceProposal } from "@/lib/pos/processingCase/collection/types";
import { instanceOriginLabel } from "@/lib/pos/processingCase/collection/collectionDisplayAdapters";

function formatValue(display: string | null): string {
    if (display === null || display === "") return "—";
    return display;
}

function InstanceBlock({ instance }: { instance: ProcessingCollectionInstanceProposal }) {
    const originLabel = instanceOriginLabel(instance.collection_provider_ref, instance.origin);
    const hasWarnings = instance.diagnostics.length > 0 || instance.status !== "valid";

    return (
        <div
            className="rounded-md border border-stone-200 bg-white/80 px-3 py-2.5"
            data-testid={`collection-instance-${instance.instance_key}`}
        >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                    <p className="text-[12.5px] font-semibold text-alloy-midnight">{originLabel}</p>
                    {instance.identity_label ? (
                        <p className="text-[12px] text-stone-700">{instance.identity_label}</p>
                    ) : null}
                </div>
                {instance.status !== "valid" ? (
                    <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800">
                        {instance.status}
                    </span>
                ) : null}
            </div>

            {instance.field_bindings.length > 0 ? (
                <dl className="mt-2 space-y-1 border-t border-stone-100 pt-2">
                    {instance.field_bindings.map((b) => (
                        <div key={b.field_id} className="flex gap-2 text-[12px]">
                            <dt className="w-36 shrink-0 text-stone-500">{b.label}</dt>
                            <dd className="min-w-0 flex-1 font-medium text-alloy-midnight">{formatValue(b.display_value)}</dd>
                        </div>
                    ))}
                </dl>
            ) : (
                <p className="mt-2 text-[11.5px] text-stone-400">No nested field values submitted.</p>
            )}

            {hasWarnings ? (
                <ul className="mt-2 space-y-0.5 text-[11px] text-amber-800">
                    {instance.diagnostics.map((d, i) => (
                        <li key={`${d.code}:${i}`}>{d.message}</li>
                    ))}
                </ul>
            ) : null}
        </div>
    );
}

function GroupBlock({ group }: { group: ProcessingCollectionGroupEvidence }) {
    return (
        <div className="space-y-2" data-testid={`collection-group-${group.group_id}`}>
            <div className="flex items-center gap-2">
                <h4 className="text-[13px] font-semibold text-alloy-midnight">{group.collection_label}</h4>
                {group.status !== "valid" ? (
                    <span className="text-[10px] font-medium uppercase tracking-wide text-amber-700">{group.status}</span>
                ) : null}
            </div>
            <div className="space-y-2">
                {group.instances.map((inst) => (
                    <InstanceBlock key={inst.instance_key} instance={inst} />
                ))}
            </div>
            {group.diagnostics.length > 0 ? (
                <ul className="text-[11px] text-amber-800">
                    {group.diagnostics.map((d, i) => (
                        <li key={`${d.code}:${i}`}>{d.message}</li>
                    ))}
                </ul>
            ) : null}
        </div>
    );
}

export type ProcessingCollectionEvidencePanelProps = {
    groups: ProcessingCollectionGroupEvidence[];
    diagnostics?: Array<{ code: string; message: string }>;
};

/** P5A — grouped read-only collection evidence for Processing review. */
export function ProcessingCollectionEvidencePanel({ groups, diagnostics = [] }: ProcessingCollectionEvidencePanelProps) {
    if (groups.length === 0 && diagnostics.length === 0) return null;

    return (
        <div className="space-y-3" data-testid="processing-collection-evidence">
            {groups.map((g) => (
                <GroupBlock key={`${g.group_id}:${g.collection_provider_ref}`} group={g} />
            ))}
            {diagnostics.length > 0 ? (
                <ul className="rounded-md border border-amber-200 bg-amber-50/60 px-2.5 py-2 text-[11px] text-amber-900">
                    {diagnostics.map((d, i) => (
                        <li key={`${d.code}:${i}`}>{d.message}</li>
                    ))}
                </ul>
            ) : null}
        </div>
    );
}
