"use client";

/**
 * POS-FP3/FP-W/FP6 — operational Processing queue (controlled).
 *
 * LEFT column of the converged Processing modal and the standalone page. Consumes
 * the FP2-backed `/api/admin/processing/queue` endpoint. FP6 upgrades the flat list
 * to a Communications-V2-style operational queue: grouped by state, rich rows
 * (source title + on-ramp kind + age + status), Pine selection accent, and
 * intentional empty / loading / error states. Read-only; selection is controlled.
 */

import { useCallback, useEffect, useState } from "react";
import type { ProcessingCaseQueueRow, ProcessingCaseStatus } from "@/lib/pos/processingCase/readModel/types";

/** Display order: operator-actionable lanes first; completed/archived are secondary. */
const PRIMARY_LANES: { key: ProcessingCaseStatus; label: string }[] = [
    { key: "needs_resolution", label: "Needs resolution" },
    { key: "needs_review", label: "Needs review" },
    { key: "ready", label: "Ready to approve" },
    { key: "received", label: "Received" },
    { key: "processing", label: "Processing" },
];
const SECONDARY_LANES: { key: ProcessingCaseStatus; label: string }[] = [
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

/** Lane accent for the eyebrow — quiet, semantic, no rainbow. */
const LANE_TONE: Record<string, string> = {
    needs_resolution: "text-amber-700",
    needs_review: "text-amber-700",
    ready: "text-emerald-700",
    received: "text-stone-500",
    processing: "text-stone-500",
    completed: "text-stone-400",
    archived: "text-stone-400",
};

interface QueueResponse {
    data: { rows: ProcessingCaseQueueRow[]; next_cursor: unknown; counts: Record<string, number> };
}

function formatAge(iso: string | null): string {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    const mins = Math.round((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.round(hrs / 24);
    if (days < 7) return `${days}d`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function ProcessingQueueList({
    selectedCaseId,
    onSelectCase,
}: {
    selectedCaseId: string | null;
    onSelectCase: (caseId: string) => void;
}) {
    const [rows, setRows] = useState<ProcessingCaseQueueRow[]>([]);
    const [counts, setCounts] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const url = new URL("/api/admin/processing/queue", window.location.origin);
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
        void load();
    }, [load]);

    const total = rows.length;

    if (loading) {
        return (
            <div className="space-y-2 p-3" aria-busy="true">
                {[0, 1, 2].map((i) => (
                    <div key={i} className="h-12 animate-pulse rounded-md bg-stone-100" />
                ))}
            </div>
        );
    }

    if (error) {
        return (
            <div className="m-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <div className="font-medium">Couldn’t load the queue</div>
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

    if (total === 0) {
        return (
            <div className="m-3 rounded-lg border border-dashed border-stone-200 bg-stone-50/60 p-5 text-center">
                <div className="text-sm font-medium text-stone-700">No active processing</div>
                <p className="mx-auto mt-1 max-w-[18rem] text-xs leading-relaxed text-stone-500">
                    Enable Processing on a form, submit it through the public link, and new cases will appear here for review.
                </p>
                <a
                    href="/admin/forms"
                    className="mt-3 inline-flex items-center gap-1 rounded-md border border-emerald-700 px-2.5 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-50"
                >
                    Go to Forms
                </a>
            </div>
        );
    }

    const renderLane = (lane: { key: ProcessingCaseStatus; label: string }) => {
        const laneRows = rows.filter((r) => r.status === lane.key);
        if (laneRows.length === 0) return null;
        const count = typeof counts[lane.key] === "number" ? counts[lane.key] : laneRows.length;
        return (
            <div key={lane.key} className="mb-1.5">
                <div
                    className={`px-3 pb-1 pt-2 text-[10.5px] font-medium uppercase tracking-wide ${LANE_TONE[lane.key] ?? "text-stone-500"}`}
                >
                    {lane.label} · {count}
                </div>
                <ul>
                    {laneRows.map((row) => {
                        const selected = selectedCaseId === row.id;
                        const kindLabel = SOURCE_TYPE_LABELS[row.primarySource?.kind ?? ""] ?? "Source";
                        const title = row.sourceDisplay?.label ?? row.primarySource?.kind ?? "Untitled source";
                        const channel = row.sourceDisplay?.channel ?? null;
                        return (
                            <li key={row.id}>
                                <button
                                    type="button"
                                    onClick={() => onSelectCase(row.id)}
                                    aria-current={selected}
                                    className={`flex w-full items-start gap-2.5 border-l-2 px-3 py-2 text-left transition-colors ${
                                        selected
                                            ? "border-emerald-600 bg-emerald-50/70"
                                            : "border-transparent hover:bg-stone-50"
                                    }`}
                                >
                                    <span className="min-w-0 flex-1">
                                        <span className="flex items-center gap-2">
                                            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-stone-900">
                                                {title}
                                            </span>
                                            <span className="shrink-0 text-[10.5px] text-stone-400">{formatAge(row.sourceDisplay?.receivedAt ?? row.createdAt)}</span>
                                        </span>
                                        <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-stone-500">
                                            <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-600">{kindLabel}</span>
                                            {channel ? <span className="truncate">via {channel}</span> : null}
                                            {row.relatedSourceCount > 0 ? <span>· +{row.relatedSourceCount} source{row.relatedSourceCount > 1 ? "s" : ""}</span> : null}
                                        </span>
                                    </span>
                                </button>
                            </li>
                        );
                    })}
                </ul>
            </div>
        );
    };

    return (
        <div className="w-full py-1">
            {PRIMARY_LANES.map(renderLane)}
            {SECONDARY_LANES.some((l) => rows.some((r) => r.status === l.key)) ? (
                <div className="mt-1 border-t border-stone-100 pt-1">{SECONDARY_LANES.map(renderLane)}</div>
            ) : null}
        </div>
    );
}
