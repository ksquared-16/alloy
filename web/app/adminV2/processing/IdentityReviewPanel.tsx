"use client";

/**
 * D3 — Identity Review panel (operator workflow).
 *
 * Additive section inside the shared Processing case work surface. Drives the full
 * identity workflow through the canonical operator service via
 * /api/admin/processing/cases/[caseId]/identity/*:
 *   facts + corrections → resolution decisions → build plan (diff) → approve →
 *   explicit execute → attempt results.
 *
 * Nothing here is auto-invoked: execution requires a deliberate operator click on
 * an APPROVED plan. No intake source reaches these actions.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

type Readiness =
    | "needs_understanding_review"
    | "needs_identity_review"
    | "needs_plan_review"
    | "ready_for_approval"
    | "approved_ready_to_commit"
    | "committing"
    | "partially_committed"
    | "committed"
    | "stale_plan"
    | "needs_information"
    | "exception";

type FactRow = {
    id: string;
    fact_type: string;
    raw_value: string | null;
    normalized_value: string | null;
    corrected_from: string | null;
};

type Candidate = {
    recordId?: string | null;
    entityType?: string;
    confidenceBand?: string;
    displayName?: string | null;
    explanation?: string | null;
    blockingConflicts?: { explanation?: string }[];
    signals?: { kind?: string; explanation?: string }[];
};

type SubjectEligibility = {
    subjectRef: string;
    subjectRole: string;
    state: string;
    eligibleForPlan: boolean;
    blockingReasons: { code: string; explanation: string }[];
    recommendationSummary: string | null;
};

type ResolutionRow = {
    id: string;
    subject_ref: string;
    subject_role: string;
    decision_action: string | null;
    selected_candidate_id: string | null;
    candidates: Candidate[];
    provisional?: Record<string, unknown>;
};

type DiffEntry = {
    opId: string;
    label: string;
    kind: string;
    reason: string;
    included: boolean;
    optional: boolean;
    risk: string;
    atomicGroup: string | null;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
};

type PlanDiff = { planId: string; version: number; contentHash: string; entries: DiffEntry[]; atomicGroups: string[] } | null;

type Approval = { approvalId: string; planVersion: number; planContentHash: string; invalidatedAt: string | null } | null;

type Attempt = {
    attemptId: string;
    outcome: "committed" | "partially_committed" | "failed" | "preflight_rejected";
    attemptNo: number;
    operations: { opId: string; commandKey?: string; status: string; recordId: string | null; error: string | null }[];
    preflightFailures: string[];
} | null;

type ReviewState = {
    caseId: string;
    facts: FactRow[];
    resolutions: ResolutionRow[];
    plan: { planId: string; version: number; contentHash: string; supersededBy: string | null } | null;
    planDiff: PlanDiff;
    approval: Approval;
    latestAttempt: Attempt;
    readiness: Readiness;
    blockingConflictCount: number;
    subjectEligibility?: SubjectEligibility[];
    planEligible?: boolean;
    identityBlockers?: string[];
};

const READINESS_LABEL: Record<Readiness, string> = {
    needs_understanding_review: "Needs understanding review",
    needs_identity_review: "Needs identity review",
    needs_plan_review: "Needs plan review",
    ready_for_approval: "Ready for approval",
    approved_ready_to_commit: "Approved — ready to commit",
    committing: "Committing",
    partially_committed: "Partially committed",
    committed: "Committed",
    stale_plan: "Stale plan",
    needs_information: "Needs information",
    exception: "Exception",
};

const DECISION_OPTIONS: { value: string; label: string }[] = [
    { value: "link_existing", label: "Use this existing record" },
    { value: "create_new", label: "Create new anyway" },
    { value: "update_existing", label: "Update existing" },
    { value: "review_required", label: "Mark unresolved" },
    { value: "reject", label: "Reject candidate" },
    { value: "request_information", label: "Request more information" },
];

function Eyebrow({ children }: { children: ReactNode }) {
    return <div className="mb-1.5 text-[10.5px] font-medium uppercase tracking-wide text-stone-400">{children}</div>;
}

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; data?: unknown; error?: string }> {
    const res = await fetch(url, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
    });
    const parsed = (await res.json().catch(() => ({}))) as { data?: unknown; error?: string };
    return { ok: res.ok, data: parsed.data, error: parsed.error };
}

export default function IdentityReviewPanel({
    caseId,
    onCommitted,
}: {
    caseId: string;
    onCommitted?: (payload: {
        attemptId: string;
        operations: { opId: string; commandKey: string; status: string; recordId: string | null }[];
    }) => void;
}) {
    const [state, setState] = useState<ReviewState | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [actionError, setActionError] = useState<string | null>(null);
    const committedNotifiedRef = useRef<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/processing/cases/${caseId}/identity/review`, {
                credentials: "same-origin",
            });
            if (!res.ok) throw new Error(`Request failed (${res.status})`);
            const body = (await res.json()) as { data: ReviewState };
            setState(body.data);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load identity review");
            setState(null);
        } finally {
            setLoading(false);
        }
    }, [caseId]);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        const attempt = state?.latestAttempt;
        if (!attempt || !onCommitted) return;
        if (attempt.outcome !== "committed" && attempt.outcome !== "partially_committed") return;
        if (committedNotifiedRef.current === attempt.attemptId) return;
        committedNotifiedRef.current = attempt.attemptId;
        onCommitted({
            attemptId: attempt.attemptId,
            operations: attempt.operations.map((o) => ({
                opId: o.opId,
                commandKey: o.commandKey ?? "",
                status: o.status,
                recordId: o.recordId,
            })),
        });
    }, [onCommitted, state?.latestAttempt]);

    const run = useCallback(
        async (label: string, fn: () => Promise<{ ok: boolean; error?: string }>) => {
            setBusy(label);
            setActionError(null);
            try {
                const r = await fn();
                if (!r.ok) throw new Error(r.error || `${label} failed`);
                await load();
            } catch (e) {
                setActionError(e instanceof Error ? e.message : `${label} failed`);
            } finally {
                setBusy(null);
            }
        },
        [load],
    );

    const decide = (
        resolutionId: string,
        decisionAction: string,
        selectedCandidateId?: string | null,
        createNewOverrideReason?: string | null,
    ) =>
        run("decision", () =>
            postJson(`/api/admin/processing/cases/${caseId}/identity/resolution`, {
                resolutionId,
                decisionAction,
                selectedCandidateId: selectedCandidateId ?? null,
                createNewOverrideReason: createNewOverrideReason ?? null,
                createNewOverrideReasonCode: createNewOverrideReason ? "operator_create_new_override" : null,
            }),
        );

    const decideWithPrompt = (r: ResolutionRow, decisionAction: string, selectedCandidateId?: string | null) => {
        const plausible = (r.candidates ?? []).filter((c) => c.recordId && c.recordId !== "none");
        if (decisionAction === "create_new" && plausible.length > 0) {
            const reason = window.prompt(
                "A plausible existing match was found. Creating a new record requires an explicit reason (create-new override):",
                "",
            );
            if (reason == null) return;
            if (!reason.trim()) {
                setActionError("Create-new override requires a non-empty operator reason.");
                return;
            }
            void decide(r.id, decisionAction, null, reason.trim());
            return;
        }
        void decide(r.id, decisionAction, selectedCandidateId ?? null, null);
    };

    const correct = (originalFactId: string, correctedNormalizedValue: string) =>
        run("correction", () =>
            postJson(`/api/admin/processing/cases/${caseId}/identity/correction`, {
                originalFactId,
                correctedNormalizedValue,
            }),
        );

    const buildPlan = () => run("plan", () => postJson(`/api/admin/processing/cases/${caseId}/identity/plan`, {}));

    const approve = (planId: string, blockingConflicts: string[]) =>
        run("approve", () =>
            postJson(`/api/admin/processing/cases/${caseId}/identity/approve`, { planId, blockingConflicts }),
        );

    const execute = (planId: string, contentHash: string) =>
        run("execute", () =>
            postJson(`/api/admin/processing/cases/${caseId}/identity/execute`, {
                planId,
                // Stable per plan version + hash → idempotent retry resumes the same attempt.
                executionIdempotencyKey: `exec:${planId}:${contentHash}`,
            }),
        );

    if (loading) {
        return (
            <section className="mb-5 rounded-lg border border-stone-200 bg-white p-3.5 shadow-sm" aria-busy="true">
                <Eyebrow>Identity review</Eyebrow>
                <div className="h-16 animate-pulse rounded bg-stone-100" />
            </section>
        );
    }
    if (error || !state) {
        return (
            <section className="mb-5 rounded-lg border border-stone-200 bg-white p-3.5 shadow-sm">
                <Eyebrow>Identity review</Eyebrow>
                <div className="text-[12px] text-amber-700">{error ?? "No identity data."}</div>
                <button
                    type="button"
                    onClick={() => void load()}
                    className="mt-2 rounded-md border border-stone-300 px-2.5 py-1 text-[11.5px] font-medium text-stone-700 hover:bg-stone-50"
                >
                    Retry
                </button>
            </section>
        );
    }

    const { readiness, plan, planDiff, approval, latestAttempt, resolutions, facts, blockingConflictCount } = state;
    const approvalStale = Boolean(plan && approval && approval.planContentHash !== plan.contentHash);
    const planEligible = state.planEligible !== false && (state.identityBlockers?.length ?? 0) === 0;
    const canApprove = readiness === "ready_for_approval" && planEligible;
    const canExecute = readiness === "approved_ready_to_commit" || readiness === "partially_committed";
    const canBuildPlan = planEligible && busy === null;
    const blockingConflictIds = blockingConflictCount > 0 ? ["unresolved"] : [];
    const eligibilityByRef = new Map((state.subjectEligibility ?? []).map((e) => [e.subjectRef, e]));

    return (
        <section className="mb-5 rounded-lg border border-alloy-bend-pine/25 bg-white p-3.5 shadow-sm">
            <div className="mb-2 flex items-center justify-between">
                <span className="text-[10.5px] font-semibold uppercase tracking-wide text-alloy-bend-pine">Identity review</span>
                <span className="rounded-full bg-alloy-bend-pine/[0.08] px-2 py-0.5 text-[11px] font-medium text-alloy-bend-pine">
                    {READINESS_LABEL[readiness]}
                </span>
            </div>

            {actionError ? <div className="mb-2 text-[11.5px] text-amber-700">{actionError}</div> : null}

            {/* Facts + operator correction (appends a new fact version) */}
            <div className="mb-3">
                <Eyebrow>Facts ({facts.length})</Eyebrow>
                {facts.length === 0 ? (
                    <div className="text-[12px] text-stone-400">No durable facts for this case.</div>
                ) : (
                    <ul className="space-y-1">
                        {facts.map((f) => (
                            <FactItem key={f.id} fact={f} disabled={busy !== null} onCorrect={correct} />
                        ))}
                    </ul>
                )}
            </div>

            {(state.identityBlockers?.length ?? 0) > 0 ? (
                <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-[11.5px] text-amber-900">
                    <div className="font-medium">Blocking identity review</div>
                    <ul className="mt-1 list-disc pl-4">
                        {(state.identityBlockers ?? []).slice(0, 6).map((b) => (
                            <li key={b}>{b}</li>
                        ))}
                    </ul>
                    <div className="mt-1">
                        You selected related records for this household. Review each subject — especially children —
                        before creating a new record. Plausible matches require an explicit operator decision.
                    </div>
                </div>
            ) : null}

            {/* Resolutions + candidate decisions */}
            <div className="mb-3">
                <Eyebrow>Household identity subjects ({resolutions.length})</Eyebrow>
                {resolutions.length === 0 ? (
                    <div className="text-[12px] text-stone-400">No resolutions yet.</div>
                ) : (
                    <ul className="space-y-2">
                        {resolutions.map((r) => {
                            const el = eligibilityByRef.get(r.subject_ref);
                            const blocking = el && !el.eligibleForPlan;
                            return (
                            <li key={r.id} className={`rounded-md border p-2.5 ${blocking ? "border-amber-300 bg-amber-50/40" : "border-stone-200"}`}>
                                <div className="flex items-center gap-2">
                                    <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10.5px] text-stone-600">{r.subject_role}</span>
                                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-stone-800">{r.subject_ref}</span>
                                    {el?.state ? (
                                        <span className={`text-[10.5px] ${blocking ? "text-amber-800" : "text-alloy-bend-pine"}`}>{el.state}</span>
                                    ) : r.decision_action ? (
                                        <span className="text-[10.5px] text-alloy-bend-pine">{r.decision_action}</span>
                                    ) : (
                                        <span className="text-[10.5px] text-amber-700">undecided</span>
                                    )}
                                </div>
                                {el?.recommendationSummary ? (
                                    <div className="mt-1 text-[11px] text-stone-700">{el.recommendationSummary}</div>
                                ) : null}
                                <div className="mt-1 space-y-1">
                                    {(r.candidates ?? []).slice(0, 5).map((c) => (
                                        <div key={`${r.id}:${c.recordId}`} className="rounded border border-stone-100 bg-white px-2 py-1 text-[11px] text-stone-600">
                                            <div className="flex flex-wrap gap-2">
                                                <span className="font-medium text-stone-800">{c.displayName ?? c.recordId}</span>
                                                {c.confidenceBand ? <span>{c.confidenceBand}</span> : null}
                                                {c.entityType ? <span>{c.entityType}</span> : null}
                                            </div>
                                            {c.explanation ? <div className="text-stone-500">{c.explanation}</div> : null}
                                            {(c.blockingConflicts?.length ?? 0) > 0 ? (
                                                <div className="text-amber-800">
                                                    Contradictions: {(c.blockingConflicts ?? []).map((b) => b.explanation).filter(Boolean).join("; ") || "conflict"}
                                                </div>
                                            ) : null}
                                            <button
                                                type="button"
                                                disabled={busy !== null}
                                                className="mt-1 text-[10.5px] font-medium text-alloy-bend-pine hover:underline disabled:opacity-50"
                                                onClick={() => decideWithPrompt(r, "link_existing", c.recordId ?? null)}
                                            >
                                                Choose this record
                                            </button>
                                        </div>
                                    ))}
                                    {(r.candidates ?? []).length === 0 ? (
                                        <div className="text-[11px] text-stone-500">No candidates — create new is allowed after operator confirmation of empty match set.</div>
                                    ) : null}
                                </div>
                                <div className="mt-1.5 flex flex-wrap gap-1.5">
                                    {DECISION_OPTIONS.map((opt) => (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            disabled={busy !== null}
                                            onClick={() =>
                                                decideWithPrompt(
                                                    r,
                                                    opt.value,
                                                    opt.value === "link_existing"
                                                        ? r.candidates[0]?.recordId ?? r.selected_candidate_id
                                                        : null,
                                                )
                                            }
                                            className={`rounded-md border px-2 py-0.5 text-[11px] font-medium disabled:opacity-50 ${
                                                r.decision_action === opt.value
                                                    ? "border-alloy-bend-pine/50 bg-alloy-bend-pine/[0.08] text-alloy-bend-pine"
                                                    : "border-stone-300 text-stone-600 hover:bg-stone-50"
                                            }`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            {/* Plan build + diff */}
            <div className="mb-3">
                <div className="mb-1 flex items-center justify-between">
                    <Eyebrow>Commit plan</Eyebrow>
                    <button
                        type="button"
                        disabled={!canBuildPlan}
                        title={!planEligible ? "Resolve blocking identity subjects before building a plan" : undefined}
                        onClick={() => void buildPlan()}
                        className="rounded-md border border-stone-300 px-2.5 py-1 text-[11.5px] font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
                    >
                        {busy === "plan" ? "Building…" : plan ? "Rebuild plan" : "Build plan"}
                    </button>
                </div>
                {!plan || !planDiff ? (
                    <div className="text-[12px] text-stone-400">No plan yet. Resolve subjects, then build a plan.</div>
                ) : (
                    <div className="rounded-md border border-stone-200 p-2.5">
                        <div className="mb-1.5 flex items-center gap-2 text-[11px] text-stone-500">
                            <span className="font-medium text-stone-700">v{planDiff.version}</span>
                            <span className="font-mono">{planDiff.contentHash.slice(0, 10)}</span>
                            {plan.supersededBy ? <span className="text-amber-700">superseded</span> : null}
                            {planDiff.atomicGroups.length > 0 ? (
                                <span className="rounded bg-stone-100 px-1 py-0.5 text-[9.5px]">atomic: {planDiff.atomicGroups.join(", ")}</span>
                            ) : null}
                        </div>
                        <ul className="space-y-1">
                            {planDiff.entries.map((op) => (
                                <li key={op.opId} className="flex items-baseline gap-2 text-[12px]">
                                    <span className="rounded bg-stone-100 px-1 py-0.5 text-[9.5px] uppercase text-stone-500">{op.kind}</span>
                                    <span className="min-w-0 flex-1">
                                        <span className="text-stone-800">{op.label}</span>
                                        {op.reason ? <span className="text-stone-400"> · {op.reason}</span> : null}
                                    </span>
                                    {op.atomicGroup ? <span className="text-[9.5px] text-alloy-bend-pine">{op.atomicGroup}</span> : null}
                                    <span className="text-[9.5px] text-stone-400">{op.risk}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </div>

            {/* Approval + stale warning */}
            {approvalStale ? (
                <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11.5px] text-amber-800">
                    The prior approval no longer matches this plan version — re-approve before executing.
                </div>
            ) : null}

            {/* Attempt results */}
            {latestAttempt ? (
                <div className="mb-3 rounded-md border border-stone-200 p-2.5">
                    <div className="mb-1 flex items-center gap-2 text-[11.5px]">
                        <span className="font-medium text-stone-700">Attempt #{latestAttempt.attemptNo}</span>
                        <span
                            className={
                                latestAttempt.outcome === "committed"
                                    ? "text-alloy-bend-pine"
                                    : latestAttempt.outcome === "partially_committed"
                                      ? "text-amber-700"
                                      : "text-red-700"
                            }
                        >
                            {latestAttempt.outcome}
                        </span>
                    </div>
                    {latestAttempt.preflightFailures.length > 0 ? (
                        <div className="text-[11px] text-red-700">Preflight: {latestAttempt.preflightFailures.join(", ")}</div>
                    ) : null}
                    <ul className="space-y-0.5">
                        {latestAttempt.operations.map((o) => (
                            <li key={o.opId} className="flex items-center gap-2 text-[11px] text-stone-600">
                                <span className="min-w-0 flex-1 truncate">{o.opId}</span>
                                <span className={o.status === "committed" ? "text-alloy-bend-pine" : "text-amber-700"}>{o.status}</span>
                                {o.error ? <span className="text-red-700">{o.error}</span> : null}
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}

            {/* Approve + execute — deliberate operator actions */}
            <div className="flex flex-wrap items-center gap-2 border-t border-stone-100 pt-2.5">
                <button
                    type="button"
                    disabled={!plan || !canApprove || busy !== null}
                    onClick={() => plan && void approve(plan.planId, blockingConflictIds)}
                    className="rounded-md border border-alloy-bend-pine/40 px-3 py-1.5 text-[12.5px] font-medium text-alloy-bend-pine hover:bg-alloy-bend-pine/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
                    title={canApprove ? "Approve this exact plan version" : "Plan is not ready for approval"}
                >
                    {busy === "approve" ? "Approving…" : "Approve plan"}
                </button>
                <button
                    type="button"
                    disabled={!plan || !canExecute || busy !== null}
                    onClick={() => plan && void execute(plan.planId, plan.contentHash)}
                    className="rounded-md bg-[#00A283] px-3.5 py-1.5 text-[12.5px] font-medium text-white hover:bg-[#009276] disabled:cursor-not-allowed disabled:opacity-40"
                    title={canExecute ? "Execute the approved plan" : "Approve the plan before executing"}
                >
                    {busy === "execute" ? "Committing…" : "Execute approved plan"}
                </button>
                <span className="text-[10px] leading-tight text-stone-400">Explicit action · no source auto-executes</span>
            </div>
        </section>
    );
}

function FactItem({
    fact,
    disabled,
    onCorrect,
}: {
    fact: FactRow;
    disabled: boolean;
    onCorrect: (id: string, value: string) => void;
}) {
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState(fact.normalized_value ?? fact.raw_value ?? "");

    return (
        <li className="rounded-md border border-stone-200 bg-stone-50/50 px-2 py-1 text-[11.5px]">
            <div className="flex items-center gap-2">
                <span className="text-stone-400">{fact.fact_type}:</span>
                {editing ? (
                    <>
                        <input
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            className="min-w-0 flex-1 rounded border border-stone-300 px-1 py-0.5 text-[11.5px]"
                        />
                        <button
                            type="button"
                            disabled={disabled}
                            onClick={() => {
                                onCorrect(fact.id, value);
                                setEditing(false);
                            }}
                            className="text-alloy-bend-pine hover:underline disabled:opacity-50"
                        >
                            Save
                        </button>
                        <button type="button" onClick={() => setEditing(false)} className="text-stone-500 hover:underline">
                            Cancel
                        </button>
                    </>
                ) : (
                    <>
                        <span className="min-w-0 flex-1 truncate font-medium text-stone-800">
                            {fact.normalized_value ?? fact.raw_value ?? "—"}
                        </span>
                        {fact.corrected_from ? <span className="text-[9.5px] text-alloy-bend-pine">corrected</span> : null}
                        <button
                            type="button"
                            disabled={disabled}
                            onClick={() => setEditing(true)}
                            className="text-stone-500 hover:underline disabled:opacity-50"
                        >
                            Correct
                        </button>
                    </>
                )}
            </div>
        </li>
    );
}
