"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { WorkspaceChrome } from "@/components/admin/workspace/WorkspaceChrome";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import { derived } from "@/styles/tokens/colors";
import { useAdminViewerTimezone } from "@/contexts/AdminViewerTimezoneContext";
import { formatTourDateTime } from "@/lib/enrollment/formatTourDateTime";

type WorkflowSummaryRow = {
    id: string;
    name: string | null;
    event_type: string | null;
    entity_type: string | null;
    enabled: boolean | null;
    steps_count: number;
    last_run: {
        id: string;
        status: string;
        started_at: string;
        completed_at: string | null;
        has_failed_action: boolean;
    } | null;
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

type WorkflowKpis = {
    runs_today: number;
    runs_last_7d: number;
    successful_last_7d: number;
    failed_last_7d: number;
    running_last_7d: number;
    skipped_last_7d: number;
    success_rate_last_7d: number | null;
};

type WorkflowRunDetail = {
    id: string;
    workflow_id: string;
    workflow_name: string | null;
    status: string;
    error: string | null;
    started_at: string;
    completed_at: string | null;
    event_payload: Record<string, unknown>;
    has_failed_action: boolean;
    event: {
        id: string;
        event_type: string | null;
        entity_type: string | null;
        entity_id: string | null;
        occurred_at: string | null;
        payload: Record<string, unknown>;
    } | null;
};

type WorkflowActionRunRow = {
    id: string;
    workflow_run_id: string;
    action_order: number;
    action_type: string;
    status: string;
    error: string | null;
    started_at: string;
    completed_at: string | null;
    inputs: Record<string, unknown>;
    outputs: Record<string, unknown>;
};

type WorkflowDetailRow = {
    id: string;
    name: string | null;
    enabled: boolean | null;
    entity_type: string | null;
    event_type: string | null;
};

type WorkflowActionDefRow = {
    id: string;
    workflow_id: string;
    action_order: number;
    action_type: string;
    target_entity: string | null;
    payload: Record<string, unknown>;
};

type WorkflowConditionRow = {
    id: string;
    workflow_id: string;
    target_entity: string | null;
    field_path: string | null;
    operator: string | null;
    value_jsonb: unknown;
    enabled: boolean | null;
};

const WORKSPACE = "/adminV2/workspace";

const DEFAULT_KPIS: WorkflowKpis = {
    runs_today: 0,
    runs_last_7d: 0,
    successful_last_7d: 0,
    failed_last_7d: 0,
    running_last_7d: 0,
    skipped_last_7d: 0,
    success_rate_last_7d: 0,
};

function fmtPct(v: number | null): string {
    if (v == null) return "—";
    return `${Math.round(v * 100)}%`;
}

function statusBadgeClass(status: string, hasFailedAction?: boolean): string {
    const s = (status ?? "").toLowerCase();
    if (s === "failed" || hasFailedAction) return "bg-alloy-ember/15 text-alloy-ember";
    if (s === "completed") return "bg-alloy-pine/15 text-alloy-midnight";
    if (s === "running") return "bg-alloy-honey/18 text-alloy-midnight";
    if (s === "skipped") return "bg-alloy-stone/15 text-alloy-midnight/70";
    return "bg-alloy-stone/15 text-alloy-midnight/70";
}

function summarizeWorkflowAction(a: WorkflowActionDefRow): { title: string; subtitle: string } {
    const ty = (a.action_type ?? "").toString();
    const target = (a.target_entity ?? "").toString();
    const payload = a.payload && typeof a.payload === "object" ? a.payload : {};
    const maybe = (k: string) => {
        const v = (payload as Record<string, unknown>)[k];
        if (v == null) return null;
        if (typeof v === "string" && v.trim()) return v.trim();
        if (typeof v === "number" || typeof v === "boolean") return String(v);
        return null;
    };
    const bits: string[] = [];
    const statusKey = maybe("status_key") ?? maybe("to_status_key");
    if (statusKey) bits.push(`status → ${statusKey}`);
    const template = maybe("template_key") ?? maybe("template");
    if (template) bits.push(`template: ${template}`);
    const channel = maybe("channel");
    if (channel) bits.push(`channel: ${channel}`);
    const url = maybe("url") ?? maybe("href");
    if (url) bits.push(`link`);
    const subtitle = bits.length ? bits.join(" · ") : "Configured step";
    const title = target ? `${ty} (${target})` : ty || "step";
    return { title, subtitle };
}

function summarizeCondition(c: WorkflowConditionRow): string {
    const ent = (c.target_entity ?? "").trim();
    const field = (c.field_path ?? "").trim() || "field";
    const op = (c.operator ?? "eq").trim();
    const v = c.value_jsonb;
    const val = v == null ? "null" : typeof v === "string" ? JSON.stringify(v) : Array.isArray(v) ? `[${v.length} items]` : typeof v === "object" ? "…" : String(v);
    return `${ent ? `${ent}.` : ""}${field} ${op} ${val}`;
}

export default function AdminV2WorkflowsPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const viewerTz = useAdminViewerTimezone();
    const highlightRunId = (searchParams?.get("run") ?? "").trim();
    const highlightWorkflowId = (searchParams?.get("workflow") ?? "").trim();

    const [kpis, setKpis] = useState<WorkflowKpis>(DEFAULT_KPIS);
    const [kpisLoading, setKpisLoading] = useState(false);
    const [kpisError, setKpisError] = useState<string | null>(null);

    const [workflows, setWorkflows] = useState<WorkflowSummaryRow[] | null>(null);
    const [workflowsLoading, setWorkflowsLoading] = useState(true);
    const [workflowsError, setWorkflowsError] = useState<string | null>(null);

    const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
    const [selectedWorkflowDetail, setSelectedWorkflowDetail] = useState<WorkflowDetailRow | null>(null);
    const [selectedWorkflowActions, setSelectedWorkflowActions] = useState<WorkflowActionDefRow[] | null>(null);
    const [selectedWorkflowConditions, setSelectedWorkflowConditions] = useState<WorkflowConditionRow[] | null>(null);
    const [selectedWorkflowDetailLoading, setSelectedWorkflowDetailLoading] = useState(false);
    const [selectedWorkflowDetailError, setSelectedWorkflowDetailError] = useState<string | null>(null);

    const [runs, setRuns] = useState<WorkflowRunRow[] | null>(null);
    const [runsLoading, setRunsLoading] = useState(false);
    const [runsError, setRunsError] = useState<string | null>(null);

    const [runDetail, setRunDetail] = useState<WorkflowRunDetail | null>(null);
    const [runActionRuns, setRunActionRuns] = useState<WorkflowActionRunRow[] | null>(null);
    const [runDetailLoading, setRunDetailLoading] = useState(false);
    const [runDetailError, setRunDetailError] = useState<string | null>(null);

    const init = useMemo(() => workspaceDataFetchInit(), []);

    useEffect(() => {
        let cancelled = false;
        setWorkflowsLoading(true);
        setWorkflowsError(null);
        fetch("/api/admin/workflows/summary", init)
            .then((r) => r.json().then((j) => ({ r, j })))
            .then(({ r, j }) => {
                if (cancelled) return;
                if (!r.ok) {
                    setWorkflowsError(typeof j?.error === "string" ? j.error : "Failed to load workflows");
                    setWorkflows([]);
                    return;
                }
                const list = Array.isArray(j?.workflows) ? (j.workflows as WorkflowSummaryRow[]) : [];
                setWorkflows(list);
                setSelectedWorkflowId((prev) => {
                    if (highlightWorkflowId && list.some((w) => w.id === highlightWorkflowId)) {
                        return highlightWorkflowId;
                    }
                    if (prev) return prev;
                    if (!list.length) return null;
                    return list.find((w) => (w.entity_type ?? "").toLowerCase() === "opportunity")?.id ?? list[0]?.id ?? null;
                });
            })
            .catch((e) => {
                if (!cancelled) setWorkflowsError(e instanceof Error ? e.message : "Failed to load workflows");
            })
            .finally(() => {
                if (!cancelled) setWorkflowsLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [init, highlightWorkflowId]);

    useEffect(() => {
        if (!highlightWorkflowId || !workflows?.length) return;
        if (workflows.some((w) => w.id === highlightWorkflowId)) {
            setSelectedWorkflowId(highlightWorkflowId);
        }
    }, [highlightWorkflowId, workflows]);

    useEffect(() => {
        let cancelled = false;
        setKpisLoading(true);
        setKpisError(null);
        fetch("/api/admin/workflow-runs?list=kpis", init)
            .then((r) => r.json().then((j) => ({ r, j })))
            .then(({ r, j }) => {
                if (cancelled) return;
                if (!r.ok) {
                    setKpisError(typeof j?.error === "string" ? j.error : "Failed to load KPIs");
                    setKpis(DEFAULT_KPIS);
                    return;
                }
                setKpis((j as { kpis?: WorkflowKpis }).kpis ?? DEFAULT_KPIS);
            })
            .catch((e) => {
                if (!cancelled) setKpisError(e instanceof Error ? e.message : "Failed to load KPIs");
                if (!cancelled) setKpis(DEFAULT_KPIS);
            })
            .finally(() => {
                if (!cancelled) setKpisLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [init]);

    useEffect(() => {
        if (!selectedWorkflowId) {
            setRuns(null);
            return;
        }
        let cancelled = false;
        setRunsLoading(true);
        setRunsError(null);
        const q = new URLSearchParams({ workflow_id: selectedWorkflowId, limit: "20" });
        fetch(`/api/admin/workflow-runs?${q}`, init)
            .then((r) => r.json())
            .then((j: { runs?: WorkflowRunRow[]; error?: string }) => {
                if (cancelled) return;
                if (j?.error) setRunsError(j.error);
                setRuns(j.runs ?? []);
            })
            .catch((e) => {
                if (!cancelled) setRunsError(e instanceof Error ? e.message : "Failed to load runs");
            })
            .finally(() => {
                if (!cancelled) setRunsLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [init, selectedWorkflowId]);

    useEffect(() => {
        if (!selectedWorkflowId) {
            setSelectedWorkflowDetail(null);
            setSelectedWorkflowActions(null);
            setSelectedWorkflowConditions(null);
            setSelectedWorkflowDetailError(null);
            setSelectedWorkflowDetailLoading(false);
            return;
        }
        let cancelled = false;
        setSelectedWorkflowDetailLoading(true);
        setSelectedWorkflowDetailError(null);
        Promise.all([
            fetch(`/api/admin/workflows/${encodeURIComponent(selectedWorkflowId)}`, init),
            fetch(`/api/admin/workflows/${encodeURIComponent(selectedWorkflowId)}/actions`, init),
            fetch(`/api/admin/workflows/${encodeURIComponent(selectedWorkflowId)}/conditions`, init),
        ])
            .then(async ([wfRes, aRes, cRes]) => {
                const wfJson = await wfRes.json().catch(() => ({}));
                const aJson = await aRes.json().catch(() => ([]));
                const cJson = await cRes.json().catch(() => ([]));
                if (cancelled) return;
                if (!wfRes.ok) throw new Error(typeof wfJson?.error === "string" ? wfJson.error : "Failed to load workflow");
                if (!aRes.ok) throw new Error(typeof (aJson as any)?.error === "string" ? (aJson as any).error : "Failed to load actions");
                if (!cRes.ok) throw new Error(typeof (cJson as any)?.error === "string" ? (cJson as any).error : "Failed to load conditions");
                setSelectedWorkflowDetail((wfJson as { workflow?: WorkflowDetailRow }).workflow ?? null);
                setSelectedWorkflowActions(Array.isArray(aJson) ? (aJson as WorkflowActionDefRow[]) : []);
                setSelectedWorkflowConditions(Array.isArray(cJson) ? (cJson as WorkflowConditionRow[]) : []);
            })
            .catch((e) => {
                if (!cancelled) setSelectedWorkflowDetailError(e instanceof Error ? e.message : "Failed to load workflow");
            })
            .finally(() => {
                if (!cancelled) setSelectedWorkflowDetailLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [init, selectedWorkflowId]);

    useEffect(() => {
        if (!highlightRunId) {
            setRunDetail(null);
            setRunActionRuns(null);
            return;
        }
        let cancelled = false;
        setRunDetailLoading(true);
        setRunDetailError(null);
        Promise.all([
            fetch(`/api/admin/workflow-runs/${encodeURIComponent(highlightRunId)}`, init),
            fetch(`/api/admin/workflow-runs/${encodeURIComponent(highlightRunId)}/action-runs`, init),
        ])
            .then(async ([rr, ar]) => {
                const rj = await rr.json().catch(() => ({}));
                const aj = await ar.json().catch(() => ({}));
                if (cancelled) return;
                if (!rr.ok) {
                    setRunDetail(null);
                    setRunActionRuns(null);
                    setRunDetailError(typeof rj?.error === "string" ? rj.error : "Failed to load run");
                    return;
                }
                const run = (rj as { run?: WorkflowRunDetail }).run ?? null;
                setRunDetail(run);
                setRunActionRuns((aj as { action_runs?: WorkflowActionRunRow[] }).action_runs ?? []);
                if (run?.workflow_id) {
                    setSelectedWorkflowId(run.workflow_id);
                }
            })
            .catch((e) => {
                if (!cancelled) setRunDetailError(e instanceof Error ? e.message : "Failed to load run");
            })
            .finally(() => {
                if (!cancelled) setRunDetailLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [highlightRunId, init]);

    const onToggleEnabled = useCallback(
        async (id: string, next: boolean) => {
            const res = await fetch(`/api/admin/workflows/${encodeURIComponent(id)}`, {
                method: "PATCH",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ enabled: next }),
            });
            if (!res.ok) return;
            const row = (await res.json().catch(() => null)) as { enabled?: boolean | null } | null;
            setWorkflows((prev) => (prev ?? []).map((w) => (w.id === id ? { ...w, enabled: row?.enabled ?? next } : w)));
        },
        []
    );

    const openRun = useCallback(
        (runId: string) => {
            const sp = new URLSearchParams(searchParams?.toString() ?? "");
            sp.set("run", runId);
            router.replace(`/adminV2/workflows?${sp.toString()}`);
        },
        [router, searchParams]
    );

    const closeRun = useCallback(() => {
        const sp = new URLSearchParams(searchParams?.toString() ?? "");
        sp.delete("run");
        router.replace(`/adminV2/workflows?${sp.toString()}`);
    }, [router, searchParams]);

    return (
        <WorkspaceChrome
            variant="bridge"
            breadcrumbs={[
                { href: WORKSPACE, label: "Workspace" },
                { href: "/adminV2/settings", label: "Settings" },
                { label: "Workflows" },
            ]}
            title="Workflows"
            subtitle="Understand what automations are running (no visual canvas yet)"
        >
            <div className="min-h-0 flex-1 space-y-4">
                <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
                    {[
                        { k: "Runs today", v: kpis.runs_today },
                        { k: "Runs (7d)", v: kpis.runs_last_7d },
                        { k: "Successful", v: kpis.successful_last_7d },
                        { k: "Failed", v: kpis.failed_last_7d },
                        { k: "Running", v: kpis.running_last_7d },
                        { k: "Skipped", v: kpis.skipped_last_7d },
                        { k: "Success rate", v: fmtPct(kpis.success_rate_last_7d) },
                    ].map((x) => (
                        <div
                            key={x.k}
                            className="rounded-xl border border-admin-border bg-white/90 px-3 py-2 shadow-sm"
                            style={{ borderColor: derived.border }}
                        >
                            <div className="text-[10px] font-semibold tracking-wide text-alloy-midnight/45">
                                {x.k}
                            </div>
                            <div className="mt-0.5 text-lg font-semibold text-alloy-midnight">
                                {kpisLoading ? "…" : kpisError ? String(x.v) : String(x.v)}
                            </div>
                        </div>
                    ))}
                </section>
                {kpisError ? <div className="text-sm text-alloy-ember">{kpisError}</div> : null}

                <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
                    <section
                        className="min-w-0 flex-1 rounded-xl border border-admin-border bg-white/90 p-3 shadow-sm"
                        style={{ borderColor: derived.border }}
                    >
                        <div className="flex items-center justify-between gap-2">
                            <h2 className="text-sm font-semibold text-alloy-midnight">Workflows</h2>
                            <span className="text-xs font-semibold text-alloy-midnight/55">Editor coming next</span>
                        </div>
                        {workflowsLoading ? <p className="mt-2 text-sm text-alloy-midnight/60">Loading…</p> : null}
                        {workflowsError ? <p className="mt-2 text-sm text-alloy-ember">{workflowsError}</p> : null}

                        <div className="mt-2 overflow-auto rounded-lg border border-alloy-stone/15">
                            <table className="w-full min-w-[860px] text-left text-sm">
                                <thead className="border-b border-alloy-stone/15 bg-alloy-stone/[0.04]">
                                    <tr className="text-[11px] font-semibold tracking-[0.12em] text-alloy-midnight/55">
                                        <th className="px-3 py-2">Workflow</th>
                                        <th className="px-3 py-2">Enabled</th>
                                        <th className="px-3 py-2">Entity</th>
                                        <th className="px-3 py-2">Trigger</th>
                                        <th className="px-3 py-2">Steps</th>
                                        <th className="px-3 py-2">Last run</th>
                                        <th className="px-3 py-2">Last status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(workflows ?? []).map((w) => {
                                        const active = w.id === selectedWorkflowId;
                                        const last = w.last_run;
                                        return (
                                            <tr
                                                key={w.id}
                                                className={`border-b border-alloy-stone/15 last:border-b-0 ${
                                                    active ? "bg-alloy-pine/5" : "hover:bg-alloy-stone/[0.04]"
                                                }`}
                                            >
                                                <td className="px-3 py-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setSelectedWorkflowId(w.id)}
                                                        className="text-left font-semibold text-alloy-midnight hover:underline"
                                                    >
                                                        {w.name?.trim() || w.id.slice(0, 8) + "…"}
                                                    </button>
                                                </td>
                                                <td className="px-3 py-2">
                                                    <label className="inline-flex items-center gap-2 text-sm text-alloy-midnight/80">
                                                        <input
                                                            type="checkbox"
                                                            checked={w.enabled !== false}
                                                            onChange={(e) => void onToggleEnabled(w.id, e.target.checked)}
                                                        />
                                                        <span className="text-xs">{w.enabled === false ? "Disabled" : "Enabled"}</span>
                                                    </label>
                                                </td>
                                                <td className="px-3 py-2 font-mono text-xs text-alloy-midnight/75">
                                                    {w.entity_type ?? "—"}
                                                </td>
                                                <td className="px-3 py-2 font-mono text-xs text-alloy-midnight/75">
                                                    {w.event_type ?? "—"}
                                                </td>
                                                <td className="px-3 py-2 tabular-nums text-alloy-midnight/70">{w.steps_count}</td>
                                                <td className="px-3 py-2 font-mono text-xs text-alloy-midnight/65">
                                                    {last?.started_at ?? "—"}
                                                </td>
                                                <td className="px-3 py-2">
                                                    {last ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => openRun(last.id)}
                                                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusBadgeClass(
                                                                last.status,
                                                                last.has_failed_action
                                                            )}`}
                                                            title="Open last run"
                                                        >
                                                            {last.status}
                                                            {last.has_failed_action ? " · action" : ""}
                                                        </button>
                                                    ) : (
                                                        <span className="text-xs text-alloy-midnight/45">—</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className="mt-3">
                            <div className="text-[11px] font-semibold tracking-wide text-alloy-midnight/45">
                                Selected workflow (what it does)
                            </div>
                            {selectedWorkflowDetailLoading ? (
                                <p className="mt-1 text-sm text-alloy-midnight/60">Loading workflow…</p>
                            ) : selectedWorkflowDetailError ? (
                                <p className="mt-1 text-sm text-alloy-ember">{selectedWorkflowDetailError}</p>
                            ) : selectedWorkflowDetail ? (
                                <div className="mt-1 rounded-xl border border-alloy-stone/15 bg-white p-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="truncate text-sm font-semibold text-alloy-midnight">
                                                {selectedWorkflowDetail.name ?? selectedWorkflowDetail.id}
                                            </div>
                                            <div className="mt-0.5 text-xs text-alloy-midnight/60">
                                                Trigger:{" "}
                                                <span className="font-mono">{selectedWorkflowDetail.event_type ?? "—"}</span>{" "}
                                                · Entity:{" "}
                                                <span className="font-mono">{selectedWorkflowDetail.entity_type ?? "—"}</span>
                                            </div>
                                        </div>
                                        <span
                                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                                selectedWorkflowDetail.enabled === false
                                                    ? "bg-alloy-stone/15 text-alloy-midnight/60"
                                                    : "bg-alloy-pine/15 text-alloy-midnight"
                                            }`}
                                        >
                                            {selectedWorkflowDetail.enabled === false ? "Disabled" : "Enabled"}
                                        </span>
                                    </div>

                                    <div className="mt-3 grid grid-cols-1 gap-3">
                                        <div>
                                            <div className="text-[11px] font-semibold tracking-wide text-alloy-midnight/45">
                                                Conditions
                                            </div>
                                            {(selectedWorkflowConditions ?? []).filter((c) => c.enabled !== false).length === 0 ? (
                                                <div className="mt-1 text-sm text-alloy-midnight/55">None.</div>
                                            ) : (
                                                <ul className="mt-1 space-y-1 text-sm text-alloy-midnight/80">
                                                    {(selectedWorkflowConditions ?? [])
                                                        .filter((c) => c.enabled !== false)
                                                        .slice(0, 6)
                                                        .map((c) => (
                                                            <li key={c.id} className="font-mono text-[11px]">
                                                                {summarizeCondition(c)}
                                                            </li>
                                                        ))}
                                                </ul>
                                            )}
                                        </div>
                                        <div>
                                            <div className="text-[11px] font-semibold tracking-wide text-alloy-midnight/45">
                                                Steps
                                            </div>
                                            {(selectedWorkflowActions ?? []).length === 0 ? (
                                                <div className="mt-1 text-sm text-alloy-midnight/55">No steps configured.</div>
                                            ) : (
                                                <div className="mt-1 space-y-2">
                                                    {(selectedWorkflowActions ?? []).slice(0, 8).map((a) => {
                                                        const s = summarizeWorkflowAction(a);
                                                        return (
                                                            <div key={a.id} className="rounded-lg border border-alloy-stone/15 bg-white px-3 py-2">
                                                                <div className="text-xs font-semibold text-alloy-midnight">
                                                                    Step {a.action_order}:{" "}
                                                                    <span className="font-mono text-[11px]">{s.title}</span>
                                                                </div>
                                                                <div className="mt-0.5 text-[12px] text-alloy-midnight/60">{s.subtitle}</div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <details className="mt-3">
                                        <summary className="cursor-pointer text-xs font-semibold text-alloy-midnight/70 hover:text-alloy-midnight">
                                            Advanced details (raw)
                                        </summary>
                                        <pre className="mt-2 max-h-[240px] overflow-auto rounded-lg border border-alloy-stone/15 bg-alloy-stone/5 p-2 text-[11px] text-alloy-midnight/80">
                                            {JSON.stringify(
                                                {
                                                    workflow: selectedWorkflowDetail,
                                                    conditions: selectedWorkflowConditions ?? [],
                                                    actions: selectedWorkflowActions ?? [],
                                                },
                                                null,
                                                2
                                            )}
                                        </pre>
                                    </details>
                                </div>
                            ) : (
                                <p className="mt-1 text-sm text-alloy-midnight/55">Select a workflow to inspect.</p>
                            )}

                            <div className="text-[11px] font-semibold tracking-wide text-alloy-midnight/45">
                                Recent runs (selected workflow)
                            </div>
                            {runsLoading ? <p className="mt-1 text-sm text-alloy-midnight/60">Loading…</p> : null}
                            {runsError ? <p className="mt-1 text-sm text-alloy-ember">{runsError}</p> : null}
                            {!runsLoading && (runs ?? []).length === 0 ? (
                                <p className="mt-1 text-sm text-alloy-midnight/55">No runs yet.</p>
                            ) : null}
                            <div className="mt-1 flex flex-col gap-1.5">
                                {(runs ?? []).slice(0, 8).map((r) => (
                                    <button
                                        key={r.id}
                                        type="button"
                                        onClick={() => openRun(r.id)}
                                        className="flex items-center justify-between gap-2 rounded-lg border border-alloy-stone/15 bg-white px-2.5 py-2 text-left hover:bg-alloy-stone/[0.04]"
                                    >
                                        <span className="min-w-0 truncate font-mono text-[11px] text-alloy-midnight/80">
                                            {r.id}
                                        </span>
                                        <span
                                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${statusBadgeClass(
                                                r.status,
                                                r.has_failed_action
                                            )}`}
                                        >
                                            {r.status}
                                            {r.has_failed_action ? " · action" : ""}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </section>

                    <aside
                        className="w-full shrink-0 rounded-xl border border-admin-border bg-white/90 p-3 shadow-sm lg:w-[420px]"
                        style={{ borderColor: derived.border }}
                    >
                        <div className="flex items-center justify-between gap-2">
                            <h2 className="text-sm font-semibold text-alloy-midnight">Run detail</h2>
                            {highlightRunId ? (
                                <button
                                    type="button"
                                    onClick={closeRun}
                                    className="text-xs font-semibold text-alloy-midnight/70 hover:text-alloy-midnight hover:underline"
                                >
                                    Close
                                </button>
                            ) : null}
                        </div>
                        {!highlightRunId ? (
                            <p className="mt-2 text-sm text-alloy-midnight/60">
                                Select a run to inspect (or open with <code className="text-xs">?run=&lt;id&gt;</code>).
                            </p>
                        ) : runDetailLoading ? (
                            <p className="mt-2 text-sm text-alloy-midnight/60">Loading run…</p>
                        ) : runDetailError ? (
                            <p className="mt-2 text-sm text-alloy-ember">{runDetailError}</p>
                        ) : !runDetail ? (
                            <p className="mt-2 text-sm text-alloy-midnight/60">Run not found.</p>
                        ) : (
                            <div className="mt-2 space-y-3">
                                <div className="rounded-lg border border-alloy-stone/15 bg-white px-3 py-2">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className="text-[11px] font-semibold tracking-wide text-alloy-midnight/45">
                                                Workflow
                                            </div>
                                            <div className="truncate text-sm font-semibold text-alloy-midnight">
                                                {runDetail.workflow_name ?? runDetail.workflow_id}
                                            </div>
                                        </div>
                                        <span
                                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusBadgeClass(
                                                runDetail.status,
                                                runDetail.has_failed_action
                                            )}`}
                                        >
                                            {runDetail.status}
                                            {runDetail.has_failed_action ? " · action" : ""}
                                        </span>
                                    </div>
                                    <div className="mt-2 grid grid-cols-1 gap-2 text-xs text-alloy-midnight/70">
                                        <div>
                                            <span className="font-semibold text-alloy-midnight/70">Started</span>{" "}
                                            <span className="font-mono">{runDetail.started_at}</span>
                                        </div>
                                        <div>
                                            <span className="font-semibold text-alloy-midnight/70">Completed</span>{" "}
                                            <span className="font-mono">{runDetail.completed_at ?? "—"}</span>
                                        </div>
                                        <div>
                                            <span className="font-semibold text-alloy-midnight/70">Entity</span>{" "}
                                            <span className="font-mono">
                                                {runDetail.event?.entity_type ?? "—"}{" "}
                                                {runDetail.event?.entity_id ? runDetail.event.entity_id : ""}
                                            </span>
                                        </div>
                                        <div>
                                            <span className="font-semibold text-alloy-midnight/70">Trigger</span>{" "}
                                            <span className="font-mono">{runDetail.event?.event_type ?? "—"}</span>
                                        </div>
                                    </div>
                                    {runDetail.error ? (
                                        <div className="mt-2 rounded-md border border-alloy-ember/30 bg-alloy-ember/5 px-2 py-1 text-xs text-alloy-ember">
                                            {runDetail.error}
                                        </div>
                                    ) : null}
                                    {(() => {
                                        const ep = runDetail.event_payload ?? {};
                                        const af =
                                            ep && typeof ep === "object" && (ep as any).action_form && typeof (ep as any).action_form === "object"
                                                ? ((ep as any).action_form as Record<string, unknown>)
                                                : null;
                                        if (!af) return null;
                                        const fmt = formatTourDateTime(af.tour_date, af.tour_time, { displayTimeZoneIana: viewerTz });
                                        if (!fmt.hasDate) return null;
                                        return (
                                            <div className="mt-2 rounded-md border border-alloy-stone/20 bg-alloy-stone/5 px-2 py-1 text-xs text-alloy-midnight/70">
                                                <span className="font-semibold text-alloy-midnight/70">Tour</span>{" "}
                                                <span className="font-mono">{fmt.display}</span>
                                            </div>
                                        );
                                    })()}
                                </div>

                                <div>
                                    <div className="text-[11px] font-semibold tracking-wide text-alloy-midnight/45">
                                        Action steps
                                    </div>
                                    {(runActionRuns ?? []).length === 0 ? (
                                        <p className="mt-1 text-sm text-alloy-midnight/55">No action runs recorded.</p>
                                    ) : (
                                        <div className="mt-1 space-y-2">
                                            {(runActionRuns ?? []).map((a) => (
                                                <div key={a.id} className="rounded-lg border border-alloy-stone/15 bg-white px-3 py-2">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="min-w-0">
                                                            <div className="text-xs font-semibold text-alloy-midnight">
                                                                Step {a.action_order + 1}:{" "}
                                                                <span className="font-mono text-[11px]">{a.action_type}</span>
                                                            </div>
                                                            <div className="mt-0.5 font-mono text-[11px] text-alloy-midnight/55">
                                                                {a.started_at}
                                                                {a.completed_at ? ` → ${a.completed_at}` : ""}
                                                            </div>
                                                        </div>
                                                        <span
                                                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${statusBadgeClass(
                                                                a.status
                                                            )}`}
                                                        >
                                                            {a.status}
                                                        </span>
                                                    </div>
                                                    {a.error ? (
                                                        <div className="mt-1 rounded-md border border-alloy-ember/30 bg-alloy-ember/5 px-2 py-1 text-xs text-alloy-ember">
                                                            {a.error}
                                                        </div>
                                                    ) : null}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </aside>
                </div>
            </div>
        </WorkspaceChrome>
    );
}
