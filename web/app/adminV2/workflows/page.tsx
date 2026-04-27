"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { WorkspaceChrome } from "@/components/admin/workspace/WorkspaceChrome";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import { derived } from "@/styles/tokens/colors";

type WorkflowListRow = {
    id: string;
    name: string | null;
    description: string | null;
    event_type: string | null;
    entity_type: string | null;
    enabled: boolean | null;
    created_at?: string | null;
    updated_at?: string | null;
};

type WorkflowRunRow = {
    id: string;
    workflow_id: string;
    workflow_name: string | null;
    status: string;
    error: string | null;
    started_at: string;
    completed_at: string | null;
    event_type: string | null;
    entity_type: string | null;
    entity_id: string | null;
    has_failed_action?: boolean;
};

const WORKSPACE = "/adminV2/workspace";

export default function AdminV2WorkflowsPage() {
    const searchParams = useSearchParams();
    const highlightRunId = (searchParams?.get("run") ?? "").trim();

    const [workflows, setWorkflows] = useState<WorkflowListRow[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const [detail, setDetail] = useState<WorkflowListRow | null>(null);
    const [conditions, setConditions] = useState<unknown[] | null>(null);
    const [actions, setActions] = useState<unknown[] | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);

    const [runs, setRuns] = useState<WorkflowRunRow[] | null>(null);
    const [runsLoading, setRunsLoading] = useState(false);

    const init = useMemo(() => workspaceDataFetchInit(), []);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        fetch("/api/admin/workflows", init)
            .then((r) => r.json().then((j) => ({ r, j })))
            .then(({ r, j }) => {
                if (cancelled) return;
                if (!r.ok) {
                    setError(typeof j?.error === "string" ? j.error : "Failed to load workflows");
                    setWorkflows([]);
                    return;
                }
                const list = Array.isArray(j) ? (j as WorkflowListRow[]) : [];
                setWorkflows(list);
                setSelectedId((prev) => {
                    if (prev) return prev;
                    if (!list.length) return null;
                    return list.find((w) => (w.entity_type ?? "").toLowerCase() === "opportunity")?.id ?? list[0]?.id ?? null;
                });
            })
            .catch((e) => {
                if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load workflows");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [init]);

    useEffect(() => {
        if (!selectedId) {
            setDetail(null);
            setConditions(null);
            setActions(null);
            return;
        }
        let cancelled = false;
        setDetailLoading(true);
        Promise.all([
            fetch(`/api/admin/workflows/${encodeURIComponent(selectedId)}`, init),
            fetch(`/api/admin/workflows/${encodeURIComponent(selectedId)}/conditions`, init),
            fetch(`/api/admin/workflows/${encodeURIComponent(selectedId)}/actions`, init),
        ])
            .then(async ([dr, cr, ar]) => {
                const dj = await dr.json().catch(() => ({}));
                const cj = await cr.json().catch(() => ({}));
                const aj = await ar.json().catch(() => ({}));
                if (cancelled) return;
                if (!dr.ok) {
                    setDetail(null);
                    setConditions([]);
                    setActions([]);
                    return;
                }
                setDetail(dj as WorkflowListRow);
                setConditions(Array.isArray(cj) ? cj : cj?.error ? [] : []);
                setActions(Array.isArray(aj) ? aj : []);
            })
            .finally(() => {
                if (!cancelled) setDetailLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [init, selectedId]);

    useEffect(() => {
        if (!selectedId) {
            setRuns(null);
            return;
        }
        let cancelled = false;
        setRunsLoading(true);
        const q = new URLSearchParams({ workflow_id: selectedId, limit: "12" });
        fetch(`/api/admin/workflow-runs?${q}`, init)
            .then((r) => r.json())
            .then((j: { runs?: WorkflowRunRow[] }) => {
                if (!cancelled) setRuns(j.runs ?? []);
            })
            .catch(() => {
                if (!cancelled) setRuns([]);
            })
            .finally(() => {
                if (!cancelled) setRunsLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [init, selectedId]);

    const opportunityWorkflows = useMemo(
        () => (workflows ?? []).filter((w) => (w.entity_type ?? "").toLowerCase() === "opportunity"),
        [workflows]
    );

    const displayList = opportunityWorkflows.length ? opportunityWorkflows : workflows ?? [];

    const onToggleEnabled = useCallback(
        async (id: string, next: boolean) => {
            const res = await fetch(`/api/admin/workflows/${encodeURIComponent(id)}`, {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ enabled: next }),
            });
            if (!res.ok) return;
            const row = (await res.json().catch(() => null)) as WorkflowListRow | null;
            setWorkflows((prev) =>
                (prev ?? []).map((w) => (w.id === id ? { ...w, enabled: row?.enabled ?? next } : w))
            );
            if (selectedId === id && detail) {
                setDetail((d) => (d && d.id === id ? { ...d, enabled: row?.enabled ?? next } : d));
            }
        },
        [detail, selectedId]
    );

    return (
        <WorkspaceChrome
            variant="bridge"
            breadcrumbs={[
                { href: WORKSPACE, label: "Workspace" },
                { href: "/adminV2/settings", label: "Settings" },
                { label: "Workflows" },
            ]}
            title="Workflows"
            subtitle="Review and tune automation (Enrollment / opportunity–focused list)"
        >
            <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
                <aside
                    className="w-full shrink-0 rounded-xl border border-admin-border bg-white/80 p-3 shadow-sm lg:max-w-sm"
                    style={{ borderColor: derived.border }}
                >
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/50">Your org</div>
                    {loading ? <p className="mt-2 text-sm text-alloy-midnight/60">Loading…</p> : null}
                    {error ? <p className="mt-2 text-sm text-alloy-ember">{error}</p> : null}
                    {!loading && !displayList.length ? (
                        <p className="mt-2 text-sm text-alloy-midnight/55">No workflows yet.</p>
                    ) : null}
                    <ul className="mt-2 space-y-1">
                        {displayList.map((w) => {
                            const active = w.id === selectedId;
                            return (
                                <li key={w.id}>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedId(w.id)}
                                        className={`flex w-full flex-col rounded-lg border px-2.5 py-2 text-left text-sm transition-colors ${
                                            active
                                                ? "border-alloy-pine/50 bg-alloy-pine/10"
                                                : "border-transparent hover:bg-alloy-stone/10"
                                        }`}
                                    >
                                        <span className="font-semibold text-alloy-midnight">{w.name?.trim() || w.id.slice(0, 8)}</span>
                                        <span className="text-[11px] text-alloy-midnight/55">
                                            {(w.event_type ?? "—") + " · " + (w.entity_type ?? "—")}
                                        </span>
                                        <span className="mt-1 text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                                            {w.enabled === false ? "Disabled" : "Enabled"}
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </aside>

                <main className="min-w-0 flex-1 space-y-4">
                    {!selectedId ? (
                        <p className="text-sm text-alloy-midnight/60">Select a workflow to inspect.</p>
                    ) : detailLoading || !detail ? (
                        <p className="text-sm text-alloy-midnight/60">Loading workflow…</p>
                    ) : (
                        <>
                            <section
                                className="rounded-xl border border-admin-border bg-white/90 p-4 shadow-sm"
                                style={{ borderColor: derived.border }}
                            >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <h2 className="text-lg font-semibold text-alloy-midnight">{detail.name?.trim() || "Workflow"}</h2>
                                        <p className="mt-1 max-w-2xl text-sm text-alloy-midnight/70">{detail.description?.trim() || "—"}</p>
                                    </div>
                                    <label className="flex items-center gap-2 text-sm text-alloy-midnight/80">
                                        <input
                                            type="checkbox"
                                            checked={detail.enabled !== false}
                                            onChange={(e) => void onToggleEnabled(detail.id, e.target.checked)}
                                        />
                                        Enabled
                                    </label>
                                </div>
                                <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                                    <div>
                                        <dt className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/45">Event type</dt>
                                        <dd className="font-mono text-xs text-alloy-midnight/85">{detail.event_type ?? "—"}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/45">Entity type</dt>
                                        <dd className="font-mono text-xs text-alloy-midnight/85">{detail.entity_type ?? "—"}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/45">Steps</dt>
                                        <dd className="text-alloy-midnight/85">{actions?.length ?? 0}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/45">Conditions</dt>
                                        <dd className="text-alloy-midnight/85">{conditions?.length ?? 0}</dd>
                                    </div>
                                </dl>
                            </section>

                            <section
                                className="rounded-xl border border-admin-border bg-white/90 p-4 shadow-sm"
                                style={{ borderColor: derived.border }}
                            >
                                <h3 className="text-sm font-semibold text-alloy-midnight">Conditions</h3>
                                <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-alloy-stone/10 p-2 text-[11px] text-alloy-midnight/80">
                                    {JSON.stringify(conditions ?? [], null, 2)}
                                </pre>
                            </section>

                            <section
                                className="rounded-xl border border-admin-border bg-white/90 p-4 shadow-sm"
                                style={{ borderColor: derived.border }}
                            >
                                <h3 className="text-sm font-semibold text-alloy-midnight">Actions (ordered)</h3>
                                <pre className="mt-2 max-h-64 overflow-auto rounded-md bg-alloy-stone/10 p-2 text-[11px] text-alloy-midnight/80">
                                    {JSON.stringify(actions ?? [], null, 2)}
                                </pre>
                                <p className="mt-2 text-[11px] text-alloy-midnight/50">
                                    Step editing uses the classic admin API. This view is read-only review for AdminV2.
                                </p>
                                <Link
                                    href={`/admin/workflows/${encodeURIComponent(detail.id)}`}
                                    className="mt-2 inline-block text-xs font-semibold text-alloy-blue hover:underline"
                                >
                                    Open in legacy workflow editor →
                                </Link>
                            </section>

                            <section
                                className="rounded-xl border border-admin-border bg-white/90 p-4 shadow-sm"
                                style={{ borderColor: derived.border }}
                            >
                                <h3 className="text-sm font-semibold text-alloy-midnight">Recent runs</h3>
                                {runsLoading ? <p className="mt-2 text-sm text-alloy-midnight/60">Loading runs…</p> : null}
                                {!runsLoading && runs && runs.length === 0 ? (
                                    <p className="mt-2 text-sm text-alloy-midnight/55">No runs yet for this workflow.</p>
                                ) : null}
                                <ul className="mt-2 divide-y divide-alloy-stone/15">
                                    {(runs ?? []).map((r) => {
                                        const hi = highlightRunId && r.id === highlightRunId;
                                        return (
                                            <li
                                                key={r.id}
                                                className={`py-2 text-sm ${hi ? "rounded-md bg-alloy-honey/15 px-2 -mx-2" : ""}`}
                                            >
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <span className="font-mono text-xs text-alloy-midnight/80">{r.id}</span>
                                                    <span
                                                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                                                            r.status === "completed"
                                                                ? "bg-alloy-pine/15 text-alloy-midnight"
                                                                : r.status === "failed"
                                                                  ? "bg-alloy-ember/15 text-alloy-ember"
                                                                  : "bg-alloy-stone/15 text-alloy-midnight/70"
                                                        }`}
                                                    >
                                                        {r.status}
                                                    </span>
                                                </div>
                                                <div className="mt-0.5 text-[11px] text-alloy-midnight/55">
                                                    {r.started_at}
                                                    {r.entity_id ? ` · entity ${r.entity_id.slice(0, 8)}…` : ""}
                                                    {r.has_failed_action ? " · action failure" : ""}
                                                </div>
                                                {r.error ? <p className="mt-1 text-xs text-alloy-ember">{r.error}</p> : null}
                                            </li>
                                        );
                                    })}
                                </ul>
                            </section>
                        </>
                    )}
                </main>
            </div>
        </WorkspaceChrome>
    );
}
