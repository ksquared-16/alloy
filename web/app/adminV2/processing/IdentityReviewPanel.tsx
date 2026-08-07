"use client";

/**
 * Identity Review panel (operator workflow) — Create Lead / Processing.
 *
 * Drives the canonical identity path via /api/admin/processing/cases/[caseId]/identity/*:
 * facts → resolution decisions → plan → approve → explicit execute.
 *
 * Operator surface is exception-driven: clean-new shows a concise subject list and one
 * Confirm and create. Ambiguous subjects expand into the existing resolution controls.
 * Internal vocabulary (confirmed_new, person-1, opIds) stays out of the default view.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import {
    buildCreateLeadReviewPresentation,
    type CreateLeadReviewSubjectRow,
} from "@/lib/pos/processingIdentity/operator/createLeadReviewPresentation";
import { summarizeCommitPlan } from "@/lib/pos/processingIdentity/operator/reviewSummary";

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

const DECISION_OPTIONS: { value: string; label: string }[] = [
    { value: "link_existing", label: "Use this existing record" },
    { value: "create_new", label: "Create new anyway" },
    { value: "update_existing", label: "Update existing" },
    { value: "review_required", label: "Mark unresolved" },
    { value: "reject", label: "Reject candidate" },
    { value: "request_information", label: "Request more information" },
];

type TimingMarks = {
    loadStartedAt: number;
    loadMs: number | null;
    planPrefetchMs: number | null;
    confirmStartedAt: number | null;
    planBuildMs: number | null;
    approveMs: number | null;
    executeMs: number | null;
    reloadAfterConfirmMs: number | null;
};

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

function logReviewTiming(phase: string, marks: TimingMarks, extra?: Record<string, unknown>) {
    if (typeof console === "undefined" || typeof console.info !== "function") return;
    console.info("[create-lead-identity-review]", phase, { ...marks, ...extra });
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
    const [expandedReviewIds, setExpandedReviewIds] = useState<Set<string>>(() => new Set());
    const [showDiagnostics, setShowDiagnostics] = useState(false);
    const committedNotifiedRef = useRef<string | null>(null);
    const planPrefetchRef = useRef<string | null>(null);
    const timingRef = useRef<TimingMarks>({
        loadStartedAt: 0,
        loadMs: null,
        planPrefetchMs: null,
        confirmStartedAt: null,
        planBuildMs: null,
        approveMs: null,
        executeMs: null,
        reloadAfterConfirmMs: null,
    });

    const load = useCallback(async () => {
        const t0 = performance.now();
        timingRef.current.loadStartedAt = t0;
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/processing/cases/${caseId}/identity/review`, {
                credentials: "same-origin",
            });
            if (!res.ok) throw new Error(`Request failed (${res.status})`);
            const body = (await res.json()) as { data: ReviewState };
            setState(body.data);
            timingRef.current.loadMs = Math.round(performance.now() - t0);
            logReviewTiming("review_loaded", timingRef.current, {
                readiness: body.data.readiness,
                planEligible: body.data.planEligible,
                resolutionCount: body.data.resolutions?.length ?? 0,
            });
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

    // Prefetch plan for clean-new so Confirm and create does not wait on plan build serially.
    useEffect(() => {
        if (!state) return;
        const presentation = buildCreateLeadReviewPresentation({
            resolutions: state.resolutions as never,
            subjectEligibility: state.subjectEligibility as never,
        });
        if (presentation.mode !== "ready_without_identity_review") return;
        if (!state.planEligible) return;
        if (state.plan && !state.plan.supersededBy) return;
        if (planPrefetchRef.current === caseId) return;
        planPrefetchRef.current = caseId;
        const t0 = performance.now();
        void postJson(`/api/admin/processing/cases/${caseId}/identity/plan`, {}).then((built) => {
            timingRef.current.planPrefetchMs = Math.round(performance.now() - t0);
            logReviewTiming("plan_prefetch", timingRef.current, { ok: built.ok });
            if (built.ok) void load();
        });
    }, [caseId, load, state]);

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

    const decideWithPrompt = (r: CreateLeadReviewSubjectRow, decisionAction: string, selectedCandidateId?: string | null) => {
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
            void decide(r.resolutionId, decisionAction, null, reason.trim());
            return;
        }
        void decide(r.resolutionId, decisionAction, selectedCandidateId ?? null, null);
    };

    const correct = (originalFactId: string, correctedNormalizedValue: string) =>
        run("correction", () =>
            postJson(`/api/admin/processing/cases/${caseId}/identity/correction`, {
                originalFactId,
                correctedNormalizedValue,
            }),
        );

    /**
     * One operator gesture: reviewing this summary and confirming IS the approval, and the commit.
     * Plan → approve → execute still each run and are still each recorded.
     */
    const confirmAndCommit = useCallback(
        async (current: {
            planId: string;
            contentHash: string;
            needsPlan: boolean;
            blockingConflicts: string[];
            approved: boolean;
        }) => {
            setBusy("confirm");
            setActionError(null);
            const tConfirm = performance.now();
            timingRef.current.confirmStartedAt = tConfirm;
            try {
                let planId = current.planId;
                let contentHash = current.contentHash;

                if (current.needsPlan) {
                    const tPlan = performance.now();
                    const built = await postJson(`/api/admin/processing/cases/${caseId}/identity/plan`, {});
                    timingRef.current.planBuildMs = Math.round(performance.now() - tPlan);
                    if (!built.ok) throw new Error(built.error || "Could not build the commit plan");
                    const plan = (built.data as { plan?: { planId?: string; contentHash?: string } } | null)?.plan;
                    planId = plan?.planId?.trim() || planId;
                    contentHash = plan?.contentHash?.trim() || contentHash;
                }
                if (!planId) throw new Error("Could not build the commit plan");

                if (!current.approved) {
                    const tApprove = performance.now();
                    const approved = await postJson(`/api/admin/processing/cases/${caseId}/identity/approve`, {
                        planId,
                        blockingConflicts: current.blockingConflicts,
                    });
                    timingRef.current.approveMs = Math.round(performance.now() - tApprove);
                    if (!approved.ok) throw new Error(approved.error || "Could not approve the plan");
                }

                const tExec = performance.now();
                const committed = await postJson(`/api/admin/processing/cases/${caseId}/identity/execute`, {
                    planId,
                    executionIdempotencyKey: `exec:${planId}:${contentHash}`,
                });
                timingRef.current.executeMs = Math.round(performance.now() - tExec);
                if (!committed.ok) throw new Error(committed.error || "Could not create the records");
            } catch (e) {
                setActionError(e instanceof Error ? e.message : "Could not create the records");
            } finally {
                const tReload = performance.now();
                await load();
                timingRef.current.reloadAfterConfirmMs = Math.round(performance.now() - tReload);
                logReviewTiming("confirm_and_create_complete", timingRef.current, {
                    totalConfirmMs: Math.round(performance.now() - tConfirm),
                });
                setBusy(null);
            }
        },
        [caseId, load],
    );

    if (loading) {
        return (
            <section className="mb-5 rounded-lg border border-stone-200 bg-white p-3.5 shadow-sm" aria-busy="true">
                <Eyebrow>Ready to create</Eyebrow>
                <div className="h-16 animate-pulse rounded bg-stone-100" />
            </section>
        );
    }
    if (error || !state) {
        return (
            <section className="mb-5 rounded-lg border border-stone-200 bg-white p-3.5 shadow-sm">
                <Eyebrow>Review</Eyebrow>
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

    const { readiness, plan, planDiff, approval, latestAttempt, facts, blockingConflictCount } = state;
    const approvalStale = Boolean(plan && approval && approval.planContentHash !== plan.contentHash);
    const planEligible = state.planEligible !== false && (state.identityBlockers?.length ?? 0) === 0;
    const blockingConflictIds = blockingConflictCount > 0 ? ["unresolved"] : [];
    const planSummary = summarizeCommitPlan(planDiff?.entries ?? []);
    const presentation = buildCreateLeadReviewPresentation({
        resolutions: state.resolutions as never,
        subjectEligibility: state.subjectEligibility as never,
    });
    const canConfirm =
        planEligible &&
        presentation.mode === "ready_without_identity_review" &&
        readiness !== "committed" &&
        readiness !== "committing";

    const toggleReview = (id: string) => {
        setExpandedReviewIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    return (
        <section className="mb-5 rounded-lg border border-alloy-bend-pine/25 bg-white p-3.5 shadow-sm" data-create-lead-identity-review="true">
            <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-[14px] font-semibold text-stone-900">{presentation.headline}</h2>
                <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        presentation.mode === "identity_review_required"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-alloy-bend-pine/[0.08] text-alloy-bend-pine"
                    }`}
                >
                    {presentation.mode === "identity_review_required" ? "Needs review" : "Ready"}
                </span>
            </div>
            <p className="mb-3 text-[12.5px] text-stone-600">{presentation.summary}</p>

            {actionError ? <div className="mb-2 text-[11.5px] text-amber-700">{actionError}</div> : null}

            {(state.identityBlockers?.length ?? 0) > 0 ? (
                <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-[11.5px] text-amber-900">
                    <div className="font-medium">Identity decisions required</div>
                    <ul className="mt-1 list-disc pl-4">
                        {(state.identityBlockers ?? []).slice(0, 6).map((b) => (
                            <li key={b}>{b.replace(/^[a-z0-9_]+:\s*/i, "")}</li>
                        ))}
                    </ul>
                </div>
            ) : null}

            <ul className="mb-3 space-y-1.5" data-create-lead-subject-list="true">
                {presentation.subjects.map((row) => {
                    const expanded = expandedReviewIds.has(row.resolutionId);
                    const showDecisionControls = expanded;
                    return (
                        <li
                            key={row.resolutionId}
                            className={`rounded-md border px-2.5 py-2 ${
                                row.needsOperatorAction ? "border-amber-300 bg-amber-50/40" : "border-stone-200 bg-white"
                            }`}
                            data-needs-review={row.needsOperatorAction ? "true" : "false"}
                        >
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="text-[12.5px] font-medium text-stone-900">{row.displayName}</span>
                                <span className="text-[11px] text-stone-500">· {row.roleLabel}</span>
                                <span
                                    className={`text-[11px] font-medium ${
                                        row.needsOperatorAction ? "text-amber-800" : "text-alloy-bend-pine"
                                    }`}
                                >
                                    · {row.statusLabel}
                                </span>
                                {row.needsOperatorAction ? (
                                    <button
                                        type="button"
                                        className="ml-auto text-[11.5px] font-medium text-alloy-bend-pine hover:underline"
                                        onClick={() => toggleReview(row.resolutionId)}
                                    >
                                        {expanded ? "Hide" : "Review"}
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        className="ml-auto text-[11px] text-stone-400 hover:text-stone-600 hover:underline"
                                        onClick={() => toggleReview(row.resolutionId)}
                                    >
                                        {expanded ? "Hide" : "Edit"}
                                    </button>
                                )}
                            </div>

                            {showDecisionControls ? (
                                <div className="mt-2 space-y-1.5 border-t border-stone-100 pt-2">
                                    {row.recommendationSummary ? (
                                        <div className="text-[11px] text-stone-700">{row.recommendationSummary}</div>
                                    ) : null}
                                    {(row.candidates ?? [])
                                        .filter((c) => c.recordId && c.recordId !== "none")
                                        .slice(0, 5)
                                        .map((c) => (
                                            <div
                                                key={`${row.resolutionId}:${c.recordId}`}
                                                className="rounded border border-stone-100 bg-white px-2 py-1 text-[11px] text-stone-600"
                                            >
                                                <div className="flex flex-wrap gap-2">
                                                    <span className="font-medium text-stone-800">
                                                        {c.displayName ?? "Existing record"}
                                                    </span>
                                                </div>
                                                {c.explanation ? <div className="text-stone-500">{c.explanation}</div> : null}
                                                {(c.blockingConflicts?.length ?? 0) > 0 ? (
                                                    <div className="text-amber-800">
                                                        Contradictions:{" "}
                                                        {(c.blockingConflicts ?? [])
                                                            .map((b) => b.explanation)
                                                            .filter(Boolean)
                                                            .join("; ") || "conflict"}
                                                    </div>
                                                ) : null}
                                                <button
                                                    type="button"
                                                    disabled={busy !== null}
                                                    className="mt-1 text-[10.5px] font-medium text-alloy-bend-pine hover:underline disabled:opacity-50"
                                                    onClick={() => decideWithPrompt(row, "link_existing", c.recordId ?? null)}
                                                >
                                                    Choose this record
                                                </button>
                                            </div>
                                        ))}
                                    <div className="flex flex-wrap gap-1.5">
                                        {DECISION_OPTIONS.map((opt) => (
                                            <button
                                                key={opt.value}
                                                type="button"
                                                disabled={busy !== null}
                                                onClick={() =>
                                                    decideWithPrompt(
                                                        row,
                                                        opt.value,
                                                        opt.value === "link_existing"
                                                            ? row.candidates[0]?.recordId ?? row.selectedCandidateId
                                                            : null,
                                                    )
                                                }
                                                className={`rounded-md border px-2 py-0.5 text-[11px] font-medium disabled:opacity-50 ${
                                                    row.decisionAction === opt.value
                                                        ? "border-alloy-bend-pine/50 bg-alloy-bend-pine/[0.08] text-alloy-bend-pine"
                                                        : "border-stone-300 text-stone-600 hover:bg-stone-50"
                                                }`}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                        </li>
                    );
                })}
            </ul>

            {planSummary.lines.length > 0 ? (
                <div className="mb-3">
                    <Eyebrow>What this creates</Eyebrow>
                    <ul className="mt-1 space-y-0.5">
                        {planSummary.lines.map((line, i) => (
                            <li key={`${line}-${i}`} className="text-[12px] text-stone-700">
                                {line}
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}

            {approvalStale ? (
                <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11.5px] text-amber-800">
                    The prior approval no longer matches — confirm again to create.
                </div>
            ) : null}

            {latestAttempt &&
            (latestAttempt.outcome === "failed" || latestAttempt.outcome === "partially_committed") ? (
                <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11.5px] text-amber-900">
                    Creation did not finish completely. Review details below or try Confirm and create again.
                    {latestAttempt.preflightFailures.length > 0 ? (
                        <div className="mt-1">{latestAttempt.preflightFailures.join(", ")}</div>
                    ) : null}
                </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 border-t border-stone-100 pt-2.5">
                <button
                    type="button"
                    disabled={!canConfirm || busy !== null}
                    onClick={() =>
                        void confirmAndCommit({
                            planId: plan?.planId ?? "",
                            contentHash: plan?.contentHash ?? "",
                            needsPlan: !plan || approvalStale || Boolean(plan.supersededBy),
                            blockingConflicts: blockingConflictIds,
                            approved: Boolean(approval) && !approvalStale,
                        })
                    }
                    className="rounded-md bg-[#00A283] px-3.5 py-1.5 text-[12.5px] font-medium text-white hover:bg-[#009276] disabled:cursor-not-allowed disabled:opacity-40"
                    data-create-lead-confirm-create="true"
                    title={
                        canConfirm
                            ? "Create these records"
                            : presentation.mode === "identity_review_required"
                              ? "Resolve possible matches before confirming"
                              : "Settle identity before confirming"
                    }
                >
                    {busy === "confirm" ? "Creating…" : "Confirm and create"}
                </button>
                <span className="text-[10px] leading-tight text-stone-400">Confirm once · Processing still commits</span>
            </div>

            <div className="mt-3 border-t border-stone-100 pt-2">
                <button
                    type="button"
                    className="text-[11px] text-stone-400 hover:text-stone-600 hover:underline"
                    onClick={() => setShowDiagnostics((v) => !v)}
                >
                    {showDiagnostics ? "Hide details" : "Technical details"}
                </button>
                {showDiagnostics ? (
                    <div className="mt-2 space-y-2">
                        <div>
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
                        {timingRef.current.loadMs != null ? (
                            <div className="text-[10px] text-stone-400">
                                Load {timingRef.current.loadMs}ms
                                {timingRef.current.planPrefetchMs != null
                                    ? ` · Plan prefetch ${timingRef.current.planPrefetchMs}ms`
                                    : ""}
                                {timingRef.current.planBuildMs != null
                                    ? ` · Plan ${timingRef.current.planBuildMs}ms`
                                    : ""}
                                {timingRef.current.approveMs != null
                                    ? ` · Approve ${timingRef.current.approveMs}ms`
                                    : ""}
                                {timingRef.current.executeMs != null
                                    ? ` · Execute ${timingRef.current.executeMs}ms`
                                    : ""}
                            </div>
                        ) : null}
                    </div>
                ) : null}
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
