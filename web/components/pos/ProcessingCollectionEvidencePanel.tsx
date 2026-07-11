"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProcessingCollectionGroupEvidence, ProcessingCollectionInstanceProposal } from "@/lib/pos/processingCase/collection/types";
import { instanceOriginLabel } from "@/lib/pos/processingCase/collection/collectionDisplayAdapters";
import type { RelatedRecordFieldDecisionKind, RelatedRecordProposalDecision } from "@/lib/intake/proposals/decisions";

function formatValue(display: string | null | undefined): string {
    if (display === null || display === undefined || display === "") return "—";
    return display;
}

type CommitResult = {
    status: string;
    field_results?: Array<{ provider_ref: string; old_value: unknown; proposed_value: unknown; outcome: string; message?: string }>;
    skipped_changes?: Array<{ provider_ref: string; reason: string; outcome: string }>;
};

type PreviewField = {
    provider_ref: string;
    label: string;
    current_value: unknown;
    proposed_value: unknown;
    decision: RelatedRecordFieldDecisionKind;
    action: "update" | "skip" | "block";
    reason?: string;
    validation_error?: string;
    stale_state?: string | null;
};

type PreviewPayload = {
    review_state?: string;
    can_commit?: boolean;
    fields?: PreviewField[];
};

type DecisionState = Record<string, RelatedRecordFieldDecisionKind>;

function isExistingChildCommitEligible(instance: ProcessingCollectionInstanceProposal): boolean {
    return instance.collection_provider_ref === "children"
        && instance.iteration_entity_type === "customer_member"
        && instance.origin === "existing"
        && Boolean(instance.existing_item_id)
        && instance.status === "valid";
}

function buildDecision(instance: ProcessingCollectionInstanceProposal, decisions: DecisionState): RelatedRecordProposalDecision {
    return {
        proposal_id: instance.proposal_id,
        field_decisions: instance.field_bindings
            .filter((binding) => binding.provider_ref)
            .map((binding) => ({ provider_ref: binding.provider_ref!, decision: decisions[binding.provider_ref!] ?? "defer" })),
    };
}

