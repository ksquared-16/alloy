"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type InventoryItem = {
    definition: {
        id: string;
        org_id: string | null;
        key: string;
        label: string;
        action_type: string;
        entity_type: string | null;
        is_active: boolean;
        condition_config: unknown;
        payload_schema: unknown;
        workflow_id: string | null;
    };
    placement: {
        id: string;
        org_id: string | null;
        surface: string;
        slot: string;
        entity_type: string | null;
        section_key: string | null;
        department_id: string | null;
        work_unit_id: string | null;
        order_index: number;
        display_style: string;
        is_active: boolean;
        condition_config: unknown;
    };
};

function Card({ href, title, children }: { href: string; title: string; children: React.ReactNode }) {
    return (
        <Link
            href={href}
            className="block rounded-xl border border-alloy-forge/12 bg-white/60 px-4 py-3 shadow-sm hover:bg-white/80"
        >
            <div className="text-sm font-semibold text-alloy-midnight">{title}</div>
            <div className="mt-1 text-xs text-alloy-midnight/60">{children}</div>
        </Link>
    );
}

function jsonPreview(v: unknown): string {
    try {
        if (v == null) return "";
        const s = JSON.stringify(v);
        if (s === "{}" || s === "[]" || s === "null") return "";
        return s.length > 140 ? `${s.slice(0, 140)}…` : s;
    } catch {
        return "";
    }
}

