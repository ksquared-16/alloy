"use client";

import { useMemo, useState } from "react";
import type { WorkUnitLifecycleCoverage } from "@/lib/workspace/workUnitQueueDerived";
import { summarizeUnmappedRowsForDiagnostics } from "@/lib/workspace/workUnitQueueDerived";

const SETTINGS_STATUSES_HREF = "/adminV2/settings/statuses";
const SETTINGS_WORK_UNITS_HREF = "/adminV2/settings/work-units";

export type WorkUnitLifecycleCoveragePanelProps = {
    /** Lifecycle/stage style work unit (has at least one status-filter lane). */
    hasLifecycleThroughput: boolean;
    showOtherPill: boolean;
    /** From queue summaries + def (may be null while loading). */
    coverage: WorkUnitLifecycleCoverage | null;
    allRecordsQueueKey: string | null;
    selectedQueueKey: string | null;
    /** Raw drill-in rows (same batch as the list). */
    queueItems: unknown[] | null | undefined;
    queueItemsLoading: boolean;
    coveredStatusKeys: Set<string>;
};

/**
 * Operator-facing coverage copy + collapsible admin diagnostics for unmapped / "Other" lifecycle buckets.
 * Uses only data already loaded on the work-unit page (no extra API).
 */
export function WorkUnitLifecycleCoveragePanel({
    hasLifecycleThroughput,
    showOtherPill,
    coverage,
    allRecordsQueueKey,
    selectedQueueKey,
    queueItems,
    queueItemsLoading,
    coveredStatusKeys,
}: WorkUnitLifecycleCoveragePanelProps) {
    const [diagOpen, setDiagOpen] = useState(false);

    const onAllLane =
        Boolean(allRecordsQueueKey) && Boolean(selectedQueueKey) && selectedQueueKey === allRecordsQueueKey;

    const diagnostic = useMemo(
        () => summarizeUnmappedRowsForDiagnostics(queueItems ?? [], coveredStatusKeys, 40),
        [queueItems, coveredStatusKeys]
    );

    if (!hasLifecycleThroughput) return null;

    const unmappedN = coverage?.unmappedCount;
    const showGapWarning =
        coverage?.isComplete === true && typeof unmappedN === "number" && unmappedN > 0 && coverage.allRecordsCount != null;

    return (
        <div className="mt-2 min-w-0 space-y-2 rounded-md border border-admin-border/80 bg-white/40 px-2 py-2 text-[11px] leading-snug text-alloy-forge/80">
            {showOtherPill ? (
                <p className="m-0 text-alloy-forge/75">
                    <span className="font-semibold text-alloy-forge">Other</span> — records in this work unit whose status is not
                    mapped to any lifecycle/stage bucket in <span className="font-medium">queue_definition</span>. This is a{" "}
                    <span className="font-medium">coverage</span> signal, not a separate queue.
                </p>
            ) : null}

            {showGapWarning ? (
                <div
                    className="rounded border border-alloy-honey/35 bg-alloy-honey/[0.07] px-2 py-1.5 text-alloy-forge"
                    role="status"
                >
                    <p className="m-0 font-semibold text-alloy-forge">Coverage gap</p>
                    <p className="mt-1 mb-0 text-alloy-forge/85">
                        {unmappedN} record{unmappedN === 1 ? "" : "s"} in the all-records lane fall outside your stage/status
                        filters. Fix in{" "}
                        <a href={SETTINGS_WORK_UNITS_HREF} className="font-semibold text-alloy-blue hover:underline">
                            Settings → Work units
                        </a>{" "}
                        (queue filters) and/or{" "}
                        <a href={SETTINGS_STATUSES_HREF} className="font-semibold text-alloy-blue hover:underline">
                            Settings → Statuses
                        </a>{" "}
                        — not a UI bug.
                    </p>
                </div>
            ) : null}

            {!coverage?.isComplete && hasLifecycleThroughput ? (
                <p className="m-0 text-alloy-forge/55">Loading queue counts… coverage check unavailable until summaries settle.</p>
            ) : null}

            <div className="border-t border-admin-border/60 pt-2">
                <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 text-left font-semibold text-alloy-forge/70 hover:text-alloy-forge"
                    onClick={() => setDiagOpen((o) => !o)}
                    aria-expanded={diagOpen}
                >
                    <span>Admin diagnostics — unmapped sample</span>
                    <span className="tabular-nums text-alloy-forge/50">{diagOpen ? "−" : "+"}</span>
                </button>
                {diagOpen ? (
                    <div className="mt-2 space-y-2 text-alloy-forge/85">
                        <p className="m-0 text-[10px] text-alloy-forge/55">
                            Sample from the{" "}
                            {onAllLane
                                ? "current page of the all-records lane"
                                : "current list (switch to All records for a broader sample)"}
                            .{queueItemsLoading ? " Loading…" : ""}
                        </p>
                        {diagnostic.samples.length === 0 && !queueItemsLoading ? (
                            <p className="m-0 text-alloy-forge/60">No unmapped rows in this sample.</p>
                        ) : null}
                        {Object.keys(diagnostic.statusKeyCounts).length > 0 ? (
                            <div>
                                <p className="m-0 mb-1 text-[10px] font-semibold uppercase tracking-wide text-alloy-forge/50">
                                    Unmapped status keys (this sample)
                                </p>
                                <ul className="m-0 list-none space-y-0.5 p-0">
                                    {Object.entries(diagnostic.statusKeyCounts)
                                        .sort((a, b) => b[1] - a[1])
                                        .map(([k, n]) => (
                                            <li key={k} className="tabular-nums">
                                                <code className="rounded bg-alloy-stone/15 px-1">{k || "(empty)"}</code> — {n}
                                            </li>
                                        ))}
                                </ul>
                            </div>
                        ) : null}
                        {diagnostic.missingStatusKeyCount > 0 ? (
                            <p className="m-0 tabular-nums">
                                Rows with missing <code className="rounded bg-alloy-stone/15 px-1">status_key</code>:{" "}
                                {diagnostic.missingStatusKeyCount}
                            </p>
                        ) : null}
                        {diagnostic.samples.length > 0 ? (
                            <div className="max-h-48 overflow-auto rounded border border-admin-border/50 bg-white/50">
                                <table className="w-full border-collapse text-left text-[10px]">
                                    <thead className="sticky top-0 bg-alloy-stone/10">
                                        <tr>
                                            <th className="border-b border-admin-border/40 px-1.5 py-1 font-semibold">Label</th>
                                            <th className="border-b border-admin-border/40 px-1.5 py-1 font-semibold">id</th>
                                            <th className="border-b border-admin-border/40 px-1.5 py-1 font-semibold">status_key</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {diagnostic.samples.map((r) => (
                                            <tr key={r.id}>
                                                <td className="border-b border-admin-border/30 px-1.5 py-1">{r.label}</td>
                                                <td className="border-b border-admin-border/30 px-1.5 py-1 font-mono text-alloy-forge/70">
                                                    {r.id}
                                                </td>
                                                <td className="border-b border-admin-border/30 px-1.5 py-1 font-mono">
                                                    {r.statusKey ?? "—"}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : null}
                        {diagnostic.truncated ? (
                            <p className="m-0 text-[10px] text-alloy-forge/55">Table truncated for display; not all rows shown.</p>
                        ) : null}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
