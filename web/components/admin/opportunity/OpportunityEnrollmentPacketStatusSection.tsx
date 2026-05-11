"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type SessionItemVm = {
    sequence_index: number;
    status: string;
    submitted_at: string | null;
    form_submission_id: string | null;
    form_name: string | null;
    form_key: string | null;
    form_definition_id: string | null;
    admin_submission_path: string | null;
    documents: { id: string; name: string | null; document_type: string | null }[];
};

type SessionVm = {
    id: string;
    status: string;
    created_at: string;
    updated_at: string | null;
    completed_at: string | null;
    current_sequence_index: number;
    packet_definition_id: string;
    packet_name: string | null;
    started_via_public_link_id: string | null;
    crm_snapshot: {
        opportunity_id: string | null;
        customer_id: string | null;
        person_id: string | null;
        customer_member_id: string | null;
    };
    step_count: number;
    submitted_step_count: number;
    items: SessionItemVm[];
    admin_packet_review_path: string;
};

function statusLabel(status: string): string {
    const s = status.trim().toLowerCase();
    if (s === "in_progress") return "In progress";
    if (s === "completed") return "Completed";
    return status;
}

export default function OpportunityEnrollmentPacketStatusSection({
    opportunityId,
    refreshNonce = 0,
}: {
    opportunityId: string;
    refreshNonce?: number;
}) {
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);
    const [sessions, setSessions] = useState<SessionVm[]>([]);
    const [pendingLinks, setPendingLinks] = useState<
        { public_link_id: string; packet_definition_id: string | null; label: string | null; packet_name: string | null }[]
    >([]);

    const load = useCallback(async () => {
        setLoading(true);
        setErr(null);
        try {
            const res = await fetch(`/api/admin/opportunities/${encodeURIComponent(opportunityId)}/enrollment-packets`, {
                credentials: "include",
            });
            const j = (await res.json().catch(() => ({}))) as {
                sessions?: SessionVm[];
                minted_links_pending_open?: {
                    public_link_id: string;
                    packet_definition_id: string | null;
                    label: string | null;
                    packet_name: string | null;
                }[];
                error?: string;
            };
            if (!res.ok) {
                setErr(j.error ?? `Failed to load (${res.status})`);
                setSessions([]);
                setPendingLinks([]);
                return;
            }
            setSessions(Array.isArray(j.sessions) ? j.sessions : []);
            setPendingLinks(Array.isArray(j.minted_links_pending_open) ? j.minted_links_pending_open : []);
        } catch (e) {
            setErr(e instanceof Error ? e.message : "Failed to load");
            setSessions([]);
            setPendingLinks([]);
        } finally {
            setLoading(false);
        }
    }, [opportunityId]);

    useEffect(() => {
        void load();
    }, [load, refreshNonce]);

    if (loading) {
        return (
            <section className="mb-4 rounded-lg border border-alloy-stone/40 bg-white/90 px-3 py-2.5 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/45">Enrollment packets</p>
                <p className="mt-2 text-xs text-alloy-midnight/60">Loading…</p>
            </section>
        );
    }

    if (err) {
        return (
            <section className="mb-4 rounded-lg border border-red-200 bg-red-50/80 px-3 py-2.5 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-red-800/80">Enrollment packets</p>
                <p className="mt-2 text-xs text-red-800">{err}</p>
            </section>
        );
    }

    if (sessions.length === 0 && pendingLinks.length === 0) {
        return (
            <section className="mb-4 rounded-lg border border-alloy-stone/40 bg-white/90 px-3 py-2.5 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/45">Enrollment packets</p>
                <p className="mt-2 text-xs text-alloy-midnight/60">
                    No packet sessions linked to this opportunity yet. Launch an enrollment packet to begin.
                </p>
            </section>
        );
    }

    if (sessions.length === 0 && pendingLinks.length > 0) {
        return (
            <section className="mb-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/45">Enrollment packets</p>
                    <button
                        type="button"
                        className="text-[11px] font-medium text-alloy-blue hover:underline"
                        onClick={() => void load()}
                    >
                        Refresh
                    </button>
                </div>
                <p className="text-xs text-alloy-midnight/65">
                    Packet link(s) exist for this opportunity, but no one has opened the enrollment flow yet — there is no
                    session until the recipient loads the form.
                </p>
                <ul className="space-y-2">
                    {pendingLinks.map((p) => (
                        <li
                            key={p.public_link_id}
                            className="rounded-md border border-alloy-stone/25 bg-alloy-stone/5 px-2 py-1.5 text-xs text-alloy-midnight/85"
                        >
                            <div className="font-medium">{p.packet_name ?? p.label ?? "Enrollment packet"}</div>
                            <div className="mt-0.5 font-mono text-[10px] text-alloy-midnight/50">Link id {p.public_link_id.slice(0, 8)}…</div>
                        </li>
                    ))}
                </ul>
            </section>
        );
    }

    return (
        <section className="mb-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/45">Enrollment packets</p>
                <button
                    type="button"
                    className="text-[11px] font-medium text-alloy-blue hover:underline"
                    onClick={() => void load()}
                >
                    Refresh
                </button>
            </div>
            {sessions.map((s) => {
                const lastAt = s.completed_at ?? s.updated_at ?? s.created_at;
                const recipientHint = s.crm_snapshot.person_id ? "Guardian / contact on file" : "—";
                const childHint = s.crm_snapshot.customer_member_id ? "Child / member on file" : "—";
                const progressLabel =
                    s.step_count > 0 ? `${s.submitted_step_count} / ${s.step_count} steps submitted` : "No steps";
                return (
                    <div
                        key={s.id}
                        className="rounded-lg border border-alloy-stone/40 bg-white/90 px-3 py-2.5 shadow-sm"
                        data-opportunity-enrollment-packet-session={s.id}
                    >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                                <div className="text-sm font-semibold text-alloy-midnight/90">{s.packet_name ?? "Enrollment packet"}</div>
                                <div className="mt-1 text-[11px] text-alloy-midnight/65">
                                    {statusLabel(s.status)} · {progressLabel} · Last activity{" "}
                                    {lastAt ? new Date(lastAt).toLocaleString() : "—"}
                                </div>
                                <div className="mt-1 text-[11px] text-alloy-midnight/55">
                                    {recipientHint}
                                    {s.crm_snapshot.customer_member_id ? ` · ${childHint}` : ""}
                                </div>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                                <Link href={s.admin_packet_review_path} className="text-xs font-medium text-alloy-blue hover:underline">
                                    Review packet
                                </Link>
                            </div>
                        </div>
                        {s.items.length > 0 ? (
                            <ul className="mt-2 space-y-1.5 border-t border-alloy-stone/25 pt-2">
                                {s.items.map((it) => (
                                    <li key={`${s.id}-${it.sequence_index}`} className="text-[11px] text-alloy-midnight/75">
                                        <span className="font-medium text-alloy-midnight/85">
                                            Step {it.sequence_index + 1}: {it.form_name ?? it.form_key ?? "Form"}
                                        </span>
                                        <span className="text-alloy-midnight/50"> — {it.status}</span>
                                        {it.admin_submission_path && it.status === "submitted" ? (
                                            <>
                                                {" "}
                                                <Link href={it.admin_submission_path} className="text-alloy-blue hover:underline">
                                                    Open submission
                                                </Link>
                                            </>
                                        ) : null}
                                        {it.documents.length > 0 ? (
                                            <span className="mt-0.5 block text-alloy-midnight/60">
                                                Documents: {it.documents.map((d) => d.name ?? d.document_type ?? d.id.slice(0, 8)).join(", ")}
                                            </span>
                                        ) : null}
                                    </li>
                                ))}
                            </ul>
                        ) : null}
                    </div>
                );
            })}
        </section>
    );
}