function InstanceBlock({ instance, caseId, onCommitted }: { instance: ProcessingCollectionInstanceProposal; caseId?: string; onCommitted?: () => void }) {
    const originLabel = instanceOriginLabel(instance.collection_provider_ref, instance.origin);
    const hasWarnings = instance.diagnostics.length > 0 || instance.status !== "valid";
    const eligible = Boolean(caseId) && isExistingChildCommitEligible(instance);
    const [decisions, setDecisions] = useState<DecisionState>({});
    const [busy, setBusy] = useState(false);
    const [previewBusy, setPreviewBusy] = useState(false);
    const [preview, setPreview] = useState<PreviewPayload | null>(null);
    const [result, setResult] = useState<CommitResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [alreadyDone, setAlreadyDone] = useState(false);

    const decisionPayload = useMemo(() => buildDecision(instance, decisions), [instance, decisions]);
    const canCommit = eligible && (preview?.can_commit ?? false) && !alreadyDone;

    useEffect(() => {
        if (!eligible || !caseId) {
            setPreview(null);
            return;
        }
        let cancelled = false;
        const timer = setTimeout(() => {
            setPreviewBusy(true);
            void fetch(`/api/admin/processing/cases/${caseId}/related-record-proposals/${encodeURIComponent(instance.proposal_id)}/preview`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ decision: decisionPayload }),
            })
                .then(async (res) => {
                    const json = (await res.json()) as { data?: { preview?: PreviewPayload; alreadyDone?: boolean; stored_result?: CommitResult }; error?: string };
                    if (!res.ok) throw new Error(json.error ?? "Preview failed");
                    if (cancelled) return;
                    setPreview(json.data?.preview ?? null);
                    setAlreadyDone(Boolean(json.data?.alreadyDone));
                    if (json.data?.stored_result) setResult(json.data.stored_result);
                })
                .catch((err) => {
                    if (!cancelled) setError(err instanceof Error ? err.message : "Preview failed");
                })
                .finally(() => {
                    if (!cancelled) setPreviewBusy(false);
                });
        }, 250);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [eligible, caseId, instance.proposal_id, decisionPayload]);

    const setAll = (decision: RelatedRecordFieldDecisionKind) => {
        const next: DecisionState = {};
        for (const binding of instance.field_bindings) if (binding.provider_ref) next[binding.provider_ref] = decision;
        setDecisions(next);
    };

    const commit = async () => {
        if (!caseId || busy || !canCommit) return;
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/processing/cases/${caseId}/related-record-proposals/${encodeURIComponent(instance.proposal_id)}/commit`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ decision: decisionPayload }),
            });
            const json = (await res.json()) as { data?: { result?: CommitResult; alreadyDone?: boolean; preview?: PreviewPayload }; error?: string };
            if (!res.ok) throw new Error(json.error ?? "Commit failed");
            setResult(json.data?.result ?? null);
            setPreview(json.data?.preview ?? preview);
            setAlreadyDone(Boolean(json.data?.alreadyDone));
            onCommitted?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Commit failed");
        } finally {
            setBusy(false);
        }
    };

    const previewByProvider = new Map((preview?.fields ?? []).map((f) => [f.provider_ref, f]));

    return (
        <div className="rounded-md border border-stone-200 bg-white/80 px-3 py-2.5" data-testid={`collection-instance-${instance.instance_key}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                    <p className="text-[12.5px] font-semibold text-alloy-midnight">{originLabel}</p>
                    {instance.identity_label ? <p className="text-[12px] text-stone-700">{instance.identity_label}</p> : null}
                </div>
                {instance.status !== "valid" ? <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-800">{instance.status}</span> : null}
            </div>

            {instance.field_bindings.length > 0 ? (
                <dl className="mt-2 space-y-1 border-t border-stone-100 pt-2">
                    {instance.field_bindings.map((b) => {
                        const providerRef = b.provider_ref ?? b.field_id;
                        const previewField = b.provider_ref ? previewByProvider.get(b.provider_ref) : undefined;
                        const fieldResult = result?.field_results?.find((r) => r.provider_ref === providerRef);
                        const skipped = result?.skipped_changes?.find((r) => r.provider_ref === providerRef);
                        return (
                            <div key={b.field_id} className="grid gap-1 text-[12px] sm:grid-cols-[9rem_1fr_auto]">
                                <dt className="text-stone-500">{b.label}</dt>
                                <dd className="min-w-0 font-medium text-alloy-midnight">
                                    <span className="text-stone-500">Current:</span> {formatValue(previewField ? String(previewField.current_value ?? "—") : undefined)}
                                    <span className="ml-2 text-stone-500">Submitted:</span> {formatValue(b.display_value)}
                                    {previewField ? (
                                        <span className="ml-2 text-[11px] text-stone-500">Plan: {previewField.action}{previewField.reason ? ` — ${previewField.reason}` : ""}</span>
                                    ) : null}
                                    {previewField?.validation_error ? <span className="ml-2 text-[11px] text-amber-800">Invalid: {previewField.validation_error}</span> : null}
                                    {previewField?.stale_state === "stale_conflict" ? <span className="ml-2 text-[11px] font-medium text-amber-900">Stale conflict</span> : null}
                                </dd>
                                {eligible && b.provider_ref ? (
                                    <select
                                        className="rounded border border-stone-200 bg-white px-1.5 py-0.5 text-[11px]"
                                        value={decisions[b.provider_ref] ?? "defer"}
                                        onChange={(e) => setDecisions((prev) => ({ ...prev, [b.provider_ref!]: e.target.value as RelatedRecordFieldDecisionKind }))}
                                        data-testid={`proposal-field-decision-${b.provider_ref}`}
                                    >
                                        <option value="defer">Defer</option>
                                        <option value="approve">Approve</option>
                                        <option value="reject">Reject</option>
                                    </select>
                                ) : null}
                                {fieldResult || skipped ? <p className="sm:col-span-3 text-[11px] text-stone-600">Result: {fieldResult?.outcome ?? skipped?.outcome} {fieldResult?.message ?? skipped?.reason ?? ""}</p> : null}
                            </div>
                        );
                    })}
                </dl>
            ) : <p className="mt-2 text-[11.5px] text-stone-400">No nested field values submitted.</p>}

            {eligible ? (
                <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-2">
                    <button type="button" className="rounded border border-stone-200 px-2 py-1 text-[11px]" onClick={() => setAll("approve")} data-testid="proposal-approve-all-fields">Approve all valid fields</button>
                    <button type="button" className="rounded border border-stone-200 px-2 py-1 text-[11px]" onClick={() => setAll("reject")}>Reject all</button>
                    <button type="button" className="rounded bg-alloy-midnight px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50" onClick={() => void commit()} disabled={busy || previewBusy || !canCommit} data-testid="proposal-commit-existing-child">{busy ? "Committing..." : alreadyDone ? "Already committed" : "Commit approved child updates"}</button>
                    <p className="text-[11px] text-stone-500">{previewBusy ? "Building commit plan..." : preview?.review_state ? `Review state: ${preview.review_state}` : "Only approved clean fields commit."}</p>
                </div>
            ) : null}

            {result ? <p className="mt-2 text-[11px] font-medium text-alloy-juniper">Commit result: {result.status}</p> : null}
            {error ? <p className="mt-2 text-[11px] text-amber-800">{error}</p> : null}
            {hasWarnings ? <ul className="mt-2 space-y-0.5 text-[11px] text-amber-800">{instance.diagnostics.map((d, i) => <li key={`${d.code}:${i}`}>{d.message}</li>)}</ul> : null}
        </div>
    );
}

