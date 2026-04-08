"use client";

import Link from "next/link";
import type { WorkspaceQueueBlock, WorkspaceRuntimeData } from "@/lib/workspace/types";

function isUnassignedWorkUnitRow(w: { name?: string | null; key?: string | null }): boolean {
    const n = (w.name ?? "").toLowerCase();
    const k = (w.key ?? "").toLowerCase();
    return n.includes("unassign") || k === "unassigned" || k === "unassigned_jobs";
}

export function QueueBlock({
    block,
    departmentId,
    runtime,
}: {
    block: WorkspaceQueueBlock;
    departmentId: string;
    runtime: WorkspaceRuntimeData;
}) {
    const base = `/admin/workspace/dept/${departmentId}`;
    const unassignedHref = `${base}/unassigned`;

    const coveredKeys = new Set<string>();
    for (const e of block.entries) {
        if (e.kind === "work_unit_key") coveredKeys.add(e.work_unit_key.trim().toLowerCase());
    }

    const hasUnassignedTriage = block.entries.some((e) => e.kind === "unassigned_jobs_triage");

    const remaining = (runtime.workUnits ?? []).filter((wu) => {
        if (hasUnassignedTriage && isUnassignedWorkUnitRow(wu)) return false;
        const k = (wu.key ?? "").trim().toLowerCase();
        if (k && coveredKeys.has(k)) return false;
        return true;
    });

    const showRemaining = block.list_remaining_work_units !== false && remaining.length > 0;
    const hasEntries = block.entries.length > 0;

    return (
        <section className="rounded-xl border border-admin-border bg-white p-5 shadow-sm" data-workspace-block="queue">
            <h2 className="text-sm font-semibold text-alloy-midnight">{block.title ?? "Queues"}</h2>
            {block.subtitle ? <p className="text-xs text-alloy-midnight/60 mt-1">{block.subtitle}</p> : null}

            {(hasEntries || showRemaining) && (
                <ul className="mt-4 divide-y divide-admin-border border border-admin-border rounded-lg overflow-hidden">
                    {block.entries.map((entry, i) => {
                        if (entry.kind === "unassigned_jobs_triage") {
                            return (
                                <li key={`triage-${i}`}>
                                    <Link
                                        href={unassignedHref}
                                        className="block px-4 py-3 hover:bg-alloy-stone/30 transition-colors"
                                    >
                                        <span className="font-medium text-alloy-midnight">{entry.label}</span>
                                        {entry.description ? (
                                            <p className="text-xs text-alloy-midnight/55 mt-0.5">{entry.description}</p>
                                        ) : null}
                                    </Link>
                                </li>
                            );
                        }
                        const wu = runtime.workUnits.find(
                            (w) => (w.key ?? "").trim().toLowerCase() === entry.work_unit_key.trim().toLowerCase()
                        );
                        const title = entry.label ?? wu?.name ?? entry.work_unit_key;
                        const desc =
                            entry.description ??
                            (wu
                                ? "Work unit is configured; dedicated queue route ships with the interpreter."
                                : "Work unit row not found for this key in the current department.");
                        return (
                            <li key={`wk-${entry.work_unit_key}-${i}`} className="px-4 py-3 bg-alloy-stone/10">
                                <span className="text-sm text-alloy-midnight/80">{title}</span>
                                <p className="text-xs text-alloy-midnight/45 mt-0.5">{desc}</p>
                            </li>
                        );
                    })}
                    {showRemaining &&
                        remaining.map((wu) => (
                            <li key={wu.id} className="px-4 py-3 bg-alloy-stone/10">
                                <span className="text-sm text-alloy-midnight/70">{wu.name ?? "Work unit"}</span>
                                <p className="text-xs text-alloy-midnight/45 mt-0.5">
                                    Queue UI deferred — add a layout entry or work-unit route when ready.
                                </p>
                            </li>
                        ))}
                </ul>
            )}

            {!hasEntries && !showRemaining ? (
                <p className="mt-3 text-sm text-alloy-midnight/55">No queue entry points configured for this layout.</p>
            ) : null}
        </section>
    );
}
