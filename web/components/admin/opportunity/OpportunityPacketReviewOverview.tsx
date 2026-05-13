"use client";

import { useCallback, useEffect, useState } from "react";

type ReviewWarning = { kind?: string; message?: string; field_key?: string };

type EnrollmentPacketSessionRow = {
    id: string;
    status: string;
    packet_name: string | null;
    launch_context?: Record<string, unknown>;
    operator_review_status?: string | null;
    operator_review_warnings?: ReviewWarning[] | null;
    operator_review_notes?: string | null;
    items: {
        form_name?: string | null;
        admin_submission_path?: string | null;
        status?: string;
        documents?: { id: string; name: string | null; document_type: string | null }[];
    }[];
    admin_packet_review_path: string;
};

type Props = {
    opportunityId: string;
    canMutate: boolean;
    onInvalidate: () => void;
};

export function OpportunityPacketReviewOverview({ opportunityId, canMutate, onInvalidate }: Props) {
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [sessions, setSessions] = useState<EnrollmentPacketSessionRow[]>([]);
    const [open, setOpen] = useState(false);
    const [activeSession, setActiveSession] = useState<EnrollmentPacketSessionRow | null>(null);
    const [notes, setNotes] = useState("");
    const [saving, setSaving] = useState(false);
    const [saveErr, setSaveErr] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setErr(null);
        try {
            const res = await fetch(`/api/admin/opportunities/${encodeURIComponent(opportunityId)}/enrollment-packets`, {
                credentials: "include",
            });
            const j = (await res.json().catch(() => ({}))) as { sessions?: EnrollmentPacketSessionRow[]; error?: string };
            if (!res.ok) throw new Error(j.error ?? "Could not load packets");
            setSessions(Array.isArray(j.sessions) ? j.sessions : []);
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Load failed");
            setSessions([]);
        } finally {
            setLoading(false);
        }
    }, [opportunityId]);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        const onOpp = (ev: Event) => {
            const ce = ev as CustomEvent<{ id?: string }>;
            const id = typeof ce.detail?.id === "string" ? ce.detail.id : "";
            if (id && id === opportunityId) void load();
        };
        if (typeof window === "undefined") return;
        window.addEventListener("adminv2:opportunity-updated", onOpp as EventListener);
        return () => window.removeEventListener("adminv2:opportunity-updated", onOpp as EventListener);
    }, [opportunityId, load]);

    const pending = sessions.filter(
        (s) =>
            s.status === "completed" &&
            (s.operator_review_status == null ||
                s.operator_review_status === "needs_review" ||
                s.operator_review_status === "needs_correction")
    );

    const headSession = sessions[0] ?? null;
    const reviewedHead =
        headSession &&
        headSession.status === "completed" &&
        (headSession.operator_review_status === "approved" || headSession.operator_review_status === "rejected")
            ? headSession
            : null;

    const subjectLine = (s: EnrollmentPacketSessionRow) => {
        const lc = s.launch_context;
        const label = lc && typeof lc.label === "string" && lc.label.trim() ? lc.label.trim() : null;
        return label || s.packet_name || "Enrollment packet";
    };

    const applyReview = async (next: "approved" | "rejected" | "needs_correction") => {
        if (!activeSession) return;
        setSaving(true);
        setSaveErr(null);
        try {
            const res = await fetch(`/api/admin/forms/packet-sessions/${encodeURIComponent(activeSession.id)}/review`, {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    operator_review_status: next,
                    operator_review_notes: notes.trim() || undefined,
                }),
            });
            const j = (await res.json().catch(() => ({}))) as { error?: string };
            if (!res.ok) throw new Error(j.error ?? "Update failed");
            setOpen(false);
            setActiveSession(null);
            setNotes("");
            onInvalidate();
            window.dispatchEvent(
                new CustomEvent("adminv2:opportunity-updated", {
                    detail: { id: opportunityId, action_key: "packet_review" },
                })
            );
            await load();
        } catch (e) {
            setSaveErr(e instanceof Error ? e.message : "Save failed");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <p className="mb-3 text-[11px] text-alloy-midnight/50">Loading packet status…</p>;
    }
    if (err) {
        return <p className="mb-3 text-[11px] text-red-700">{err}</p>;
    }
    if (pending.length === 0) {
        if (reviewedHead) {
            const st = reviewedHead.operator_review_status === "approved" ? "Approved" : "Rejected";
            return (
                <p className="mb-3 rounded-md border border-alloy-stone/20 bg-alloy-stone/[0.03] px-3 py-2 text-[11px] text-alloy-midnight/70">
                    <span className="font-medium text-alloy-midnight/80">Packet</span>
                    <span className="text-alloy-midnight/60"> · {subjectLine(reviewedHead)}</span>
                    <span className="text-alloy-midnight/55"> · {st}</span>
                </p>
            );
        }
        return null;
    }

    const head = pending[0]!;

    return (
        <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-xs text-alloy-midnight">
                <div className="min-w-0">
                    <span className="font-semibold text-alloy-midnight">Packet submitted</span>
                    <span className="text-alloy-midnight/70"> · {subjectLine(head)}</span>
                    <span className="text-amber-900"> · Needs review</span>
                    {(head.operator_review_warnings?.length ?? 0) > 0 ? (
                        <span className="ms-1 text-[11px] font-medium text-amber-900">
                            ({head.operator_review_warnings!.length} hint{head.operator_review_warnings!.length === 1 ? "" : "s"})
                        </span>
                    ) : null}
                </div>
                <button
                    type="button"
                    className="shrink-0 rounded border border-alloy-stone/40 bg-white px-2.5 py-1 text-[11px] font-semibold text-alloy-blue hover:bg-alloy-stone/10"
                    onClick={() => {
                        setActiveSession(head);
                        setNotes("");
                        setSaveErr(null);
                        setOpen(true);
                    }}
                >
                    Review
                </button>
            </div>

            {open && activeSession ? (
                <div
                    className="fixed inset-0 z-[999] flex items-center justify-center bg-black/35 p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Packet review"
                    onClick={() => !saving && setOpen(false)}
                >
                    <div
                        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-alloy-stone/30 bg-white p-4 shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <h3 className="text-sm font-semibold text-alloy-midnight">Review packet</h3>
                        <p className="mt-1 text-xs text-alloy-midnight/70">{subjectLine(activeSession)}</p>
                        <a
                            href={activeSession.admin_packet_review_path}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-block text-xs font-semibold text-alloy-blue hover:underline"
                        >
                            Open packet session (admin)
                        </a>

                        {(activeSession.operator_review_warnings?.length ?? 0) > 0 ? (
                            <div className="mt-3 rounded border border-amber-200 bg-amber-50/80 px-2 py-2">
                                <p className="text-[11px] font-semibold text-amber-950">Name / CRM hints</p>
                                <ul className="mt-1 list-disc space-y-1 pl-4 text-[11px] text-amber-950/90">
                                    {(activeSession.operator_review_warnings ?? []).map((w, i) => (
                                        <li key={i}>{w.message}</li>
                                    ))}
                                </ul>
                            </div>
                        ) : null}

                        <div className="mt-3 space-y-2">
                            <p className="text-[11px] font-semibold text-alloy-midnight/80">Submitted steps</p>
                            <ul className="space-y-1.5 text-[11px]">
                                {(activeSession.items ?? []).map((it, idx) => (
                                    <li key={idx} className="rounded border border-alloy-stone/20 bg-alloy-stone/[0.04] px-2 py-1">
                                        <div className="font-medium text-alloy-midnight/85">
                                            {it.form_name ?? `Step ${idx + 1}`} · {it.status ?? "—"}
                                        </div>
                                        {it.admin_submission_path ? (
                                            <a
                                                href={it.admin_submission_path}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-alloy-blue hover:underline"
                                            >
                                                View submission
                                            </a>
                                        ) : null}
                                        {(it.documents?.length ?? 0) > 0 ? (
                                            <div className="mt-0.5 text-alloy-midnight/65">
                                                Documents:{" "}
                                                {(it.documents ?? []).map((d) => d.name || d.document_type || d.id).join(", ")}
                                            </div>
                                        ) : null}
                                    </li>
                                ))}
                            </ul>
                        </div>

                        <label className="mt-3 block text-[11px] font-medium text-alloy-midnight/75">
                            Notes (optional)
                            <textarea
                                className="mt-1 block w-full rounded border border-alloy-stone/35 px-2 py-1 text-xs text-alloy-midnight"
                                rows={2}
                                value={notes}
                                disabled={!canMutate || saving}
                                onChange={(e) => setNotes(e.target.value)}
                            />
                        </label>

                        {saveErr ? <p className="mt-2 text-xs text-red-700">{saveErr}</p> : null}

                        <div className="mt-4 flex flex-wrap justify-end gap-2">
                            <button
                                type="button"
                                className="rounded border border-alloy-stone/40 px-3 py-1.5 text-xs font-medium text-alloy-midnight/80 hover:bg-alloy-stone/10"
                                disabled={saving}
                                onClick={() => setOpen(false)}
                            >
                                Close
                            </button>
                            <button
                                type="button"
                                className="rounded border border-alloy-stone/40 px-3 py-1.5 text-xs font-medium text-alloy-midnight/85 hover:bg-alloy-stone/10 disabled:opacity-40"
                                disabled={!canMutate || saving}
                                onClick={() => void applyReview("needs_correction")}
                            >
                                Needs correction
                            </button>
                            <button
                                type="button"
                                className="rounded border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-50 disabled:opacity-40"
                                disabled={!canMutate || saving}
                                onClick={() => void applyReview("rejected")}
                            >
                                Reject
                            </button>
                            <button
                                type="button"
                                className="rounded bg-alloy-blue px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-40"
                                disabled={!canMutate || saving}
                                onClick={() => void applyReview("approved")}
                            >
                                Approve
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </>
    );
}
