"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type RuleRow = {
    id: string;
    entity_type: string;
    department_id: string | null;
    work_unit_id: string | null;
    action_key: string | null;
    from_status_key: string | null;
    to_status_key: string;
    required_metadata_fields: unknown;
    required_payload_fields: unknown;
    blocked: boolean;
    is_active: boolean;
    message: string | null;
};

function jsonPreview(v: unknown): string {
    try {
        if (v == null) return "[]";
        const s = JSON.stringify(v);
        if (!s) return "[]";
        return s.length > 140 ? `${s.slice(0, 140)}…` : s;
    } catch {
        return "[]";
    }
}

export default function AdminV2SettingsStatusTransitionRulesPage() {
    const [items, setItems] = useState<RuleRow[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const route = "/api/admin/status-transition-rules";
            try {
                const res = await fetch(route, { credentials: "include" });
                const j = (await res.json().catch(() => ({}))) as { items?: RuleRow[]; error?: string };
                if (cancelled) return;
                if (res.ok) {
                    setItems(j.items ?? []);
                    setError(null);
                } else {
                    setItems([]);
                    setError(j.error ?? "Failed to load status transition rules");
                }
            } catch (e) {
                if (cancelled) return;
                setItems([]);
                setError(e instanceof Error ? e.message : "Failed to load status transition rules");
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const rows = useMemo(() => {
        const all = items ?? [];
        return [...all].sort((a, b) => {
            const as = `${a.entity_type}:${a.to_status_key}:${a.from_status_key ?? ""}:${a.action_key ?? ""}:${a.department_id ?? ""}:${a.work_unit_id ?? ""}`;
            const bs = `${b.entity_type}:${b.to_status_key}:${b.from_status_key ?? ""}:${b.action_key ?? ""}:${b.department_id ?? ""}:${b.work_unit_id ?? ""}`;
            return as.localeCompare(bs);
        });
    }, [items]);

    return (
        <div className="w-full min-w-0 space-y-4 pb-2">
            <header>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-alloy-midnight/40">Workflows · Diagnostics</p>
                <h1 className="text-xl font-semibold tracking-tight text-alloy-midnight">Workflow automation rules</h1>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-alloy-midnight/60">
                    These are <strong>workflow automation rules</strong> that may update status when business conditions are met — not
                    a separate status-rules product. Example: when a tour date is set → update status to Tour Scheduled. Status{" "}
                    <strong>display names</strong> are edited on{" "}
                    <Link href="/admin/settings/statuses" className="font-medium text-alloy-pine hover:underline">
                        Statuses
                    </Link>
                    ; triggers and side effects are owned by{" "}
                    <Link href="/admin/workflows" className="font-medium text-alloy-pine hover:underline">
                        Automations
                    </Link>
                    . This table is read-only reference.
                </p>
                <p className="mt-2 text-xs text-alloy-midnight/45">
                    <Link href="/admin/settings" className="font-medium text-alloy-pine hover:underline">
                        ← Back to Settings
                    </Link>
                </p>
            </header>

            <section className="rounded-xl border border-alloy-stone/15 bg-white/60">
                <div className="flex items-center justify-between px-4 py-3">
                    <div>
                        <div className="text-sm font-semibold text-alloy-midnight">Configured rules</div>
                        <div className="mt-0.5 text-xs text-alloy-midnight/60">Read-only reference for this organization.</div>
                    </div>
                    <div className="text-xs text-alloy-midnight/60">{rows.length} rules</div>
                </div>

                {error ? <div className="px-4 pb-3 text-xs text-red-700/80">{error}</div> : null}

                <div className="overflow-x-auto border-t border-alloy-stone/15">
                    <table className="min-w-[1100px] w-full text-left text-xs">
                        <thead className="bg-white/40 text-alloy-midnight/60">
                            <tr>
                                <th className="px-4 py-2 font-semibold">entity_type</th>
                                <th className="px-4 py-2 font-semibold">from</th>
                                <th className="px-4 py-2 font-semibold">to</th>
                                <th className="px-4 py-2 font-semibold">department_id</th>
                                <th className="px-4 py-2 font-semibold">work_unit_id</th>
                                <th className="px-4 py-2 font-semibold">action_key</th>
                                <th className="px-4 py-2 font-semibold">required_metadata_fields</th>
                                <th className="px-4 py-2 font-semibold">required_payload_fields</th>
                                <th className="px-4 py-2 font-semibold">blocked</th>
                                <th className="px-4 py-2 font-semibold">is_active</th>
                                <th className="px-4 py-2 font-semibold">message</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-alloy-stone/10">
                            {rows.map((r) => (
                                <tr key={r.id} className="hover:bg-white/40">
                                    <td className="px-4 py-2 font-mono text-[11px] text-alloy-midnight/70">
                                        {r.entity_type}
                                    </td>
                                    <td className="px-4 py-2 font-mono text-[11px] text-alloy-midnight/70">
                                        {r.from_status_key ?? ""}
                                    </td>
                                    <td className="px-4 py-2 font-mono text-[11px] text-alloy-midnight/80">
                                        {r.to_status_key}
                                    </td>
                                    <td className="px-4 py-2 font-mono text-[11px] text-alloy-midnight/50">
                                        {r.department_id ?? ""}
                                    </td>
                                    <td className="px-4 py-2 font-mono text-[11px] text-alloy-midnight/50">
                                        {r.work_unit_id ?? ""}
                                    </td>
                                    <td className="px-4 py-2 font-mono text-[11px] text-alloy-midnight/70">
                                        {r.action_key ?? ""}
                                    </td>
                                    <td className="px-4 py-2 font-mono text-[11px] text-alloy-midnight/50">
                                        {jsonPreview(r.required_metadata_fields)}
                                    </td>
                                    <td className="px-4 py-2 font-mono text-[11px] text-alloy-midnight/50">
                                        {jsonPreview(r.required_payload_fields)}
                                    </td>
                                    <td className="px-4 py-2">
                                        <span
                                            className={[
                                                "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                                                r.blocked ? "bg-alloy-ember/10 text-alloy-ember" : "bg-alloy-pine/10 text-alloy-pine",
                                            ].join(" ")}
                                        >
                                            {r.blocked ? "blocked" : "allowed"}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2">
                                        <span
                                            className={[
                                                "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                                                r.is_active ? "bg-alloy-blue/10 text-alloy-blue" : "bg-alloy-forge/10 text-alloy-forge/70",
                                            ].join(" ")}
                                        >
                                            {r.is_active ? "active" : "inactive"}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2 text-alloy-midnight/70">{r.message ?? ""}</td>
                                </tr>
                            ))}
                            {items != null && rows.length === 0 ? (
                                <tr>
                                    <td className="px-4 py-3 text-alloy-midnight/60" colSpan={11}>
                                        No rules found for this org.
                                    </td>
                                </tr>
                            ) : null}
                            {items == null ? (
                                <tr>
                                    <td className="px-4 py-3 text-alloy-midnight/60" colSpan={11}>
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