function GroupBlock({ group, caseId, onCommitted }: { group: ProcessingCollectionGroupEvidence; caseId?: string; onCommitted?: () => void }) {
    return (
        <div className="space-y-2" data-testid={`collection-group-${group.group_id}`}>
            <div className="flex items-center gap-2">
                <h4 className="text-[13px] font-semibold text-alloy-midnight">{group.collection_label}</h4>
                {group.status !== "valid" ? <span className="text-[10px] font-medium uppercase tracking-wide text-amber-700">{group.status}</span> : null}
            </div>
            <div className="space-y-2">{group.instances.map((inst) => <InstanceBlock key={inst.instance_key} instance={inst} caseId={caseId} onCommitted={onCommitted} />)}</div>
            {group.diagnostics.length > 0 ? <ul className="text-[11px] text-amber-800">{group.diagnostics.map((d, i) => <li key={`${d.code}:${i}`}>{d.message}</li>)}</ul> : null}
        </div>
    );
}

export type ProcessingCollectionEvidencePanelProps = {
    groups: ProcessingCollectionGroupEvidence[];
    diagnostics?: Array<{ code: string; message: string }>;
    caseId?: string;
    onCommitted?: () => void;
};

export function ProcessingCollectionEvidencePanel({ groups, diagnostics = [], caseId, onCommitted }: ProcessingCollectionEvidencePanelProps) {
    if (groups.length === 0 && diagnostics.length === 0) return null;
    return (
        <div className="space-y-3" data-testid="processing-collection-evidence">
            {groups.map((g) => <GroupBlock key={`${g.group_id}:${g.collection_provider_ref}`} group={g} caseId={caseId} onCommitted={onCommitted} />)}
            {diagnostics.length > 0 ? <ul className="rounded-md border border-amber-200 bg-amber-50/60 px-2.5 py-2 text-[11px] text-amber-900">{diagnostics.map((d, i) => <li key={`${d.code}:${i}`}>{d.message}</li>)}</ul> : null}
        </div>
    );
}
