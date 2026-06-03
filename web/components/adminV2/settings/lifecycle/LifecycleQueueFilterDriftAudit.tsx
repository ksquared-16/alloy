"use client";

import { useCallback, useEffect, useState } from "react";
import type { QueueFilterEvaluationCompare } from "@/lib/lifecycle/lifecycleQueueFilterEvaluationCompare";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

export default function LifecycleQueueFilterDriftAudit({
    departmentId,
    stageKey,
    stageLabel,
    statusDisplayLabels,
    clientHints,
}: {
    departmentId: string;
    stageKey: string;
    stageLabel?: string | null;
    statusDisplayLabels?: readonly string[];
    clientHints?: {
        work_unit_identity_state?: string;
        work_unit_needs_sync?: boolean;
        pipeline_work_unit_id?: string | null;
    };
}) {
    const [compare, setCompare] = useState<QueueFilterEvaluationCompare | null>(null);
    const [report, setReport] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        if (!departmentId || !stageKey.trim()) return;
        setLoading(true);
        setError(null);
        try {
            const q = new URLSearchParams({ stage_key: stageKey.trim() });
            const res = await fetch(
                `/api/admin/departments/${encodeURIComponent(departmentId)}/lifecycle-queue-filter-audit?${q}`,
                workspaceDataFetchInit()
            );
            const j = (await res.json().catch(() => ({}))) as {
                compare?: QueueFilterEvaluationCompare;
                report?: string;
                error?: string;
            };
            if (!res.ok) throw new Error(j.error ?? "Audit failed");
            setCompare(j.compare ?? null);
            setReport(j.report ?? null);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Audit failed");
            setCompare(null);
            setReport(null);
        } finally {
            setLoading(false);
        }
    }, [departmentId, stageKey, stageLabel, statusDisplayLabels, clientHints]);

    useEffect(() => {
        void load();
    }, [load]);

    if (loading && !report) {
        return (
            <p className="text-[10px] text-alloy-midnight/50" data-testid="lifecycle-queue-filter-audit-loading">
                Loading queue filter drift audit…
            </p>
        );
    }

    return (
        <div
            className="mt-2 space-y-2 rounded-md border border-amber-300/80 bg-amber-50/90 p-2"
            data-testid="lifecycle-queue-filter-drift-audit"
        >
            <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-950">
                    Queue filter drift audit (proof only)
                </p>
                <button
                    type="button"
                    className="text-[10px] font-medium text-alloy-pine hover:underline"
                    onClick={() => void load()}
                    data-testid="lifecycle-queue-filter-audit-refresh"
                >
                    Refresh
                </button>
            </div>
            {error ? (
                <p className="text-[10px] text-red-800" role="alert">
                    {error}
                </p>
            ) : null}
            {compare?.diverges ? (
                <p className="text-[10px] font-medium text-red-900" data-testid="lifecycle-queue-filter-audit-diverges">
                    Evaluators disagree — see report below.
                </p>
            ) : compare ? (
                <p className="text-[10px] text-alloy-pine" data-testid="lifecycle-queue-filter-audit-agree">
                    Server evaluators agree for focus stage.
                </p>
            ) : null}
            {report ? (
                <pre
                    className="max-h-96 overflow-auto whitespace-pre-wrap break-words font-mono text-[9px] leading-snug text-amber-950"
                    data-testid="lifecycle-queue-filter-audit-report"
                >
                    {report}
                </pre>
            ) : null}
        </div>
    );
}
