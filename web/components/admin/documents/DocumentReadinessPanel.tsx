"use client";

/**
 * D6 — document readiness in the Focus Panel (Documents card), above the D4 library.
 *
 * Shows, per household member in the operator's scope, what the organization requires, what is on file, what is missing,
 * pending review, waived or blocked — the Documents evaluator's answer from `GET /api/admin/documents/requirements/readiness`,
 * the same evaluation Processing → Work → Documents, Work Items and Business Process read. Nothing is computed here.
 *
 * Disclosure is the server's: requirements of a class the operator is not cleared for are absent, members outside scope
 * are absent, and an evidence document is named only when the operator may open it.
 *
 * Actions: accept or reject a document awaiting review (`documents.write` + the document access decision), waive an
 * unmet waivable requirement, or revoke a waiver (`processing.documents.manage`) — every one governed and audited on
 * the server, with a reason where it changes policy. Collecting a document is the library's upload.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { LibrarySubjectRef } from "@/lib/documents/library/documentLibraryModel";
import { REQUIREMENT_STATE_LABEL } from "@/lib/documents/requirements/documentRequirementEvaluator";
import type { DisclosedEvaluation, ReadinessCounts, SubjectReadiness } from "@/lib/documents/requirements/documentRequirementService";
import { invalidateDocumentRequirementWork } from "@/lib/documents/requirements/documentRequirementWorkClient";

type Readiness = { household: { id: string; label: string } | null; subjects: SubjectReadiness[]; totals: ReadinessCounts; today: string };

const STATE_CLASS: Record<DisclosedEvaluation["state"], string> = {
    missing: "bg-red-50 text-red-800",
    pending_review: "bg-amber-50 text-amber-800",
    satisfied: "bg-emerald-50 text-emerald-800",
    waived: "bg-sky-50 text-sky-800",
    blocked: "bg-stone-200 text-stone-800",
};

function readinessUrl(anchor: LibrarySubjectRef, focus: LibrarySubjectRef | null): string {
    const q = new URLSearchParams({ subject_type: anchor.subject_type, subject_id: anchor.subject_id });
    if (focus) {
        q.set("focus_type", focus.subject_type);
        q.set("focus_id", focus.subject_id);
    }
    return `/api/admin/documents/requirements/readiness?${q.toString()}`;
}

async function send(url: string, method: "POST" | "PATCH", body: Record<string, unknown>): Promise<string | null> {
    try {
        const res = await fetch(url, { method, credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        if (res.ok) return null;
        const json = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
        return `${json.error ?? "Refused"}${json.code ? ` (${json.code})` : ""}`;
    } catch (e) {
        return (e as Error).message;
    }
}

export default function DocumentReadinessPanel({
    anchor,
    focus,
    canMutate,
    refreshNonce,
    onChanged,
    onOpenDocument,
}: {
    anchor: LibrarySubjectRef;
    focus: LibrarySubjectRef | null;
    canMutate: boolean;
    /** Bumped by the library after a write (upload, replacement) so readiness is re-read. */
    refreshNonce: number;
    onChanged: () => void;
    onOpenDocument?: (documentId: string) => void;
}) {
    const [data, setData] = useState<Readiness | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [acting, setActing] = useState<string | null>(null);
    const [reason, setReason] = useState("");
    const [notice, setNotice] = useState<string | null>(null);
    const n = useRef(0);

    const load = useCallback(async () => {
        const i = ++n.current;
        try {
            const res = await fetch(readinessUrl(anchor, focus), { credentials: "include" });
            const json = (await res.json().catch(() => ({}))) as { readiness?: Readiness; error?: string };
            if (i !== n.current) return;
            if (!res.ok || !json.readiness) {
                setError(json.error ?? `Readiness could not be read (${res.status}).`);
                return;
            }
            setError(null);
            setData(json.readiness);
        } catch (e) {
            if (i === n.current) setError((e as Error).message);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [anchor.subject_type, anchor.subject_id, focus?.subject_type, focus?.subject_id]);
    useEffect(() => {
        void load();
    }, [load, refreshNonce]);

    const act = async (key: string, run: () => Promise<string | null>, done: string) => {
        const failed = await run();
        setNotice(failed ? `Not done: ${failed}` : done);
        if (!failed) {
            setActing(null);
            setReason("");
            invalidateDocumentRequirementWork();
            onChanged();
            await load();
        }
        void key;
    };

    if (error) {
        return (
            <p className="text-[12px] text-alloy-midnight/60" data-testid="document-readiness-error">
                {error}
            </p>
        );
    }
    if (!data || data.subjects.length === 0) return null;
    const t = data.totals;

    return (
        <section className="rounded-lg border border-alloy-stone/20 p-2.5" data-testid="document-readiness" aria-label="Document readiness">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]" data-testid="document-readiness-totals">
                <span className="font-semibold text-alloy-midnight/80">Required documents</span>
                <span className="rounded-full bg-alloy-stone/10 px-2 py-0.5" data-testid="document-readiness-required">{t.required} required</span>
                <span className="rounded-full bg-alloy-stone/10 px-2 py-0.5" data-testid="document-readiness-on-file">{t.on_file} on file</span>
                <span className={`rounded-full px-2 py-0.5 ${STATE_CLASS.missing}`} data-testid="document-readiness-missing">{t.missing} missing</span>
                <span className={`rounded-full px-2 py-0.5 ${STATE_CLASS.pending_review}`} data-testid="document-readiness-pending">{t.pending_review} pending review</span>
                <span className={`rounded-full px-2 py-0.5 ${STATE_CLASS.waived}`} data-testid="document-readiness-waived">{t.waived} waived</span>
                {t.blocked ? <span className={`rounded-full px-2 py-0.5 ${STATE_CLASS.blocked}`} data-testid="document-readiness-blocked">{t.blocked} blocked</span> : null}
            </div>
            <ul className="mt-2 space-y-2">
                {data.subjects.map((s) => (
                    <li key={`${s.subject.subject_type}:${s.subject.subject_id}`} data-testid={`document-readiness-subject-${s.subject.subject_id}`}>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/50">{s.subject.label}</p>
                        <ul className="mt-1 space-y-1">
                            {s.requirements.map((e) => {
                                const key = `${e.requirement_id}:${e.subject_id}`;
                                const unmet = e.state !== "satisfied" && e.state !== "waived";
                                const onFile = [...e.evidence.accepted, ...e.evidence.pending];
                                return (
                                    <li key={key} className="rounded border border-alloy-stone/15 px-2 py-1.5 text-[12px]" data-testid={`document-readiness-row-${e.requirement_key}-${e.subject_id}`}>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="font-medium text-alloy-midnight">{e.label}</span>
                                            <span className={`rounded px-1.5 py-0.5 text-[11px] ${STATE_CLASS[e.state]}`} data-testid={`document-readiness-state-${e.requirement_key}-${e.subject_id}`}>
                                                {REQUIREMENT_STATE_LABEL[e.state]}
                                            </span>
                                            {e.policy === "optional" ? <span className="text-[11px] text-alloy-midnight/50">optional</span> : null}
                                            {unmet && e.due_on ? (
                                                <span className={`text-[11px] ${e.due_on < data.today ? "font-semibold text-red-700" : "text-alloy-midnight/55"}`}>
                                                    {e.due_on < data.today ? "Overdue" : "Due"} {e.due_on}
                                                </span>
                                            ) : null}
                                            <span className="ml-auto flex gap-1">
                                                {onFile.length && onOpenDocument ? (
                                                    <button type="button" className="underline text-[11px]" onClick={() => onOpenDocument(onFile[0])} data-testid={`document-readiness-open-${e.requirement_key}`}>
                                                        {e.state === "pending_review" ? "Review" : "View"}
                                                    </button>
                                                ) : null}
                                                {canMutate && e.state === "pending_review" && e.evidence.pending.length ? (
                                                    <>
                                                        <button
                                                            type="button"
                                                            className="underline text-[11px]"
                                                            data-testid={`document-readiness-accept-${e.requirement_key}`}
                                                            onClick={() => act(key, () => send(`/api/admin/documents/${e.evidence.pending[0]}/review`, "POST", { decision: "accepted" }), "Accepted.")}
                                                        >
                                                            Accept
                                                        </button>
                                                        <button type="button" className="underline text-[11px]" onClick={() => setActing(`reject:${key}`)} data-testid={`document-readiness-reject-${e.requirement_key}`}>
                                                            Reject
                                                        </button>
                                                    </>
                                                ) : null}
                                                {canMutate && unmet && e.waivable ? (
                                                    <button type="button" className="underline text-[11px]" onClick={() => setActing(`waive:${key}`)} data-testid={`document-readiness-waive-${e.requirement_key}`}>
                                                        Waive
                                                    </button>
                                                ) : null}
                                                {canMutate && e.state === "waived" && e.waiver_id ? (
                                                    <button type="button" className="underline text-[11px]" onClick={() => setActing(`revoke:${key}`)} data-testid={`document-readiness-revoke-${e.requirement_key}`}>
                                                        Revoke waiver
                                                    </button>
                                                ) : null}
                                            </span>
                                        </div>
                                        {acting === `waive:${key}` || acting === `revoke:${key}` || acting === `reject:${key}` ? (
                                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                                <input
                                                    className="min-w-[12rem] flex-1 rounded border border-alloy-stone/30 px-2 py-1 text-[12px]"
                                                    placeholder={acting.startsWith("waive") ? "Reason for the waiver" : acting.startsWith("reject") ? "Why the document is rejected" : "Reason for revoking"}
                                                    value={reason}
                                                    onChange={(ev) => setReason(ev.target.value)}
                                                    data-testid="document-readiness-reason"
                                                />
                                                <button
                                                    type="button"
                                                    className="rounded bg-alloy-blue px-2 py-1 text-[11px] text-white disabled:opacity-50"
                                                    disabled={reason.trim().length < 3}
                                                    data-testid="document-readiness-confirm"
                                                    onClick={() =>
                                                        acting.startsWith("waive")
                                                            ? act(key, () => send("/api/admin/documents/requirements/waivers", "POST", { requirement_id: e.requirement_id, subject_type: e.subject_type, subject_id: e.subject_id, reason: reason.trim() }), "Waived.")
                                                            : acting.startsWith("reject")
                                                              ? act(key, () => send(`/api/admin/documents/${e.evidence.pending[0]}/review`, "POST", { decision: "rejected", reason: reason.trim() }), "Rejected.")
                                                              : act(key, () => send(`/api/admin/documents/requirements/waivers/${e.waiver_id}`, "PATCH", { action: "revoke", reason: reason.trim() }), "Waiver revoked.")
                                                    }
                                                >
                                                    Confirm
                                                </button>
                                                <button type="button" className="text-[11px] underline" onClick={() => setActing(null)}>
                                                    Cancel
                                                </button>
                                            </div>
                                        ) : null}
                                    </li>
                                );
                            })}
                        </ul>
                    </li>
                ))}
            </ul>
            {notice ? (
                <p className="mt-1.5 text-[12px] text-alloy-midnight/70" role="status" data-testid="document-readiness-notice">
                    {notice}
                </p>
            ) : null}
        </section>
    );
}
