"use client";

import { useEffect, useMemo, useState } from "react";
import type { WorkspaceConfigSnapshotBlock } from "@/lib/workspace/types";

type DeptRow = { id: string; name: string | null; key?: string | null; is_active?: boolean | null };
type WorkUnitRow = { id: string; name: string | null; key?: string | null; department_id: string; queue_definition?: unknown };
type StatusRow = {
    id: string;
    entity_type: string;
    status_key: string;
    status_label: string | null;
    sort_order: number | null;
    is_active: boolean | null;
    metadata?: unknown;
};

function safeJsonPreview(v: unknown, max = 140): string {
    try {
        const s = JSON.stringify(v ?? null);
        return s.length > max ? s.slice(0, max - 1) + "…" : s;
    } catch {
        return "—";
    }
}

function lifecycleStageFromStatusRow(s: StatusRow): string {
    const md = (s.metadata ?? null) as { lifecycle_stage?: unknown } | null;
    const raw = md && typeof md === "object" ? (md as { lifecycle_stage?: unknown }).lifecycle_stage : undefined;
    return typeof raw === "string" && raw.trim() ? raw.trim() : "—";
}

export function ConfigSnapshotBlock({ block }: { block: WorkspaceConfigSnapshotBlock }) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [departments, setDepartments] = useState<DeptRow[]>([]);
    const [workUnits, setWorkUnits] = useState<WorkUnitRow[]>([]);
    const [statuses, setStatuses] = useState<StatusRow[]>([]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                setLoading(true);
                setError(null);
                const [dRes, wRes, sRes] = await Promise.all([
                    fetch("/api/admin/departments"),
                    fetch("/api/admin/work-units"),
                    fetch("/api/admin/status-definitions?entity_type=opportunities"),
                ]);

                const dj = (await dRes.json().catch(() => ({}))) as { items?: DeptRow[]; error?: string };
                const wj = (await wRes.json().catch(() => ({}))) as { items?: WorkUnitRow[]; error?: string };
                const sj = (await sRes.json().catch(() => ({}))) as { items?: StatusRow[]; error?: string };

                if (!dRes.ok) throw new Error(dj.error ?? "Failed to load departments");
                if (!wRes.ok) throw new Error(wj.error ?? "Failed to load work units");
                if (!sRes.ok) throw new Error(sj.error ?? "Failed to load statuses");

                if (!cancelled) {
                    setDepartments(dj.items ?? []);
                    setWorkUnits(wj.items ?? []);
                    setStatuses(sj.items ?? []);
                }
            } catch (e) {
                if (!cancelled) setError(e instanceof Error ? e.message : String(e));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    const title = (block.title ?? "System configuration").trim() || "System configuration";
    const subtitle =
        (block.subtitle ??
            "Read-only snapshot of configured statuses, departments, work units, and queue definitions (pulled from the same APIs used by AdminV2).").trim() ||
        undefined;

    const workUnitsByDept = useMemo(() => {
        const m = new Map<string, WorkUnitRow[]>();
        for (const wu of workUnits) {
            const arr = m.get(wu.department_id) ?? [];
            arr.push(wu);
            m.set(wu.department_id, arr);
        }
        for (const [k, arr] of m) {
            arr.sort((a, b) => String(a.name ?? a.key ?? "").localeCompare(String(b.name ?? b.key ?? "")));
            m.set(k, arr);
        }
        return m;
    }, [workUnits]);

    const statusRows = useMemo(() => {
        const rows = statuses
            .filter((s) => (s.entity_type ?? "") === "opportunities")
            .slice()
            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        return rows;
    }, [statuses]);

    return (
        <section className="rounded-xl border border-admin-border bg-white p-4 shadow-sm" data-workspace-block="config_snapshot">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="text-sm font-semibold text-alloy-midnight">{title}</div>
                    {subtitle ? (
                        <p className="mt-1 text-xs" style={{ color: "var(--d-muted)" }}>
                            {subtitle}
                        </p>
                    ) : null}
                </div>
                <div className="text-xs tabular-nums" style={{ color: "var(--d-muted)" }} aria-label="Config snapshot status">
                    {loading ? "Loading…" : error ? "Error" : "Ready"}
                </div>
            </div>

            {error ? (
                <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{error}</div>
            ) : null}

            <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                    <div className="text-xs font-semibold tracking-wide text-alloy-midnight/70">Statuses (opportunities)</div>
                    <div className="mt-2 overflow-auto rounded-lg border border-admin-border">
                        <table className="w-full text-xs">
                            <thead className="bg-alloy-stone/15 text-alloy-midnight/70">
                                <tr>
                                    <th className="px-2 py-2 text-left font-semibold">Label</th>
                                    <th className="px-2 py-2 text-left font-semibold">Key</th>
                                    <th className="px-2 py-2 text-left font-semibold">Lifecycle</th>
                                </tr>
                            </thead>
                            <tbody>
                                {statusRows.map((s) => (
                                    <tr key={s.id} className="border-t border-admin-border">
                                        <td className="px-2 py-2">{(s.status_label ?? s.status_key).trim() || s.status_key}</td>
                                        <td className="px-2 py-2 font-mono text-[11px] text-alloy-midnight/70">{s.status_key}</td>
                                        <td className="px-2 py-2">{lifecycleStageFromStatusRow(s)}</td>
                                    </tr>
                                ))}
                                {statusRows.length === 0 ? (
                                    <tr>
                                        <td className="px-2 py-3 text-alloy-midnight/60" colSpan={3}>
                                            No opportunity statuses configured.
                                        </td>
                                    </tr>
                                ) : null}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div>
                    <div className="text-xs font-semibold tracking-wide text-alloy-midnight/70">Departments → Work units</div>
                    <div className="mt-2 space-y-3">
                        {departments
                            .slice()
                            .sort((a, b) => String(a.name ?? "").localeCompare(String(b.name ?? "")))
                            .map((d) => {
                                const deptName = (d.name ?? "").trim() || "Department";
                                const deptKey = (d.key ?? "").trim() || "—";
                                const wus = workUnitsByDept.get(d.id) ?? [];
                                return (
                                    <div key={d.id} className="rounded-lg border border-admin-border p-3">
                                        <div className="flex items-baseline justify-between gap-2">
                                            <div className="text-sm font-semibold text-alloy-midnight">{deptName}</div>
                                            <div className="text-[11px] font-mono text-alloy-midnight/60">{deptKey}</div>
                                        </div>
                                        <div className="mt-2 space-y-2">
                                            {wus.map((wu) => (
                                                <div key={wu.id} className="rounded-md border border-admin-border bg-white px-2 py-2">
                                                    <div className="flex items-baseline justify-between gap-2">
                                                        <div className="text-xs font-semibold text-alloy-midnight">
                                                            {(wu.name ?? "").trim() || wu.key || "Work unit"}
                                                        </div>
                                                        <div className="text-[11px] font-mono text-alloy-midnight/60">{(wu.key ?? "").trim() || "—"}</div>
                                                    </div>
                                                    <div className="mt-1 text-[11px]" style={{ color: "var(--d-muted)" }}>
                                                        Queue definition: {safeJsonPreview((wu as { queue_definition?: unknown }).queue_definition)}
                                                    </div>
                                                </div>
                                            ))}
                                            {wus.length === 0 ? (
                                                <div className="text-xs text-alloy-midnight/60">No work units configured.</div>
                                            ) : null}
                                        </div>
                                    </div>
                                );
                            })}
                        {departments.length === 0 ? (
                            <div className="rounded-md border border-admin-border bg-white px-3 py-3 text-xs text-alloy-midnight/60">
                                No departments configured.
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
        </section>
    );
}

