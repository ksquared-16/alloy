"use client";

/**
 * IdentityReviewConversation — the operator-facing presentation of Identity Review.
 *
 * Reads the SAME canonical /identity/review payload and drives the SAME /identity/resolution
 * decisions as the engine panel — but renders a calm, DENSE conversation about a FAMILY: the
 * situation in one line, unresolved subjects first (confirmed ones collapsed), one decision, and
 * exactly what happens next. No engine vocabulary, no raw facts, no ids. A one-parent / one-child
 * review fits without scrolling; the identity model and endpoints are unchanged.
 */

import { useCallback, useEffect, useState } from "react";
import {
    buildIdentityConversation,
    type CandidateProfile,
    type ConversationAction,
    type ConversationSubject,
    type ConversationView,
    type ReviewDataRaw,
} from "@/lib/pos/identityConversation";

async function postJson(url: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
    const res = await fetch(url, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
    });
    const parsed = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: res.ok, error: parsed.error };
}

function StateChip({ state }: { state: ConversationSubject["matchState"] }) {
    const cls =
        state === "exact_match"
            ? "bg-alloy-bend-pine/[0.12] text-alloy-bend-pine"
            : state === "possible_match"
              ? "bg-alloy-gold/[0.14] text-alloy-gold-dark"
              : "bg-alloy-stone/40 text-alloy-midnight/60";
    const label = state === "exact_match" ? "Already exists" : state === "possible_match" ? "Possible match" : "New";
    return <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>{label}</span>;
}

function ProfileRows({ profile }: { profile: CandidateProfile | null }) {
    const rows: [string, string][] = [];
    if (profile?.email) rows.push(["Email", profile.email]);
    if (profile?.phone) rows.push(["Phone", profile.phone]);
    if (profile?.zip) rows.push(["ZIP", profile.zip]);
    if (profile?.household) rows.push(["Household", profile.household]);
    if (profile?.children?.length) rows.push(["Children", profile.children.join(", ")]);
    if (profile?.status) rows.push(["Status", profile.status]);
    if (profile?.lastActivity) rows.push(["Last activity", profile.lastActivity]);
    if (rows.length === 0) return <div className="text-[11px] text-alloy-midnight/45">Existing record on file.</div>;
    return (
        <dl className="space-y-0.5">
            {rows.map(([k, v]) => (
                <div key={k} className="flex gap-2 text-[11px]">
                    <dt className="w-24 shrink-0 text-alloy-midnight/45">{k}</dt>
                    <dd className="min-w-0 flex-1 text-alloy-midnight/80">{v}</dd>
                </div>
            ))}
        </dl>
    );
}

