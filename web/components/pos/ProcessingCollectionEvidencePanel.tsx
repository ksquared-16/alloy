"use client";

import { useEffect, useMemo, useState } from "react";
import type { ProcessingCollectionGroupEvidence, ProcessingCollectionInstanceProposal } from "@/lib/pos/processingCase/collection/types";
import { instanceOriginLabel } from "@/lib/pos/processingCase/collection/collectionDisplayAdapters";
import type { RelatedRecordFieldDecisionKind, RelatedRecordProposalDecision } from "@/lib/intake/proposals/decisions";
import { relationshipDefinitionForRef } from "@/lib/fields/relationship/relationshipDefinitions";
import { healthFactKindForFormProvider } from "@/lib/health/healthFactFormMembers";

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

            {caseId && isNewChildCommitEligible(instance) ? <NewChildCommitBlock instance={instance} caseId={caseId} onCommitted={onCommitted} /> : null}
            {caseId && healthFactDecisionKind(instance) ? <HealthFactDecisionBlock instance={instance} caseId={caseId} kind={healthFactDecisionKind(instance)!} onCommitted={onCommitted} /> : null}
            {caseId && relationshipDecisionLabel(instance) ? <RelationshipDecisionBlock instance={instance} caseId={caseId} label={relationshipDecisionLabel(instance)!} onCommitted={onCommitted} /> : null}
            {result ? <p className="mt-2 text-[11px] font-medium text-alloy-juniper">Commit result: {result.status}</p> : null}
            {error ? <p className="mt-2 text-[11px] text-amber-800">{error}</p> : null}
            {hasWarnings ? <ul className="mt-2 space-y-0.5 text-[11px] text-amber-800">{instance.diagnostics.map((d, i) => <li key={`${d.code}:${i}`}>{d.message}</li>)}</ul> : null}
        </div>
    );
}

/** A valid allergy, condition or medication row — recorded on the child's Medical card only on approval. */
function healthFactDecisionKind(instance: ProcessingCollectionInstanceProposal): string | null {
    if (instance.status !== "valid") return null;
    return healthFactKindForFormProvider(instance.collection_provider_ref);
}

/**
 * Record or reject a health fact the family wrote. The server reads the fact from the submission,
 * writes it onto the child the paperwork is about, and requires permission to change health
 * information; nothing here asserts a child, a kind or a severity.
 */
function HealthFactDecisionBlock({ instance, caseId, kind, onCommitted }: { instance: ProcessingCollectionInstanceProposal; caseId: string; kind: string; onCommitted?: () => void }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState<string | null>(null);
    const [reason, setReason] = useState("");
    const base = `/api/admin/processing/cases/${caseId}/related-record-proposals/${encodeURIComponent(instance.proposal_id)}`;
    const act = async (action: "commit" | "reject") => {
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(`${base}/${action}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(action === "commit"
                    ? { decision: { proposal_id: instance.proposal_id, instance_decision: "approve", field_decisions: [] } }
                    : { reason: reason || null }),
            });
            const json = (await res.json()) as { error?: string; data?: { outcome?: string } };
            if (!res.ok) {
                setError(json.error ?? (action === "commit" ? `The ${kind} could not be recorded.` : "The proposal could not be rejected."));
                return;
            }
            const outcome = json.data?.outcome;
            setDone(action === "reject"
                ? "Rejected — nothing was recorded"
                : outcome === "already_on_record" ? `Already on the child's Medical card`
                : outcome === "corrected" ? `Updated the ${kind} on the child's Medical card`
                : `Recorded on the child's Medical card`);
            onCommitted?.();
        } finally {
            setBusy(false);
        }
    };
    if (done) return <p className="mt-2 text-[11px] font-medium text-alloy-juniper" data-testid="health-fact-decision-done">{done}</p>;
    return (
        <div className="mt-2 space-y-1.5 border-t border-stone-100 pt-2" data-testid="health-fact-decision">
            <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="rounded bg-alloy-midnight px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50" disabled={busy} onClick={() => void act("commit")} data-testid="health-fact-commit">
                    {busy ? "Working..." : `Record ${kind} on Medical card`}
                </button>
                <input aria-label="Reason to reject" placeholder="Reason (optional)" className="min-w-[10rem] rounded border border-stone-200 px-1.5 py-0.5 text-[12px]" value={reason} onChange={(e) => setReason(e.target.value)} data-testid="health-fact-reject-reason" />
                <button type="button" className="rounded border border-stone-200 px-2 py-1 text-[11px] disabled:opacity-50" disabled={busy} onClick={() => void act("reject")} data-testid="health-fact-reject">
                    Reject
                </button>
            </div>
            {error ? <p className="text-[11px] text-amber-800" data-testid="health-fact-decision-error">{error}</p> : null}
        </div>
    );
}

