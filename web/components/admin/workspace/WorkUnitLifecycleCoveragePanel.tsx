"use client";

import { useMemo, useState } from "react";
import type { WorkUnitLifecycleCoverage } from "@/lib/workspace/workUnitQueueDerived";
import { summarizeUnmappedRowsForDiagnostics } from "@/lib/workspace/workUnitQueueDerived";

import { adminSettingsSubpathHref } from "@/lib/admin/canonicalAdminRoutes";

const SETTINGS_STATUSES_HREF = adminSettingsSubpathHref("statuses");
const SETTINGS_WORK_UNITS_HREF = adminSettingsSubpathHref("work-units");

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
/**
 * Staging/production: never show “Loading queue counts…”, “Admin / diagnostics”, or the collapsible
 * diagnostics block unless both are true: local NODE_ENV=development and NEXT_PUBLIC_SHOW_ADMIN_QUEUE_DIAGNOSTICS=1.
 */
const SHOW_QUEUE_DIAGNOSTICS =
    process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_SHOW_ADMIN_QUEUE_DIAGNOSTICS === "1";

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
    const hasUnmappedFromSummaries =
        coverage?.isComplete === true && typeof unmappedN === "number" && unmappedN > 0 && coverage.allRecordsCount != null;

    const showPanel = showOtherPill || !coverage?.isComplete || hasUnmappedFromSummaries;

    if (!showPanel) return null;

    return (
        <div className="mt-1.5 min-w-0 border-t border-admin-border/35 pt-2 text-[11px] leading-snug text-alloy-forge/72">
            {showOtherPill ? (
                <p className="m-0 text-alloy-forge/75">
                    <span className="font-semibold text-alloy-forge">Other</span> — records in this work unit whose status is
                    not mapped to any lifecycle/stage bucket in <span className="font-medium">queue_definition</span>. This is
                    a <span className="font-medium">coverage</span> signal, not a separate queue.
                </p>
            ) : null}

            {!coverage?.isComplete && hasLifecycleThroughput && SHOW_QUEUE_DIAGNOSTICS ? (
                <p className="m-0 mt-1.5 text-alloy-forge/55">Loading queue counts… coverage check unavailable until summaries settle.</p>
            ) : null}

            <div className={showOtherPill || hasUnmappedFromSummaries ? "mt-2 border-t border-admin-border/25 pt-2" : ""}>
                {SHOW_QUEUE_DIAGNOSTICS ? (
                <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 text-left text-[11px] font-medium text-alloy-forge/60 hover:text-alloy-forge/85"
                    onClick={() => setDiagOpen((o) => !o)}
                    aria-expanded={diagOpen}
                >
                    <span>Admin / diagnostics</span>
                    <span className="tabular-nums text-alloy-forge/45">{diagOpen ? "−" : "+"}</span>
                </button>
                ) : null}
                {SHOW_QUEUE_DIAGNOSTICS && diagOpen ? (
                    <div className="mt-2 space-y-2 text-alloy-forge/80">
                        {hasUnmappedFromSummaries ? (
                            <p className="m-0 text-[10px] leading-snug text-alloy-forge/58">
                                Summaries show{" "}
                                <span className="tabular-nums font-medium text-alloy-forge/72">{unmappedN}</span> record
                                {unmappedN === 1 ? "" : "s"} in the all-records lane outside mapped stage/status filters — a
                                configuration/data topic, not a UI fault. Adjust in{" "}
                                <a href={SETTINGS_WORK_UNITS_HREF} className="font-medium text-alloy-blue hover:underline">
                                    Settings → Work units
                                </a>{" "}
                                and/or{" "}
                                <a href={SETTINGS_STATUSES_HREF} className="font-medium text-alloy-blue hover:underline">
                                    Settings → Statuses
                                </a>
                                .
                            </p>
                        ) : null}
                        <p className="m-0 text-[10px] text-alloy-forge/52">
                            Sample from the{" "}
                            {onAllLane
                                ? "current page of the all-records lane"
                                : "current list (switch to All records for a broader sample)"}
                            .{queueItemsLoading ? " Loading…" : ""}
                        </p>
                        {diagnostic.samples.length === 0 && !queueItemsLoading ? (
                            <p className="m-0 text-alloy-forge/58">No unmapped rows in this sample.</p>
                        ) : null}
                        {Object.keys(diagnostic.statusKeyCounts).length > 0 ? (
                            <div>
                                <p className="m-0 mb-1 text-[10px] font-semibold tracking-wide text-alloy-forge/48">
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
                            <p className="m-0 text-[10px] text-alloy-forge/52">Table truncated for display; not all rows shown.</p>
                        ) : null}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
