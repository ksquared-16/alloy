"use client";

/**
 * Processing → Work → Incoming KPI strip.
 *
 * Compact operational pulse, visually identical to the Communications KPI band (both
 * render the shared `CompactKpiStrip` with platform KPI color semantics). Counts come
 * from the EXISTING processing queue endpoint (`GET /api/admin/processing/queue`) —
 * no new API, no schema, no fabricated metrics.
 *
 * Data source:
 *   • Needs review / Ready to approve / Needs a decision — real status counts the API
 *     returns in `data.counts`.
 *   • Saved today — derived safely from loaded rows (completed cases whose status
 *     changed today). Reflects loaded cases only; never invents a value.
 */

import CompactKpiStrip, { type CompactKpiItem } from "@/components/workspace/CompactKpiStrip";
import { useProcessingQueueWarm } from "@/lib/pos/useProcessingQueueWarm";

function isToday(iso: string | null | undefined): boolean {
    if (!iso) return false;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return false;
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

export default function ProcessingKpiStrip() {
    const { data, loading } = useProcessingQueueWarm();
    const counts = data?.counts ?? {};
    const rows = data?.rows ?? [];

    const savedToday = rows.filter((r) => r.status === "completed" && isToday(r.statusChangedAt)).length;

    const items: CompactKpiItem[] = [
        { key: "needs_review", label: "Needs review", value: String(counts.needs_review ?? 0), state: "attention" },
        { key: "ready", label: "Ready to approve", value: String(counts.ready ?? 0), state: "ready" },
        { key: "saved_today", label: "Saved today", value: String(savedToday), state: "done" },
        { key: "needs_decision", label: "Needs a decision", value: String(counts.needs_resolution ?? 0), state: "pending" },
    ];

    return <CompactKpiStrip items={items} loading={loading} ariaLabel="Processing status" />;
}
