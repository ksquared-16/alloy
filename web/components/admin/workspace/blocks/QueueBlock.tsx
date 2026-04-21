"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { executeOpportunityRecordAction } from "@/lib/recordChrome/executeOpportunityRecordAction";
import type { WorkspaceOpportunityQueueRuntime, WorkspaceQueueBlock, WorkspaceRuntimeData } from "@/lib/workspace/types";

function isUnassignedWorkUnitRow(w: { name?: string | null; key?: string | null }): boolean {
    const n = (w.name ?? "").toLowerCase();
    const k = (w.key ?? "").toLowerCase();
    return n.includes("unassign") || k === "unassigned" || k === "unassigned_jobs";
}

/**
 * Work units seeded for routing (e.g. `todays_schedule`) are also listed as explicit
 * `department_workspace_route` rows — without this, the same lane appears twice (link + stub).
 */
function opportunityQueueLookup(
    runtime: WorkspaceRuntimeData,
    workUnitKey: string
): WorkspaceOpportunityQueueRuntime | undefined {
    const k = workUnitKey.trim();
    const lower = k.toLowerCase();
    const oq = runtime.opportunityQueues;
    if (!oq) return undefined;
    return oq[lower] ?? oq[k] ?? oq[workUnitKey];
}

const OPP_QUEUE_QUICK: { eventKey: string; label: string }[] = [
    { eventKey: "qualify_opportunity", label: "Qualify" },
    { eventKey: "start_quote", label: "Quote" },
    { eventKey: "mark_lost", label: "Lost" },
];

function OpportunityQueueInlinePreview({ oq, runtime }: { oq: WorkspaceOpportunityQueueRuntime; runtime: WorkspaceRuntimeData }) {
    const { openDrawer } = useAdminDrawer();
    const router = useRouter();
    const [busyId, setBusyId] = useState<string | null>(null);
    if (oq.error) {
        return <p className="text-xs mt-2 text-amber-800">{oq.error}</p>;
    }
    if (!oq.items.length) {
        return <p className="text-xs mt-2" style={{ color: "var(--d-muted)" }}>No opportunities in this projection.</p>;
    }
    return (
        <ul className="mt-2 space-y-1 pl-0 list-none" role="list">
            {oq.items.slice(0, 8).map((row) => {
                const title = (row.name ?? "").trim() || "Opportunity";
                const price =
                    row.quote_total != null && !Number.isNaN(Number(row.quote_total))
                        ? `$${Number(row.quote_total).toFixed(2)}`
                        : null;
                const sub = [row._customer_name?.trim(), row.status_key?.trim(), price]
                    .filter(Boolean)
                    .join(" · ");
                return (
                    <li key={row.id} className="rounded-lg border border-[var(--d-border,rgba(39,63,82,0.14))] overflow-hidden bg-[var(--d-surface,#fff)]">
                        <button
                            type="button"
                            className="w-full text-left px-2 py-1.5 text-xs transition-colors hover:opacity-95"
                            style={{
                                color: "var(--d-text-primary)",
                            }}
                            onClick={() => openDrawer({ type: "opportunities", id: row.id })}
                        >
                            <span className="font-medium block">{title}</span>
                            {sub ? (
                                <span className="block opacity-75 tabular-nums" style={{ fontSize: 11 }}>
                                    {sub}
                                </span>
                            ) : null}
                        </button>
                        {runtime.opportunityQueueQuickActions ? (
                            <div className="flex flex-wrap gap-1 px-2 pb-1.5 pt-0 border-t border-[var(--d-border,rgba(39,63,82,0.1))]">
                                {OPP_QUEUE_QUICK.map(({ eventKey, label }) => (
                                    <button
                                        key={eventKey}
                                        type="button"
                                        disabled={busyId === `${row.id}:${eventKey}`}
                                        className="text-[10px] px-1.5 py-0.5 rounded border border-alloy-stone/40 text-alloy-midnight/85 hover:bg-alloy-stone/20 disabled:opacity-50"
                                        onClick={async (e) => {
                                            e.stopPropagation();
                                            if (eventKey === "start_quote") {
                                                openDrawer({ type: "opportunities", id: row.id, defaultOpportunitySurface: "quote_intake" });
                                                return;
                                            }
                                            setBusyId(`${row.id}:${eventKey}`);
                                            try {
                                                const r = await executeOpportunityRecordAction({
                                                    opportunityId: row.id,
                                                    eventKey,
                                                });
                                                if (r.ok) router.refresh();
                                            } finally {
                                                setBusyId(null);
                                            }
                                        }}
                                    >
                                        {busyId === `${row.id}:${eventKey}` ? "…" : label}
                                    </button>
                                ))}
                            </div>
                        ) : null}
                    </li>
                );
            })}
        </ul>
    );
}

function workUnitKeysSupersededByDepartmentRoutes(block: WorkspaceQueueBlock): Set<string> {
    const out = new Set<string>();
    for (const e of block.entries) {
        if (e.kind !== "department_workspace_route") continue;
        if (e.segment === "scheduled-today") {
            out.add("todays_schedule");
            out.add("scheduled_today");
        }
        if (e.segment === "needs-attention") {
            out.add("needs_attention");
        }
    }
    return out;
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
    const supersededByRoutes = workUnitKeysSupersededByDepartmentRoutes(block);

    const remaining = (runtime.workUnits ?? []).filter((wu) => {
        if (hasUnassignedTriage && isUnassignedWorkUnitRow(wu)) return false;
        const k = (wu.key ?? "").trim().toLowerCase();
        if (k && supersededByRoutes.has(k)) return false;
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
                        if (entry.kind === "department_workspace_route") {
                            const href = `${base}/${entry.segment}`;
                            return (
                                <li key={`route-${entry.segment}-${i}`} className="adminv2-ws-wu-queue-item-wrap" role="listitem">
                                    <Link
                                        href={href}
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
                        const oq = opportunityQueueLookup(runtime, entry.work_unit_key);
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
                                        {oq ? <OpportunityQueueInlinePreview oq={oq} runtime={runtime} /> : null}
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
                        if (entry.kind === "department_workspace_route") {
                            const href = `${base}/${entry.segment}`;
                            return (
                                <li key={`route-${entry.segment}-${i}`}>
                                    <Link href={href} className="block px-4 py-3 hover:bg-alloy-stone/30 transition-colors">
                                        <span className="font-medium text-alloy-midnight">{entry.label}</span>
                                        {entry.description ? (
                                            <p className="text-xs text-alloy-midnight/55 mt-0.5">{entry.description}</p>
                                        ) : null}
                                    </Link>
                                </li>
                            );
                        }
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
                        const oq = opportunityQueueLookup(runtime, entry.work_unit_key);
                        return (
                            <li key={`wk-${entry.work_unit_key}-${i}`} className="px-4 py-3 bg-alloy-stone/10">
                                <span className="text-sm text-alloy-midnight/80">{title}</span>
                                <p className="text-xs text-alloy-midnight/45 mt-0.5">{desc}</p>
                                {oq ? <OpportunityQueueInlinePreview oq={oq} runtime={runtime} /> : null}
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
