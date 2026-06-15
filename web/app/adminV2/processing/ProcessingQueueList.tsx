"use client";

/**
 * POS-FP3/FP-W — read-only Processing queue list (controlled).
 *
 * Extracted from the FP3 queue so it can be the LEFT column of the converged
 * Processing modal AND back the standalone page. Consumes the FP2-backed
 * `/api/admin/processing/queue` endpoint. Rows lead with source label + type +
 * status + received + related count — not IDs. Read-only; selection is controlled.
 */

import { useCallback, useEffect, useState } from "react";
import type { ProcessingCaseQueueRow, ProcessingCaseStatus } from "@/lib/pos/processingCase/readModel/types";

const LANES: { key: ProcessingCaseStatus; label: string }[] = [
    { key: "received", label: "Received" },
    { key: "processing", label: "Processing" },
    { key: "needs_review", label: "Needs review" },
    { key: "needs_resolution", label: "Needs resolution" },
    { key: "ready", label: "Ready" },
    { key: "completed", label: "Completed" },
    { key: "archived", label: "Archived" },
];

const SOURCE_TYPE_LABELS: Record<string, string> = {
    form_submission: "Form",
    form_packet_session: "Packet",
    document: "Document",
    upload: "Upload",
    email_attachment: "Email",
    import: "Import",
    recreated_document: "Recreated",
};

interface QueueResponse {
    data: { rows: ProcessingCaseQueueRow[]; next_cursor: unknown; counts: Record<string, number> };
}

function statusLabel(status: ProcessingCaseStatus): string {
    return LANES.find((l) => l.key === status)?.label ?? status;
}

function formatReceived(iso: string | null): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function ProcessingQueueList({
    selectedCaseId,
    onSelectCase,
}: {
    selectedCaseId: string | null;
    onSelectCase: (caseId: string) => void;
}) {
    const [lane, setLane] = useState<ProcessingCaseStatus | null>(null);
    const [rows, setRows] = useState<ProcessingCaseQueueRow[]>([]);
    const [counts, setCounts] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async (status: ProcessingCaseStatus | null) => {
        setLoading(true);
        setError(null);
        try {
            const url = new URL("/api/admin/processing/queue", window.location.origin);
            if (status) url.searchParams.set("status", status);
            const res = await fetch(url.toString(), { credentials: "same-origin" });
            if (!res.ok) throw new Error(`Request failed (${res.status})`);
            const body = (await res.json()) as QueueResponse;
            setRows(body.data.rows);
            setCounts(body.data.counts);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load processing queue");
            setRows([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void load(lane);
    }, [lane, load]);

    return (
        <div className="w-full">
            <div className="mb-3 flex flex-wrap gap-2" role="tablist" aria-label="Processing lanes">
                <button
                    type="button"
                    role="tab"
                    aria-selected={lane === null}
                    onClick={() => setLane(null)}
                    className={`rounded-md border px-2.5 py-1 text-xs ${lane === null ? "border-emerald-700 text-emerald-800" : "border-stone-300 text-stone-600"}`}
                >
                    All
                </button>
                {LANES.map((l) => (
                    <button
                        key={l.key}
                        type="button"
                        role="tab"
                        aria-selected={lane === l.key}
                        onClick={() => setLane(l.key)}
                        className={`rounded-md border px-2.5 py-1 text-xs ${lane === l.key ? "border-emerald-700 text-emerald-800" : "border-stone-300 text-stone-600"}`}
                    >
                        {l.label}
                        {typeof counts[l.key] === "number" ? ` · ${counts[l.key]}` : ""}
                    </button>
                ))}
            </div>

            <div className="rounded-lg border border-stone-200 bg-white">
                {loading ? (
                    <div className="p-4 text-sm text-stone-500">Loading…</div>
                ) : error ? (
                    <div className="p-4 text-sm text-amber-700">{error}</div>
                ) : rows.length === 0 ? (
                    <div className="p-6 text-sm text-stone-400">No active processing.</div>
                ) : (
                    <ul className="divide-y divide-stone-100">
                        {rows.map((row) => (
                            <li key={row.id}>
                                <button
                                    type="button"
                                    onClick={() => onSelectCase(row.id)}
                                    aria-current={selectedCaseId === row.id}
                                    className={`flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-stone-50 ${selectedCaseId === row.id ? "bg-emerald-50/60" : ""}`}
                                >
                                    <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[11px] text-stone-600">
                                        {SOURCE_TYPE_LABELS[row.primarySource?.kind ?? ""] ?? "Source"}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-stone-800">
                                        {row.sourceDisplay?.label ?? row.primarySource?.kind ?? "Untitled source"}
                                    </span>
                                    <span className="rounded-full bg-emerald-50 px-1.5 py-0.5 text-[11px] text-emerald-800">
                                        {statusLabel(row.status)}
                                    </span>
                                    {row.relatedSourceCount > 0 ? (
                                        <span className="text-[11px] text-stone-500">+{row.relatedSourceCount}</span>
                                    ) : null}
                                    <span className="w-12 text-right text-[11px] text-stone-500">
                                        {formatReceived(row.sourceDisplay?.receivedAt ?? row.createdAt)}
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