/** A valid proposed relationship (guardian, emergency contact, pick-up, physician…) the operator may decide. */
function relationshipDecisionLabel(instance: ProcessingCollectionInstanceProposal): string | null {
    if (instance.status !== "valid" || instance.origin !== "respondent_added") return null;
    return relationshipDefinitionForRef(instance.collection_provider_ref)?.label ?? null;
}

/**
 * Commit or reject a proposed relationship through the existing guarded routes. The server derives the
 * role, the household and the child the paperwork is about; nothing here asserts them.
 */
type RelationshipIdentityCandidate = { person_id: string; display_name: string; in_household: boolean; same_name: boolean; contact_match?: boolean };

/**
 * Commit or reject a proposed relationship through the existing guarded routes. The server derives the
 * role, the household and the child the paperwork is about; nothing here asserts them.
 *
 * WHEN THE PERSON IS AMBIGUOUS (an email or phone already belongs to someone), the operator decides:
 * use that existing person, or correct the details the family submitted and add a new person. The
 * relationship authority validates either choice; nothing is guessed.
 */
function RelationshipDecisionBlock({ instance, caseId, label, onCommitted }: { instance: ProcessingCollectionInstanceProposal; caseId: string; label: string; onCommitted?: () => void }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState<string | null>(null);
    const [reason, setReason] = useState("");
    const [candidates, setCandidates] = useState<RelationshipIdentityCandidate[] | null>(null);
    const [correcting, setCorrecting] = useState(false);
    const submitted = useMemo(() => submittedPersonIdentity(instance), [instance]);
    const [fix, setFix] = useState(submitted);
    const base = `/api/admin/processing/cases/${caseId}/related-record-proposals/${encodeURIComponent(instance.proposal_id)}`;

    const act = async (kind: "commit" | "reject", extra: Record<string, unknown> = {}) => {
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(`${base}/${kind}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(kind === "commit"
                    ? { decision: { proposal_id: instance.proposal_id, instance_decision: "approve", field_decisions: [] }, ...extra }
                    : { reason: reason || null }),
            });
            const json = (await res.json()) as { error?: string; code?: string; identity_candidates?: RelationshipIdentityCandidate[]; data?: { outcome?: string } };
            if (!res.ok) {
                if (json.code === "relationship_identity_choice_required" || json.code === "relationship_contact_conflict") {
                    setCandidates(json.identity_candidates ?? []);
                }
                setError(json.error ?? (kind === "commit" ? "The relationship could not be added." : "The proposal could not be rejected."));
                return;
            }
            setCandidates(null);
            setDone(kind === "commit" ? `Added to the record as ${label.toLowerCase()}` : "Rejected — nothing was added");
            onCommitted?.();
        } finally {
            setBusy(false);
        }
    };

    if (done) return <p className="mt-2 text-[11px] font-medium text-alloy-juniper" data-testid="relationship-decision-done">{done}</p>;
    return (
        <div className="mt-2 space-y-1.5 border-t border-stone-100 pt-2" data-testid="relationship-decision">
            <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="rounded bg-alloy-midnight px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50" disabled={busy} onClick={() => void act("commit")} data-testid="relationship-commit">
                    {busy ? "Working..." : `Add to ${label}`}
                </button>
                <input aria-label="Reason to reject" placeholder="Reason (optional)" className="min-w-[10rem] rounded border border-stone-200 px-1.5 py-0.5 text-[12px]" value={reason} onChange={(e) => setReason(e.target.value)} data-testid="relationship-reject-reason" />
                <button type="button" className="rounded border border-stone-200 px-2 py-1 text-[11px] disabled:opacity-50" disabled={busy} onClick={() => void act("reject")} data-testid="relationship-reject">
                    Reject
                </button>
            </div>
            {error ? <p className="text-[11px] text-amber-800" data-testid="relationship-decision-error">{error}</p> : null}
            {candidates ? (
                <div className="space-y-1 rounded border border-amber-200 bg-amber-50/50 px-2 py-1.5" data-testid="relationship-candidates">
                    {candidates.map((c) => (
                        <div key={c.person_id} className="flex flex-wrap items-center gap-2 text-[11.5px]">
                            <span className="font-medium">{c.display_name || "Unnamed person"}</span>
                            <span className="text-stone-500">{c.in_household ? "already in this family" : "in another family"}{c.same_name ? " · same name" : " · different name"}</span>
                            <button type="button" className="rounded border border-stone-200 px-2 py-0.5 text-[11px]" disabled={busy} onClick={() => void act("commit", { selected_person_id: c.person_id })} data-testid="relationship-use-person">
                                Use this person
                            </button>
                        </div>
                    ))}
                    {candidates.length > 0 && candidates.every((c) => c.contact_match === false) ? (
                        // Only the name resembles someone in this family (their email and phone differ): the
                        // operator confirms a different person — nothing is merged or overwritten.
                        <button type="button" className="rounded border border-stone-200 px-2 py-0.5 text-[11px]" disabled={busy} onClick={() => void act("commit", { confirm_new_person: true })} data-testid="relationship-confirm-new">
                            It's a different person — add them
                        </button>
                    ) : !correcting ? (
                        <button type="button" className="rounded border border-stone-200 px-2 py-0.5 text-[11px]" disabled={busy} onClick={() => setCorrecting(true)} data-testid="relationship-correct">
                            It's a different person — correct the details
                        </button>
                    ) : (
                        <div className="flex flex-wrap items-center gap-1.5" data-testid="relationship-correction">
                            <input aria-label="First name" className="rounded border border-stone-200 px-1.5 py-0.5 text-[12px]" value={fix.first_name} onChange={(e) => setFix({ ...fix, first_name: e.target.value })} data-testid="relationship-fix-first" />
                            <input aria-label="Last name" className="rounded border border-stone-200 px-1.5 py-0.5 text-[12px]" value={fix.last_name} onChange={(e) => setFix({ ...fix, last_name: e.target.value })} data-testid="relationship-fix-last" />
                            <input aria-label="Phone" className="rounded border border-stone-200 px-1.5 py-0.5 text-[12px]" value={fix.phone} onChange={(e) => setFix({ ...fix, phone: e.target.value })} data-testid="relationship-fix-phone" />
                            <input aria-label="Email" className="rounded border border-stone-200 px-1.5 py-0.5 text-[12px]" value={fix.email} onChange={(e) => setFix({ ...fix, email: e.target.value })} data-testid="relationship-fix-email" />
                            <button type="button" className="rounded bg-alloy-midnight px-2 py-0.5 text-[11px] font-semibold text-white disabled:opacity-50" disabled={busy || !fix.first_name.trim() || !fix.last_name.trim() || !(fix.phone.trim() || fix.email.trim())} onClick={() => void act("commit", { person_corrections: fix })} data-testid="relationship-fix-save">
                                Add with these details
                            </button>
                        </div>
                    )}
                </div>
            ) : null}
        </div>
    );
}

/** What the family submitted for this person, split for correction: `…full_name`, `…phone`, `…email`. */
function submittedPersonIdentity(instance: ProcessingCollectionInstanceProposal): { first_name: string; last_name: string; phone: string; email: string } {
    let full = "", first = "", last = "", phone = "", email = "";
    for (const b of instance.field_bindings) {
        const key = `${b.provider_ref ?? ""} ${b.field_id}`.toLowerCase();
        const v = (b.display_value ?? "").trim();
        if (!v) continue;
        if (/first_name/.test(key)) first ||= v;
        else if (/last_name/.test(key)) last ||= v;
        else if (/full_name/.test(key)) full ||= v;
        else if (/phone/.test(key)) phone ||= v;
        else if (/email/.test(key)) email ||= v;
    }
    if (full && (!first || !last)) {
        const parts = full.split(/\s+/);
        first ||= parts[0] ?? "";
        last ||= parts.slice(1).join(" ");
    }
    return { first_name: first, last_name: last, phone, email };
}

function isNewChildCommitEligible(instance: ProcessingCollectionInstanceProposal): boolean {
    return instance.collection_provider_ref === "children"
        && instance.iteration_entity_type === "customer_member"
        && instance.origin === "respondent_added"
        && instance.status === "valid";
}

/** Prefill from what the family submitted: `…first_name` / `…last_name` / `…full_name` / `…date_of_birth`. */
function submittedChildIdentity(instance: ProcessingCollectionInstanceProposal): { first: string; last: string; dob: string } {
    let first = "", last = "", full = "", dob = "";
    for (const b of instance.field_bindings) {
        const key = `${b.provider_ref ?? ""} ${b.field_id}`.toLowerCase();
        const v = (b.display_value ?? "").trim();
        if (!v) continue;
        if (/first_name\b/.test(key)) first ||= v;
        else if (/last_name\b/.test(key)) last ||= v;
        else if (/full_name\b/.test(key)) full ||= v;
        else if (/(date_of_birth|\bdob)\b/.test(key)) dob ||= v;
    }
    if ((!first || !last) && full) {
        const parts = full.split(/\s+/);
        if (parts.length > 1) { first ||= parts.slice(0, -1).join(" "); last ||= parts[parts.length - 1]!; } else first ||= full;
    }
    return { first, last, dob };
}

type IdentityCandidate = { record_id: string; customer_member_id: string | null; display_name: string; explanation: string; in_household: boolean };

/**
 * A NEW CHILD THE FAMILY TOLD US ABOUT — reviewed, corrected if needed, created once.
 * Duplicate-safe: a possible match is shown and must be linked, or a new child created with a reason.
 */
function NewChildCommitBlock({ instance, caseId, onCommitted }: { instance: ProcessingCollectionInstanceProposal; caseId: string; onCommitted?: () => void }) {
    const submitted = useMemo(() => submittedChildIdentity(instance), [instance]);
    const [first, setFirst] = useState(submitted.first);
    const [last, setLast] = useState(submitted.last);
    const [dob, setDob] = useState(submitted.dob);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [done, setDone] = useState<string | null>(null);
    const [candidates, setCandidates] = useState<IdentityCandidate[] | null>(null);
    const [reason, setReason] = useState("");
    const [rejectReason, setRejectReason] = useState("");

    const send = async (extra: Record<string, unknown>) => {
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/processing/cases/${caseId}/related-record-proposals/${encodeURIComponent(instance.proposal_id)}/commit`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    decision: { proposal_id: instance.proposal_id, field_decisions: [] },
                    new_child: { first_name: first, last_name: last, dob: dob || null, ...extra },
                }),
            });
            const json = (await res.json()) as { error?: string; candidates?: IdentityCandidate[]; data?: { alreadyDone?: boolean; identity_outcome?: string | null } };
            if (res.status === 409 && json.candidates) {
                setCandidates(json.candidates);
                setError(json.error ?? "This child may already be in Alloy.");
                return;
            }
            if (!res.ok) {
                setError(json.error ?? "The child could not be created.");
                return;
            }
            setCandidates(null);
            setDone(json.data?.alreadyDone ? "Already committed" : json.data?.identity_outcome === "already_in_household" ? "Linked to the existing child" : "Child created");
            onCommitted?.();
        } finally {
            setBusy(false);
        }
    };

    const reject = async () => {
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/processing/cases/${caseId}/related-record-proposals/${encodeURIComponent(instance.proposal_id)}/reject`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reason: rejectReason || null }),
            });
            const json = (await res.json()) as { error?: string };
            if (!res.ok) {
                setError(json.error ?? "The proposal could not be rejected.");
                return;
            }
            setDone("Rejected — no child was created");
            onCommitted?.();
        } finally {
            setBusy(false);
        }
    };

    if (done) return <p className="mt-2 text-[11px] font-medium text-alloy-juniper" data-testid="new-child-commit-done">{done}</p>;
    return (
        <div className="mt-2 space-y-1.5 border-t border-stone-100 pt-2" data-testid="new-child-commit">
            <p className="text-[11px] text-stone-500">New child from the family. Check the details, then create the child. Creating the child does not enroll them.</p>
            <div className="flex flex-wrap gap-1.5">
                <input aria-label="First name" className="rounded border border-stone-200 px-1.5 py-0.5 text-[12px]" value={first} onChange={(e) => setFirst(e.target.value)} data-testid="new-child-first-name" />
                <input aria-label="Last name" className="rounded border border-stone-200 px-1.5 py-0.5 text-[12px]" value={last} onChange={(e) => setLast(e.target.value)} data-testid="new-child-last-name" />
                <input aria-label="Date of birth" type="date" className="rounded border border-stone-200 px-1.5 py-0.5 text-[12px]" value={dob} onChange={(e) => setDob(e.target.value)} data-testid="new-child-dob" />
            </div>
            {candidates ? (
                <div className="space-y-1" data-testid="new-child-candidates">
                    {candidates.map((c) => (
                        <div key={c.record_id} className="flex flex-wrap items-center gap-2 text-[11.5px]">
                            <span className="font-medium">{c.display_name}</span>
                            <span className="text-stone-500">{c.explanation}</span>
                            {c.in_household && c.customer_member_id ? (
                                <button type="button" className="rounded border border-stone-200 px-2 py-0.5 text-[11px]" disabled={busy} onClick={() => void send({ chosen_customer_member_id: c.customer_member_id })}>
                                    Use this existing child
                                </button>
                            ) : null}
                        </div>
                    ))}
                    <div className="flex flex-wrap items-center gap-2">
                        <input aria-label="Reason to create a new child" placeholder="Why this is a different child" className="min-w-[14rem] rounded border border-stone-200 px-1.5 py-0.5 text-[12px]" value={reason} onChange={(e) => setReason(e.target.value)} data-testid="new-child-reason" />
                        <button type="button" className="rounded border border-stone-200 px-2 py-0.5 text-[11px]" disabled={busy || !reason.trim()} onClick={() => void send({ create_new_child: true, create_new_reason: reason })}>
                            Create a new child anyway
                        </button>
                    </div>
                </div>
            ) : (
                <div className="flex flex-wrap items-center gap-2">
                    <button type="button" className="rounded bg-alloy-midnight px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50" disabled={busy || !first.trim() || !last.trim()} onClick={() => void send({})} data-testid="new-child-commit-create">
                        {busy ? "Working..." : "Create child"}
                    </button>
                    <input aria-label="Reason to reject" placeholder="Reason (optional)" className="min-w-[10rem] rounded border border-stone-200 px-1.5 py-0.5 text-[12px]" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} data-testid="new-child-reject-reason" />
                    <button type="button" className="rounded border border-stone-200 px-2 py-1 text-[11px] disabled:opacity-50" disabled={busy} onClick={() => void reject()} data-testid="new-child-reject">
                        Reject
                    </button>
                </div>
            )}
            {error ? <p className="text-[11px] text-amber-800">{error}</p> : null}
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
