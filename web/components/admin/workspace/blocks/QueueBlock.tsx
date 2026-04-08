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
    presentation = "flat",
    workspaceBasePath = "/admin/workspace",
}: {
    block: WorkspaceQueueBlock;
    departmentId: string;
    runtime: WorkspaceRuntimeData;
    presentation?: "flat" | "bridge";
    /** Must match the app route segment (e.g. `/adminV2/workspace` for product shell). */
    workspaceBasePath?: string;
}) {
    const base = `${workspaceBasePath.replace(/\/$/, "")}/dept/${departmentId}`;
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

    const listBody = (
        <>
            {(hasEntries || showRemaining) && (
                <ul className="adminv2-ws-queue-list" role="list">
                    {block.entries.map((entry, i) => {
                        if (entry.kind === "unassigned_jobs_triage") {
                            return (
                                <li key={`triage-${i}`} className="adminv2-ws-wu-queue-item-wrap" role="listitem">
                                    <Link
                                        href={unassignedHref}
                                        className="adminv2-ws-wu-queue-card adminv2-ws-wu-queue-card--compact adminv2-ws-wu-queue-card--tier-standard flex flex-col items-stretch no-underline text-inherit hover:opacity-[0.98]"
                                        data-ws-wu-urgency="standard"
                                    >
                                        <div className="adminv2-ws-wu-queue-card-compact-text">
                                            <div className="adminv2-ws-wu-queue-card-title adminv2-ws-wu-queue-card-title--compact">
                                                {entry.label}
                                            </div>
                                            {entry.description ? (
                                                <div className="adminv2-ws-wu-queue-card-sub adminv2-ws-wu-queue-card-sub--compact">
                                                    {entry.description}
                                                </div>
                                            ) : null}
                                        </div>
                                        <div className="adminv2-ws-wu-queue-card-compact-aside">
                                            <span className="adminv2-ws-wu-queue-action-chip adminv2-ws-wu-queue-action-chip--open">
                                                Open queue
                                            </span>
                                        </div>
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
                            <li key={`wk-${entry.work_unit_key}-${i}`} className="adminv2-ws-wu-queue-item-wrap" role="listitem">
                                <div className="adminv2-ws-wu-queue-card adminv2-ws-wu-queue-card--compact adminv2-ws-wu-queue-card--tier-standard opacity-90">
                                    <div className="adminv2-ws-wu-queue-card-compact-text">
                                        <div className="adminv2-ws-wu-queue-card-title adminv2-ws-wu-queue-card-title--compact">
                                            {title}
                                        </div>
                                        <div className="adminv2-ws-wu-queue-card-sub adminv2-ws-wu-queue-card-sub--compact">
                                            {desc}
                                        </div>
                                    </div>
                                </div>
                            </li>
                        );
                    })}
                    {showRemaining &&
                        remaining.map((wu) => (
                            <li key={wu.id} className="adminv2-ws-wu-queue-item-wrap" role="listitem">
                                <div className="adminv2-ws-wu-queue-card adminv2-ws-wu-queue-card--compact adminv2-ws-wu-queue-card--tier-standard opacity-80">
                                    <div className="adminv2-ws-wu-queue-card-compact-text">
                                        <div className="adminv2-ws-wu-queue-card-title adminv2-ws-wu-queue-card-title--compact">
                                            {wu.name ?? "Work unit"}
                                        </div>
                                        <div className="adminv2-ws-wu-queue-card-sub adminv2-ws-wu-queue-card-sub--compact">
                                            Queue UI deferred — add a layout entry or work-unit route when ready.
                                        </div>
                                    </div>
                                </div>
                            </li>
                        ))}
                </ul>
            )}
            {!hasEntries && !showRemaining ? (
                <p className="text-sm px-1 py-2" style={{ color: "var(--d-muted)" }}>
                    No queue entry points configured for this layout.
                </p>
            ) : null}
        </>
    );

    if (presentation === "bridge") {
        return (
            <section
                className="adminv2-ws-dept-qsec adminv2-ws-dept-qsec--primary adminv2-ws-wu-queue-shell adminv2-ws-dept-throughput-panel"
                data-workspace-block="queue"
                aria-label={block.title ?? "Queues"}
            >
                <header className="adminv2-ws-queue-header">
                    <div className="adminv2-ws-queue-title-row">
                        <h3 className="adminv2-ws-queue-title">{block.title ?? "Queues"}</h3>
                    </div>
                </header>
                {block.subtitle ? (
                    <p className="adminv2-ws-wu-queue-summary" style={{ marginTop: 4 }}>
                        {block.subtitle}
                    </p>
                ) : null}
                {/* Nested work-unit surface so `workspace.css` queue row rules (work_unit-scoped) apply inside department bridge. */}
                <div data-ws-surface="work_unit" className="adminv2-ws-wu-v2">
                    {listBody}
                </div>
            </section>
        );
    }

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
