"use client";

/**
 * POS-FP-W/FP6 — Processing Case workspace (shared center surface).
 *
 * Used by BOTH the converged Processing modal and the standalone drawer. FP6 turns
 * the flat detail body into an operational work surface: context header → evidence →
 * proposed values → destination → activity, with a DOCKED action bar at the bottom
 * (Communications-composer analog). Read-only except the FP5 Approve action; proposed
 * values are visible but not promoted; records remain truth. Unsupported actions are
 * shown disabled ("Coming later"), never faked.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import type { ProcessingCaseDetail } from "@/lib/pos/processingCase/readModel/types";
import type { SourceEvidence } from "@/lib/pos/processingCase/readModel/resolveSourceEvidence";
import type { HandoffResult } from "@/lib/pos/processingCase/approveHandoff";

interface DetailResponse {
    data: {
        detail: ProcessingCaseDetail;
        evidence: SourceEvidence[];
        affectedRecordTypes: string[];
    };
}

const SOURCE_TYPE_LABELS: Record<string, string> = {
    form_submission: "Form",
    form_packet_session: "Packet",
    document: "Document",
    upload: "Upload",
    email_attachment: "Email",
    import: "Import",
    recreated_document: "Recreated",
};

const RECORD_TYPE_LABELS: Record<string, string> = {
    person: "CRM · Person",
    customer: "CRM · Customer",
    opportunity: "CRM · Opportunity",
    customer_member: "CRM · Member",
};

function statusLabel(status: string): string {
    return status.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

function formatWhen(iso: string | null): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function Eyebrow({ children }: { children: ReactNode }) {
    return <div className="mb-1.5 text-[10.5px] font-medium uppercase tracking-wide text-stone-400">{children}</div>;
}

export default function ProcessingCaseDetailContent({ caseId }: { caseId: string }) {
    const [data, setData] = useState<DetailResponse["data"] | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [approving, setApproving] = useState(false);
    const [approveErr, setApproveErr] = useState<string | null>(null);
    const [approveResult, setApproveResult] = useState<HandoffResult | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(`/api/admin/processing/cases/${caseId}`, { credentials: "same-origin" });
            if (!res.ok) {
                throw new Error(res.status === 404 ? "Processing case not found" : `Request failed (${res.status})`);
            }
            const body = (await res.json()) as DetailResponse;
            setData(body.data);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load");
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [caseId]);

    useEffect(() => {
        void load();
    }, [load]);

    const approve = useCallback(async () => {
        setApproving(true);
        setApproveErr(null);
        try {
            const res = await fetch(`/api/admin/processing/cases/${caseId}/approve`, {
                method: "POST",
                credentials: "same-origin",
            });
            if (!res.ok) throw new Error(`Request failed (${res.status})`);
            const body = (await res.json()) as { data?: { operationalResult?: HandoffResult | null } };
            setApproveResult(body.data?.operationalResult ?? null);
            await load();
        } catch (e) {
            setApproveErr(e instanceof Error ? e.message : "Approve failed");
        } finally {
            setApproving(false);
        }
    }, [caseId, load]);

    if (loading) {
        return (
            <div className="space-y-3 p-4" aria-busy="true">
                <div className="h-5 w-2/3 animate-pulse rounded bg-stone-100" />
                <div className="h-20 animate-pulse rounded bg-stone-100" />
                <div className="h-16 animate-pulse rounded bg-stone-100" />
            </div>
        );
    }
    if (error) {
        return (
            <div className="m-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <div className="font-medium">Couldn’t load this case</div>
                <div className="mt-0.5 text-xs text-amber-700">{error}</div>
                <button
                    type="button"
                    onClick={() => void load()}
                    className="mt-2 rounded-md border border-amber-300 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
                >
                    Retry
                </button>
            </div>
        );
    }
    const detail = data?.detail ?? null;
    if (!detail) return null;

    const primary = detail.sources.find((s) => s.role === "primary") ?? detail.sources[0] ?? null;
    const evidenceFor = (kind: string, id: string): SourceEvidence | undefined =>
        data?.evidence.find((e) => e.kind === kind && e.id === id);
    const proposed = data?.evidence.flatMap((e) => e.proposedValues) ?? [];
    const destinations = data?.affectedRecordTypes ?? [];
    const isClosed = detail.status === "completed" || detail.status === "archived";

    return (
        <div className="flex h-full min-h-0 flex-col">
            {/* Context header */}
            <div className="shrink-0 border-l-2 border-emerald-600 bg-emerald-50/60 px-4 py-3">
                <div className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-medium text-stone-900">
                        {primary?.display.label ?? "Processing case"}
                    </span>
                    <span className="shrink-0 rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                        {statusLabel(detail.status)}
                    </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-stone-600">
                    <span>{SOURCE_TYPE_LABELS[primary?.kind ?? ""] ?? "Source"}</span>
                    {primary?.display.channel ? <span>· via {primary.display.channel}</span> : null}
                    <span>· received {formatWhen(primary?.display.receivedAt ?? detail.createdAt)}</span>
                    {destinations.length > 0 ? (
                        <span>· → {RECORD_TYPE_LABELS[destinations[0]!] ?? destinations[0]}</span>
                    ) : null}
                </div>
            </div>

            {/* Work surface (scrolls) */}
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                <section className="mb-5">
                    <Eyebrow>Evidence</Eyebrow>
                    <ul className="space-y-2">
                        {detail.sources.map((s) => (
                            <li key={`${s.kind}:${s.id}`} className="rounded-md border border-stone-200 p-2.5">
                                <div className="flex items-center gap-2">
                                    <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[11px] text-stone-600">
                                        {SOURCE_TYPE_LABELS[s.kind] ?? "Source"}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate text-sm text-stone-800">{s.display.label}</span>
                                    <span className="text-[11px] text-stone-400">{s.role}</span>
                                </div>
                                {evidenceFor(s.kind, s.id)?.documentId ? (
                                    <div className="mt-1 text-[11.5px] text-emerald-700">Open document</div>
                                ) : null}
                            </li>
                        ))}
                    </ul>
                </section>

                <section className="mb-5">
                    <Eyebrow>What Alloy read</Eyebrow>
                    <p className="mb-2 text-[11px] text-amber-700">Proposed — not yet promoted to records.</p>
                    {proposed.length === 0 ? (
                        <div className="text-sm text-stone-400">No proposed values on these sources.</div>
                    ) : (
                        <dl className="space-y-1.5">
                            {proposed.map((v, i) => (
                                <div key={`${v.label}:${i}`} className="flex gap-2 text-[13px]">
                                    <dt className="w-44 shrink-0">
                                        <span className="text-stone-600">{v.label}</span>
                                        <span className="ml-1.5">
                                            {v.entityType && v.fieldKey ? (
                                                <span className="rounded bg-stone-100 px-1 py-0.5 text-[10px] text-stone-500">
                                                    {v.entityType}.{v.fieldKey}
                                                </span>
                                            ) : (
                                                <span className="text-[10px] text-stone-400">unmapped</span>
                                            )}
                                        </span>
                                    </dt>
                                    <dd className="min-w-0 flex-1 text-stone-800">{v.value ?? "—"}</dd>
                                </div>
                            ))}
                        </dl>
                    )}
                </section>

                <section className="mb-5">
                    <Eyebrow>Destination</Eyebrow>
                    {destinations.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                            {destinations.map((t) => (
                                <span key={t} className="rounded-md bg-stone-100 px-2 py-0.5 text-[12px] text-stone-700">
                                    {RECORD_TYPE_LABELS[t] ?? t}
                                </span>
                            ))}
                        </div>
                    ) : (
                        <div className="text-sm text-stone-400">Resolved on approval — nothing is promoted until reviewed.</div>
                    )}
                </section>

                <section>
                    <Eyebrow>Activity</Eyebrow>
                    <div className="space-y-1 text-[12px] text-stone-500">
                        <div>Received · {formatWhen(detail.createdAt)}</div>
                        <div>
                            Read {detail.sources.length} source{detail.sources.length === 1 ? "" : "s"}
                            {proposed.length > 0 ? ` · ${proposed.length} proposed value${proposed.length === 1 ? "" : "s"}` : ""}
                        </div>
                        {isClosed ? (
                            <div className="text-emerald-700">
                                {statusLabel(detail.status)} · {formatWhen(detail.updatedAt ?? detail.createdAt)}
                                {approveResult?.recordId
                                    ? ` · ${approveResult.created ? "created" : "linked"} ${RECORD_TYPE_LABELS[approveResult.recordType ?? ""] ?? approveResult.recordType} ${approveResult.recordId}`
                                    : ""}
                            </div>
                        ) : null}
                    </div>
                </section>
            </div>

            {/* Docked action bar */}
            <div className="shrink-0 border-t border-stone-200 bg-stone-50/80 px-4 py-3">
                {isClosed ? (
                    <div className="flex items-center gap-2 text-[12.5px] text-stone-700">
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">✓</span>
                        <span>
                            {statusLabel(detail.status)}
                            {approveResult?.recordId
                                ? ` — ${approveResult.created ? "created" : "linked"} ${RECORD_TYPE_LABELS[approveResult.recordType ?? ""] ?? approveResult.recordType} ${approveResult.recordId}`
                                : approveResult?.note
                                  ? ` — ${approveResult.note}`
                                  : ""}
                        </span>
                    </div>
                ) : (
                    <>
                        <div className="mb-2 flex items-center justify-between gap-2">
                            <div className="text-[12.5px] text-stone-800">
                                <span className="text-[10.5px] font-medium uppercase tracking-wide text-emerald-700">Proposed action</span>
                                <div>Promote this submission to a CRM record</div>
                            </div>
                            <span className="shrink-0 text-right text-[10px] leading-tight text-stone-400">
                                Review-first
                                <br />
                                no silent execution
                            </span>
                        </div>
                        {approveResult?.kind === "needs_mapping" ? (
                            <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11.5px] text-amber-800">
                                Can’t promote yet — {approveResult.note}
                            </div>
                        ) : null}
                        {approveErr ? <div className="mb-2 text-[11.5px] text-amber-700">{approveErr}</div> : null}
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                disabled={approving}
                                onClick={() => void approve()}
                                className="rounded-md bg-emerald-600 px-3.5 py-1.5 text-[12.5px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                            >
                                {approving ? "Approving…" : "Approve action"}
                            </button>
                            {["Adjust match", "Request info", "Reject"].map((label) => (
                                <button
                                    key={label}
                                    type="button"
                                    disabled
                                    title="Coming later"
                                    className="cursor-not-allowed rounded-md border border-stone-200 px-3 py-1.5 text-[12.5px] text-stone-400"
                                >
                                    {label}
                                </button>
                            ))}
                            <span className="text-[10.5px] text-stone-400">Coming later</span>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
