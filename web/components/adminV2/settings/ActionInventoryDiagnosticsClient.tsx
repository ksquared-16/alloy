"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
    classifyRegistryDefinitionExecutor,
    registryExecutorLabel,
} from "@/lib/admin/actions/actionSurfaceFeedback";
import {
    actionPlacementSummary,
    groupActionInventoryRows,
    type ActionInventoryRow,
} from "@/lib/admin/actions/actionInventoryDiagnostics";

export default function ActionInventoryDiagnosticsClient() {
    const [items, setItems] = useState<ActionInventoryRow[] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [expandedKey, setExpandedKey] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch("/api/admin/actions/inventory", { credentials: "include" });
                const j = (await res.json().catch(() => ({}))) as {
                    items?: Array<{
                        definition: ActionInventoryRow["definition"] & { id?: string };
                        placement: ActionInventoryRow["placement"] & { id?: string };
                    }>;
                    error?: string;
                };
                if (cancelled) return;
                if (!res.ok) {
                    setItems([]);
                    setError(j.error ?? "Failed to load");
                    return;
                }
                setItems(
                    (j.items ?? []).map((r) => ({
                        definition: {
                            key: r.definition.key,
                            label: r.definition.label,
                            action_type: r.definition.action_type,
                            entity_type: r.definition.entity_type,
                        },
                        placement: {
                            surface: r.placement.surface,
                            slot: r.placement.slot,
                            entity_type: r.placement.entity_type,
                            section_key: r.placement.section_key,
                        },
                    }))
                );
                setError(null);
            } catch (e) {
                if (!cancelled) {
                    setItems([]);
                    setError(e instanceof Error ? e.message : "Failed to load");
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const groups = useMemo(() => groupActionInventoryRows(items ?? []), [items]);
    const total = items?.length ?? 0;

    return (
        <div className="space-y-5">
            <div className="rounded-xl border border-amber-200/60 bg-amber-50/80 px-4 py-3 text-sm text-amber-950">
                <p className="font-medium">Editing not available here yet</p>
                <p className="mt-1 text-xs leading-relaxed text-amber-950/85">
                    This page is a read-only reference for configured buttons. To change what a button does, use{" "}
                    <Link href="/admin/workflows" className="font-medium underline">
                        Automations
                    </Link>{" "}
                    or contact your Alloy administrator.
                </p>
            </div>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}
            {items == null ? <p className="text-sm text-alloy-midnight/55">Loading…</p> : null}

            {items != null && total === 0 && !error ? (
                <p className="text-sm text-alloy-midnight/55">No configured buttons for this organization.</p>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-alloy-forge/12 bg-white/60 px-3 py-2">
                    <div className="text-2xl font-semibold text-alloy-midnight">{total}</div>
                    <div className="text-xs text-alloy-midnight/55">Configured placements</div>
                </div>
                <div className="rounded-lg border border-alloy-forge/12 bg-white/60 px-3 py-2">
                    <div className="text-2xl font-semibold text-alloy-midnight">{groups.length}</div>
                    <div className="text-xs text-alloy-midnight/55">Surfaces</div>
                </div>
            </div>

            <div className="space-y-4">
                {groups.map((group) => (
                    <section key={group.id} className="rounded-xl border border-alloy-forge/12 bg-white/55 shadow-sm">
                        <div className="border-b border-alloy-forge/10 px-4 py-3">
                            <h2 className="text-sm font-semibold text-alloy-midnight">{group.title}</h2>
                            <p className="text-xs text-alloy-midnight/50">{group.subtitle}</p>
                        </div>
                        <ul className="divide-y divide-alloy-forge/8">
                            {group.items.map((row) => {
                                const detailId = `${group.id}:${row.definition.key}:${row.placement.slot}`;
                                const expanded = expandedKey === detailId;
                                const executor = registryExecutorLabel(
                                    classifyRegistryDefinitionExecutor(row.definition.action_type)
                                );
                                return (
                                    <li key={detailId} className="px-4 py-3">
                                        <div className="flex flex-wrap items-start justify-between gap-2">
                                            <div>
                                                <div className="font-medium text-alloy-midnight">{row.definition.label}</div>
                                                <p className="mt-0.5 text-xs text-alloy-midnight/55">{actionPlacementSummary(row)}</p>
                                            </div>
                                            <span className="rounded-full bg-alloy-pine/10 px-2 py-0.5 text-[11px] font-medium text-alloy-pine">
                                                {executor}
                                            </span>
                                        </div>
                                        <button
                                            type="button"
                                            className="mt-2 text-[11px] font-medium text-alloy-pine hover:underline"
                                            onClick={() => setExpandedKey(expanded ? null : detailId)}
                                        >
                                            {expanded ? "Hide technical details" : "Technical details"}
                                        </button>
                                        {expanded ? (
                                            <dl className="mt-2 grid grid-cols-1 gap-1 text-[11px] text-alloy-midnight/60 sm:grid-cols-2">
                                                <div>
                                                    <dt className="text-alloy-midnight/40">Button key</dt>
                                                    <dd className="font-mono">{row.definition.key}</dd>
                                                </div>
                                                <div>
                                                    <dt className="text-alloy-midnight/40">Action type</dt>
                                                    <dd className="font-mono">{row.definition.action_type}</dd>
                                                </div>
                                                {row.placement.section_key ? (
                                                    <div>
                                                        <dt className="text-alloy-midnight/40">Section</dt>
                                                        <dd className="font-mono">{row.placement.section_key}</dd>
                                                    </div>
                                                ) : null}
                                            </dl>
                                        ) : null}
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                ))}
            </div>
        </div>
    );
}