export default function AdminV2SettingsActionsPage() {
    const [items, setItems] = useState<InventoryItem[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const route = "/api/admin/actions/inventory";
            try {
                const res = await fetch(route, { credentials: "include" });
                const j = (await res.json().catch(() => ({}))) as { items?: InventoryItem[]; error?: string };
                if (cancelled) return;
                if (res.ok) {
                    setItems(j.items ?? []);
                    setError(null);
                } else {
                    setItems([]);
                    setError(j.error ?? "Failed to load action registry inventory");
                }
            } catch (e) {
                if (cancelled) return;
                setItems([]);
                setError(e instanceof Error ? e.message : "Failed to load action registry inventory");
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const rows = useMemo(() => {
        const all = items ?? [];
        return [...all].sort((a, b) => {
            const as = `${a.placement.surface}:${a.placement.slot}:${a.placement.entity_type ?? ""}:${a.definition.key}`;
            const bs = `${b.placement.surface}:${b.placement.slot}:${b.placement.entity_type ?? ""}:${b.definition.key}`;
            return as.localeCompare(bs);
        });
    }, [items]);

    return (
        <div className="w-full max-w-6xl space-y-4 pb-2">
            <header>
                <h1 className="text-xl font-semibold tracking-tight text-alloy-midnight">Actions</h1>
                <p className="mt-1 max-w-2xl text-xs leading-snug text-alloy-midnight/60">
                    Read-only inventory of real registry config (definitions + placements). Editors come next.
                </p>
            </header>

            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <Card href="/adminV2/workflows" title="Automations">
                    Review workflow runs and triggers (often the destination for action-driven workflows).
                </Card>
                <Card href="/adminV2/settings/work-units" title="Work units">
                    Many placements are scoped by work unit (right rail, queue row).
                </Card>
                <Card href="/adminV2/settings/layouts" title="Layouts">
                    Layout configuration (sections/fields) — editing experiences come next.
                </Card>
                <Card href="/adminV2/settings/statuses" title="Statuses">
                    Status keys/labels per entity (used by forms like “Update status”).
                </Card>
            </div>

            <section className="rounded-xl border border-alloy-stone/15 bg-white/60">
                <div className="flex items-center justify-between px-4 py-3">
                    <div>
                        <div className="text-sm font-semibold text-alloy-midnight">Configured buttons & placements</div>
                        <div className="mt-0.5 text-xs text-alloy-midnight/60">
                            Source: <code className="rounded bg-alloy-stone/10 px-1.5 py-0.5">action_definitions</code> +{" "}
                            <code className="rounded bg-alloy-stone/10 px-1.5 py-0.5">action_placements</code>
                        </div>
                    </div>
                    <div className="text-xs text-alloy-midnight/60">{rows.length} placements</div>
                </div>

                {error ? (
                    <div className="px-4 pb-3 text-xs text-red-700/80">{error}</div>
                ) : null}

                <div className="overflow-x-auto border-t border-alloy-stone/15">
                    <table className="min-w-[980px] w-full text-left text-xs">
                        <thead className="bg-white/40 text-alloy-midnight/60">
                            <tr>
                                <th className="px-4 py-2 font-semibold">key</th>
                                <th className="px-4 py-2 font-semibold">label</th>
                                <th className="px-4 py-2 font-semibold">action_type</th>
                                <th className="px-4 py-2 font-semibold">entity_type</th>
                                <th className="px-4 py-2 font-semibold">surface</th>
                                <th className="px-4 py-2 font-semibold">slot</th>
                                <th className="px-4 py-2 font-semibold">section_key</th>
                                <th className="px-4 py-2 font-semibold">department_id</th>
                                <th className="px-4 py-2 font-semibold">work_unit_id</th>
                                <th className="px-4 py-2 font-semibold">scope</th>
                                <th className="px-4 py-2 font-semibold">conditions</th>
                                <th className="px-4 py-2 font-semibold">kind</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-alloy-stone/10">
                            {rows.map((r) => {
                                const kind =
                                    r.definition.action_type === "ui_intent" ? "placeholder" : r.definition.action_type === "external_link" ? "link" : "functional";
                                const scopeBits = [
                                    r.placement.department_id ? "dept" : null,
                                    r.placement.work_unit_id ? "wu" : null,
                                ].filter(Boolean);
                                const scopeLabel =
                                    scopeBits.length ? `${scopeBits.join("+")}` : r.placement.org_id ? "org" : "global";
                                const cond = jsonPreview(r.placement.condition_config) || jsonPreview(r.definition.condition_config) || "";
                                return (
                                    <tr key={r.placement.id} className="hover:bg-white/40">
                                        <td className="px-4 py-2 font-mono text-[11px] text-alloy-midnight/80">{r.definition.key}</td>
                                        <td className="px-4 py-2 text-alloy-midnight/80">{r.definition.label}</td>
                                        <td className="px-4 py-2 font-mono text-[11px] text-alloy-midnight/70">{r.definition.action_type}</td>
                                        <td className="px-4 py-2 font-mono text-[11px] text-alloy-midnight/70">{r.placement.entity_type ?? r.definition.entity_type ?? ""}</td>
                                        <td className="px-4 py-2 font-mono text-[11px] text-alloy-midnight/70">{r.placement.surface}</td>
                                        <td className="px-4 py-2 font-mono text-[11px] text-alloy-midnight/70">{r.placement.slot}</td>
                                        <td className="px-4 py-2 font-mono text-[11px] text-alloy-midnight/50">{r.placement.section_key ?? ""}</td>
                                        <td className="px-4 py-2 font-mono text-[11px] text-alloy-midnight/50">
                                            {r.placement.department_id ?? ""}
                                        </td>
                                        <td className="px-4 py-2 font-mono text-[11px] text-alloy-midnight/50">
                                            {r.placement.work_unit_id ?? ""}
                                        </td>
                                        <td className="px-4 py-2 text-alloy-midnight/60">{scopeLabel}</td>
                                        <td className="px-4 py-2 font-mono text-[11px] text-alloy-midnight/50">{cond}</td>
                                        <td className="px-4 py-2">
                                            <span
                                                className={[
                                                    "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                                                    kind === "functional"
                                                        ? "bg-alloy-pine/10 text-alloy-pine"
                                                        : kind === "placeholder"
                                                          ? "bg-alloy-forge/10 text-alloy-forge"
                                                          : "bg-slate-500/10 text-slate-600",
                                                ].join(" ")}
                                            >
                                                {kind}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                            {items != null && rows.length === 0 ? (
                                <tr>
                                    <td className="px-4 py-3 text-alloy-midnight/60" colSpan={12}>
                                        No placements found for this org.
                                    </td>
                                </tr>
                            ) : null}
                            {items == null ? (
                                <tr>
                                    <td className="px-4 py-3 text-alloy-midnight/60" colSpan={12}>
                                        Loading…
                                    </td>
                                </tr>
                            ) : null}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}