/** A confirmed subject collapses to a single line; details expand on demand. */
function ConfirmedRow({ subject }: { subject: ConversationSubject }) {
    const [open, setOpen] = useState(false);
    const status = subject.matchState === "exact_match" ? "links to existing" : subject.matchState === "new" ? "new record" : "confirmed";
    return (
        <div className="rounded-lg border border-alloy-stone/15 bg-white px-3 py-1.5">
            <div className="flex items-center gap-2">
                <span aria-hidden className="text-alloy-bend-pine">✓</span>
                <span className="text-[12.5px] font-medium text-alloy-midnight">{subject.name}</span>
                <span className="text-[11px] text-alloy-midnight/50">
                    {subject.kind === "parent" ? "Parent" : "Child"} · {status}
                </span>
                {subject.match ? (
                    <button
                        type="button"
                        onClick={() => setOpen((v) => !v)}
                        aria-expanded={open}
                        className="ml-auto text-[11px] text-alloy-bend-pine hover:underline"
                    >
                        {open ? "Hide" : "Details"}
                    </button>
                ) : null}
            </div>
            {open && subject.match ? (
                <div className="mt-1.5 space-y-1.5 border-t border-alloy-stone/10 pt-1.5">
                    <ProfileRows profile={subject.match.profile} />
                    {subject.match.reasons.length > 0 ? (
                        <div className="text-[11px] text-alloy-midnight/60">Why: {subject.match.reasons.join(" · ")}</div>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}

/** An unresolved subject is prominent: the operator's one decision. */
function UnresolvedCard({
    subject,
    busy,
    onDecide,
}: {
    subject: ConversationSubject;
    busy: boolean;
    onDecide: (subject: ConversationSubject, action: ConversationAction, reason?: string) => void;
}) {
    const [reasonFor, setReasonFor] = useState<ConversationAction | null>(null);
    const [reasonText, setReasonText] = useState("");
    const [whyOpen, setWhyOpen] = useState(false);

    const handleAction = (a: ConversationAction) => {
        if (a.requiresReason) {
            setReasonFor(a);
            setReasonText("");
        } else {
            onDecide(subject, a);
        }
    };

    return (
        <section className="rounded-xl border border-alloy-gold/30 bg-alloy-gold/[0.05] p-3">
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                    {subject.kind === "parent" ? "Parent" : "Child"}
                </span>
                <span className="text-[14px] font-semibold text-alloy-midnight">{subject.name}</span>
                <StateChip state={subject.matchState} />
            </div>
            {subject.detail ? <p className="mt-0.5 text-[12px] leading-snug text-alloy-midnight/70">{subject.detail}</p> : null}
            {subject.match && subject.match.reasons.length > 0 ? (
                <button
                    type="button"
                    onClick={() => setWhyOpen((v) => !v)}
                    aria-expanded={whyOpen}
                    className="mt-1 text-[11px] font-medium text-alloy-bend-pine hover:underline"
                >
                    {whyOpen ? "Hide match details" : "Why Alloy suggested this"}
                </button>
            ) : null}
            {whyOpen && subject.match ? (
                <div className="mt-1.5 rounded-md border border-alloy-stone/15 bg-white px-2.5 py-2">
                    <ProfileRows profile={subject.match.profile} />
                    <div className="mt-1 text-[11px] text-alloy-bend-pine">✓ {subject.match.reasons.join(" · ")}</div>
                </div>
            ) : null}

            <div className="mt-2.5">
                {reasonFor ? (
                    <div>
                        <label className="text-[11.5px] font-medium text-alloy-midnight">
                            Short reason to create {subject.name} as new:
                        </label>
                        <textarea
                            value={reasonText}
                            onChange={(e) => setReasonText(e.target.value)}
                            rows={2}
                            autoFocus
                            placeholder="e.g. Different date of birth — not the same child"
                            className="mt-1.5 w-full rounded-md border border-alloy-stone/25 px-2.5 py-1.5 text-[12px] text-alloy-midnight focus:border-alloy-bend-pine focus:outline-none"
                        />
                        <div className="mt-2 flex gap-2">
                            <button
                                type="button"
                                disabled={busy || !reasonText.trim()}
                                onClick={() => onDecide(subject, reasonFor, reasonText.trim())}
                                className="rounded-md bg-alloy-bend-pine px-3 py-1.5 text-[12px] font-medium text-white hover:bg-alloy-bend-pine/90 disabled:opacity-50"
                            >
                                Create as new {subject.kind}
                            </button>
                            <button
                                type="button"
                                onClick={() => setReasonFor(null)}
                                className="rounded-md border border-alloy-stone/25 px-3 py-1.5 text-[12px] font-medium text-alloy-midnight/70 hover:bg-alloy-stone/10"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-wrap gap-1.5">
                        {subject.actions.map((a) => (
                            <button
                                key={a.decisionAction}
                                type="button"
                                disabled={busy}
                                onClick={() => handleAction(a)}
                                className={
                                    a.emphasis === "primary"
                                        ? "rounded-md bg-alloy-bend-pine px-3 py-1.5 text-[12px] font-medium text-white hover:bg-alloy-bend-pine/90 disabled:opacity-50"
                                        : "rounded-md border border-alloy-stone/25 bg-white px-3 py-1.5 text-[12px] font-medium text-alloy-midnight/80 hover:bg-alloy-stone/10 disabled:opacity-50"
                                }
                            >
                                {a.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
}

function summaryLine(view: ConversationView): string {
    const unresolved = view.subjects.filter((s) => s.needsDecision);
    if (view.foundSummary) {
        if (unresolved.length === 0) return "We found an existing family — everything’s confirmed.";
        const names = unresolved.map((s) => s.name).join(" and ");
        return `We found an existing family. Please confirm ${names} — nothing is saved until you approve.`;
    }
    return unresolved.length === 0
        ? "This looks like a new family — nothing to confirm."
        : "This looks like a new family. Confirm the details below.";
}

export default function IdentityReviewConversation({
    caseId,
    candidateProfiles,
    submittedZip,
    onChanged,
}: {
    caseId: string;
    candidateProfiles?: CandidateProfile[];
    submittedZip?: string | null;
    onChanged?: () => void;
}) {
    const [data, setData] = useState<ReviewDataRaw | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [actionError, setActionError] = useState<string | null>(null);
    const [submittedOpen, setSubmittedOpen] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/processing/cases/${caseId}/identity/review`, { credentials: "same-origin" });
            if (!res.ok) throw new Error(`Couldn’t load this review (${res.status})`);
            const body = (await res.json()) as { data?: ReviewDataRaw };
            setData(body.data ?? null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Couldn’t load this review");
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [caseId]);

    useEffect(() => {
        void load();
    }, [load]);

    const decide = useCallback(
        async (subject: ConversationSubject, action: ConversationAction, reason?: string) => {
            if (action.requiresReason && !reason?.trim()) {
                setActionError("Please add a short reason to create a new record over a possible match.");
                return;
            }
            const overrideReason = reason?.trim() || null;
            setBusy(true);
            setActionError(null);
            try {
                const r = await postJson(`/api/admin/processing/cases/${caseId}/identity/resolution`, {
                    resolutionId: subject.resolutionId,
                    decisionAction: action.decisionAction,
                    selectedCandidateId: action.selectedCandidateId,
                    createNewOverrideReason: overrideReason,
                    createNewOverrideReasonCode: overrideReason ? "operator_create_new_override" : null,
                });
                if (!r.ok) throw new Error(r.error || "Couldn’t save your decision");
                await load();
                onChanged?.();
            } catch (e) {
                setActionError(e instanceof Error ? e.message : "Couldn’t save your decision");
            } finally {
                setBusy(false);
            }
        },
        [caseId, load, onChanged],
    );

    if (loading && !data) {
        return (
            <div className="space-y-2" aria-busy="true">
                <div className="h-4 w-2/3 animate-pulse rounded bg-alloy-stone/15" />
                <div className="h-20 animate-pulse rounded-xl bg-alloy-stone/10" />
            </div>
        );
    }
    if (error || !data) {
        return (
            <div className="rounded-lg border border-alloy-stone/20 p-3 text-[12.5px] text-alloy-midnight/70">
                {error ?? "Nothing to review."}
                <button type="button" onClick={() => void load()} className="ml-2 font-medium text-alloy-bend-pine hover:underline">
                    Try again
                </button>
            </div>
        );
    }

    const view = buildIdentityConversation(data, { candidateProfiles });
    const unresolved = view.subjects.filter((s) => s.needsDecision);
    const confirmed = view.subjects.filter((s) => !s.needsDecision);
    const parent = view.subjects.find((s) => s.kind === "parent");
    const child = view.subjects.find((s) => s.kind === "child");

    return (
        <div className="space-y-3">
            <p className="text-[12.5px] leading-snug text-alloy-midnight">{summaryLine(view)}</p>

            {actionError ? (
                <div className="rounded-md border border-alloy-gold/40 bg-alloy-gold/[0.10] px-2.5 py-1.5 text-[11.5px] text-alloy-gold-dark">
                    {actionError}
                </div>
            ) : null}

            {/* Unresolved first (the decision), then confirmed collapsed. */}
            <div className="space-y-2">
                {unresolved.map((s) => (
                    <UnresolvedCard key={s.resolutionId} subject={s} busy={busy} onDecide={decide} />
                ))}
                {confirmed.map((s) => (
                    <ConfirmedRow key={s.resolutionId} subject={s} />
                ))}
            </div>

            {/* After you continue — immediately below the decisions. */}
            {view.outcome.length > 0 ? (
                <div className="rounded-lg border border-alloy-stone/15 bg-alloy-stone/[0.02] px-3 py-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/40">After you continue</div>
                    <ul className="mt-1 space-y-0.5">
                        {view.outcome.map((o, i) => (
                            <li key={i} className={`flex gap-1.5 text-[12px] ${o.pending ? "text-alloy-midnight/45" : "text-alloy-midnight"}`}>
                                <span aria-hidden className={o.pending ? "text-alloy-midnight/30" : "text-alloy-bend-pine"}>
                                    {o.pending ? "•" : "✓"}
                                </span>
                                <span>{o.text}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}

            {/* Submitted details — compact, collapsed by default (no duplicated section). */}
            <div className="text-[11.5px]">
                <button
                    type="button"
                    onClick={() => setSubmittedOpen((v) => !v)}
                    aria-expanded={submittedOpen}
                    className="font-medium text-alloy-midnight/55 hover:text-alloy-midnight"
                >
                    {submittedOpen ? "Hide what was submitted" : "What was submitted"}
                </button>
                {submittedOpen ? (
                    <div className="mt-1.5 space-y-1 rounded-lg border border-alloy-stone/15 bg-alloy-stone/[0.02] px-3 py-2">
                        {parent ? (
                            <div className="flex gap-2">
                                <span className="w-14 shrink-0 text-alloy-midnight/45">Parent</span>
                                <span className="text-alloy-midnight/80">
                                    {parent.name}
                                    {parent.submitted.email ? ` · ${parent.submitted.email}` : ""}
                                </span>
                            </div>
                        ) : null}
                        {child ? (
                            <div className="flex gap-2">
                                <span className="w-14 shrink-0 text-alloy-midnight/45">Child</span>
                                <span className="text-alloy-midnight/80">
                                    {child.name}
                                    {child.submitted.dob ? ` · ${child.submitted.dob}` : ""}
                                </span>
                            </div>
                        ) : null}
                        {submittedZip ? (
                            <div className="flex gap-2">
                                <span className="w-14 shrink-0 text-alloy-midnight/45">ZIP</span>
                                <span className="text-alloy-midnight/80">{submittedZip}</span>
                            </div>
                        ) : null}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
