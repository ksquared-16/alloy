"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { WorkspaceChrome } from "@/components/admin/workspace/WorkspaceChrome";
import { useOperationsWorkspaceData } from "@/hooks/useOperationsWorkspaceData";
import { DepartmentWorkspaceBridgeShell } from "@/components/admin/workspace/DepartmentWorkspaceBridgeShell";
import KPIBlock from "@/app/adminV2/components/workspace/blocks/KPIBlock";
import {
    DepartmentRouteSkeletonBody,
    WsRouteLoadingRibbon,
} from "@/components/admin/workspace/workspaceRouteSkeletons";
import {
    buildEnrollmentDepartmentActionLinks,
    buildEnrollmentNeedsAttentionGroupsVm,
    buildEnrollmentNeedsAttentionPreviewVm,
    buildEnrollmentPipelineCardsVm,
} from "@/lib/workspace/viewModels/enrollmentDepartmentViewModel";
import { workspaceRouteParam } from "@/lib/workspace/workspaceRouteParam";

const WORKSPACE_BASE = "/adminV2/workspace";

function isQueueDefinitionV1(qd: unknown): qd is { version: 1 } {
    return typeof (qd as { version?: unknown } | null)?.version === "number" && (qd as { version: number }).version === 1;
}

type V1QueueSummary = {
    key: string;
    label: string;
    description?: string;
    entity_type: "job" | "schedule" | "opportunity";
    priority: "standard" | "attention" | "critical";
    display: "list" | "cards";
    count: number;
};

export default function AdminV2WorkspaceDepartmentPage() {
    const params = useParams();
    const departmentId = workspaceRouteParam(params.departmentId);
    const debugEnabled =
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).has("debug");

    const { dept, title, runtime, error, loading } = useOperationsWorkspaceData(departmentId);

    const deptKey = (dept?.key ?? "").trim().toLowerCase();
    const isEnrollment = deptKey === "enrollment";
    const isEnrollmentRuntimeReady = runtime.opportunityQueues != null;

    const [enrollmentV1Queues, setEnrollmentV1Queues] = useState<V1QueueSummary[] | null>(null);
    const [enrollmentV1QueuesError, setEnrollmentV1QueuesError] = useState<string | null>(null);
    const [enrollmentV1QueuesRoute, setEnrollmentV1QueuesRoute] = useState<string | null>(null);
    const [ctxDebug, setCtxDebug] = useState<{
        orgId: string;
        orgName: string | null;
        orgSlug: string | null;
    } | null>(null);

    const primaryEnrollmentWorkUnit = useMemo(() => {
        if (!isEnrollment) return null;
        const wus = runtime.workUnits ?? [];
        const v1 = wus.filter((w) => isQueueDefinitionV1(w.queue_definition));
        const preferred =
            v1.find((w) => String(w.key ?? "").trim().toLowerCase() === "enrollment_pipeline") ?? v1[0] ?? null;
        return preferred;
    }, [isEnrollment, runtime.workUnits]);

    const enrollmentActions = useMemo(
        () =>
            isEnrollment
                ? buildEnrollmentDepartmentActionLinks({
                      workspaceBasePath: WORKSPACE_BASE,
                      departmentId,
                      primaryWorkUnitId: primaryEnrollmentWorkUnit?.id ?? null,
                  })
                : [],
        [departmentId, isEnrollment, primaryEnrollmentWorkUnit?.id]
    );

    useEffect(() => {
        if (!debugEnabled) return;
        let cancelled = false;
        (async () => {
            const route = "/api/admin/debug/context";
            try {
                const res = await fetch(route, { credentials: "include" });
                const j = (await res.json().catch(() => ({}))) as {
                    orgId?: string;
                    orgName?: string | null;
                    orgSlug?: string | null;
                    error?: string;
                };
                if (!cancelled) {
                    if (res.ok && typeof j.orgId === "string" && j.orgId) {
                        setCtxDebug({ orgId: j.orgId, orgName: j.orgName ?? null, orgSlug: j.orgSlug ?? null });
                    } else {
                        setCtxDebug(null);
                    }
                }
                console.info("[adminV2][debug] ctx", {
                    route,
                    ok: res.ok,
                    status: res.status,
                    orgId: j.orgId ?? null,
                    orgName: j.orgName ?? null,
                    departmentId,
                    workUnitId: null,
                    error: j.error ?? null,
                });
            } catch (e) {
                console.warn("[adminV2][debug] ctx failed", { departmentId, error: e });
                if (!cancelled) setCtxDebug(null);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [debugEnabled, departmentId]);

    useEffect(() => {
        if (!isEnrollment) return;
        const wus = runtime.workUnits ?? [];
        const rows = wus.map((w) => ({
            id: w.id,
            key: String(w.key ?? ""),
            name: w.name ?? null,
            hasQueueDefV1: isQueueDefinitionV1(w.queue_definition),
        }));
        const primary = primaryEnrollmentWorkUnit
            ? { id: primaryEnrollmentWorkUnit.id, key: primaryEnrollmentWorkUnit.key, name: primaryEnrollmentWorkUnit.name }
            : null;
        console.info("[adminV2][dept] work units discovered", {
            departmentId,
            deptKey,
            workUnits: rows,
            primaryWorkUnit: primary,
            primaryRoute: primary ? `${WORKSPACE_BASE}/dept/${departmentId}/work-unit/${primary.id}` : null,
        });
    }, [departmentId, deptKey, isEnrollment, primaryEnrollmentWorkUnit, runtime.workUnits]);

    useEffect(() => {
        if (!isEnrollment) return;
        const workUnitId = primaryEnrollmentWorkUnit?.id ?? "";
        if (!workUnitId) {
            setEnrollmentV1Queues(null);
            setEnrollmentV1QueuesError(null);
            setEnrollmentV1QueuesRoute(null);
            return;
        }
        let cancelled = false;
        (async () => {
            const route = `/api/admin/work-units/${encodeURIComponent(workUnitId)}/queues?limit=50`;
            setEnrollmentV1QueuesRoute(route);
            setEnrollmentV1QueuesError(null);
            try {
                const res = await fetch(route, { credentials: "include" });
                const j = (await res.json().catch(() => ({}))) as { error?: string; queues?: V1QueueSummary[] };
                console.info("[adminV2][dept] enrollment v1 queues", {
                    route,
                    status: res.status,
                    ok: res.ok,
                    keys: Array.isArray(j.queues) ? (j.queues ?? []).map((q) => q.key) : [],
                    error: j.error ?? null,
                });
                if (!res.ok) {
                    if (!cancelled) {
                        setEnrollmentV1Queues(null);
                        setEnrollmentV1QueuesError(j.error ?? "Failed to load queues");
                    }
                    return;
                }
                if (!cancelled) {
                    setEnrollmentV1Queues((j.queues ?? []) as V1QueueSummary[]);
                    setEnrollmentV1QueuesError(null);
                }
            } catch (e) {
                const msg = e instanceof Error ? e.message : "Failed to load queues";
                console.warn("[adminV2][dept] enrollment v1 queues failed", { route, error: e });
                if (!cancelled) {
                    setEnrollmentV1Queues(null);
                    setEnrollmentV1QueuesError(msg);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [departmentId, isEnrollment, primaryEnrollmentWorkUnit?.id]);

    const enrollmentLifecycleQueues = useMemo(() => {
        if (!primaryEnrollmentWorkUnit || !enrollmentV1Queues) return null;
        // Exclude overlay queues from pipeline/KPIs.
        return enrollmentV1Queues.filter((q) => q.key !== "needs_attention");
    }, [enrollmentV1Queues, primaryEnrollmentWorkUnit]);

    const enrollmentNeedsAttentionQueue = useMemo(() => {
        if (!primaryEnrollmentWorkUnit || !enrollmentV1Queues) return null;
        return enrollmentV1Queues.find((q) => q.key === "needs_attention") ?? null;
    }, [enrollmentV1Queues, primaryEnrollmentWorkUnit]);

    const enrollmentPipelineTotal = useMemo(() => {
        if (!primaryEnrollmentWorkUnit || !enrollmentV1Queues) return null;
        // Prefer the configured "all" queue as the single-source-of-truth total (no double-counting).
        const all = enrollmentV1Queues.find((q) => q.key === "all");
        if (all) return all.count ?? 0;
        // Fallback: avoid summing buckets (would double-count); use max lifecycle bucket.
        const lifecycle = (enrollmentLifecycleQueues ?? []).filter((q) => q.key !== "needs_attention");
        return lifecycle.reduce((m, q) => Math.max(m, q.count ?? 0), 0);
    }, [enrollmentLifecycleQueues, enrollmentV1Queues, primaryEnrollmentWorkUnit]);

    const enrollmentKpis = useMemo(() => {
        if (!primaryEnrollmentWorkUnit || !enrollmentV1Queues) return [];
        const all = enrollmentV1Queues.find((q) => q.key === "all") ?? null;
        const lifecycle = (enrollmentLifecycleQueues ?? []).filter((q) => q.key !== "all");
        const rest = [all, ...lifecycle].filter(Boolean).slice(0, 5) as V1QueueSummary[];
        return [
            {
                id: "en_pipeline_total",
                label: "Pipeline families",
                value: String(enrollmentPipelineTotal ?? 0),
                lane: "business" as const,
            },
            ...rest.map((q) => ({
                id: `en_q_${q.key}`,
                label: q.label,
                value: String(q.count ?? 0),
                lane: "business" as const,
            })),
        ];
    }, [enrollmentLifecycleQueues, enrollmentPipelineTotal, enrollmentV1Queues, primaryEnrollmentWorkUnit]);

    const enrollmentPipelineCards = useMemo(
        () =>
            isEnrollment && !primaryEnrollmentWorkUnit
                ? buildEnrollmentPipelineCardsVm(runtime, WORKSPACE_BASE, departmentId)
                : [],
        [runtime, isEnrollment, departmentId]
    );

    useEffect(() => {
        if (!isEnrollment) return;
        console.info("[adminV2][dept] enrollment routes", {
            departmentId,
            primaryWorkUnitId: primaryEnrollmentWorkUnit?.id ?? null,
            actions: enrollmentActions.map((a) => ({ id: a.id, label: a.label, href: a.href })),
            legacyPipelineCardRoutes: enrollmentPipelineCards.map((c) => ({
                segmentKey: c.segmentKey,
                stageLabel: c.stageLabel,
                href: c.openQueueAction.href,
            })),
        });
    }, [departmentId, enrollmentActions, enrollmentPipelineCards, isEnrollment, primaryEnrollmentWorkUnit?.id]);

    const needsAttentionGroups = useMemo(
        () => (isEnrollment ? buildEnrollmentNeedsAttentionGroupsVm(runtime, WORKSPACE_BASE, departmentId) : []),
        [runtime, isEnrollment, departmentId]
    );

    const needsAttentionPreview = useMemo(
        () => (isEnrollment ? buildEnrollmentNeedsAttentionPreviewVm(runtime, WORKSPACE_BASE, departmentId, 3) : []),
        [runtime, isEnrollment, departmentId]
    );

    if (loading) {
        return (
            <WorkspaceChrome
                variant="bridge"
                breadcrumbs={[
                    { href: WORKSPACE_BASE, label: "Workspace" },
                    { label: "Loading…" },
                ]}
                title={title}
                subtitle=""
            >
                <WsRouteLoadingRibbon label="Loading department" />
                <DepartmentRouteSkeletonBody />
            </WorkspaceChrome>
        );
    }

    return (
        <WorkspaceChrome
            variant="bridge"
            breadcrumbs={[
                { href: WORKSPACE_BASE, label: "Workspace" },
                { href: `${WORKSPACE_BASE}/dept/${departmentId}`, label: title },
            ]}
            title={title}
            subtitle=""
        >
            {debugEnabled ? (
                <div className="mb-2 rounded-md border border-admin-border bg-admin-surface-card px-3 py-2 text-[11px] text-alloy-forge/70">
                    <div>
                        <span className="font-semibold text-alloy-forge/80">Debug</span>{" "}
                        <span>org:</span>{" "}
                        <span className="font-mono">{ctxDebug?.orgId ?? "—"}</span>{" "}
                        <span className="ml-2">name:</span>{" "}
                        <span>{ctxDebug?.orgName ?? "—"}</span>
                    </div>
                    <div className="mt-1">
                        <span>route dept:</span> <span className="font-mono">{departmentId}</span>
                    </div>
                </div>
            ) : null}
            {error && !loading && dept ? <p className="text-sm text-amber-800 px-1">{error}</p> : null}
            {!dept ? (
                <div
                    className="rounded-xl border px-4 py-10 text-center text-sm text-alloy-ember/90"
                    style={{ borderColor: "var(--d-border, rgba(39,63,82,0.14))" }}
                >
                    {error ??
                        "This department could not be loaded. Use the workspace link above to pick another department."}
                </div>
            ) : isEnrollment ? (
                <DepartmentWorkspaceBridgeShell
                    departmentKey={deptKey}
                    briefTitle={title}
                    briefSubtitle=""
                    signalsSlot={null}
                    kpiSlot={
                        enrollmentKpis.length ? (
                            <KPIBlock kpis={enrollmentKpis} surface="default" maxVisible={6} />
                        ) : null
                    }
                    throughputSlot={
                        <section
                            className="adminv2-ws-dept-qsec adminv2-ws-dept-qsec--primary adminv2-ws-dept-throughput-panel"
                            aria-label="Pipeline lanes"
                        >
                            <header className="adminv2-ws-queue-header">
                                <div className="adminv2-ws-queue-title-row">
                                    <h3 className="adminv2-ws-queue-title">Pipeline</h3>
                                </div>
                            </header>
                            <div className="adminv2-ws-wu-v2" data-ws-surface="work_unit">
                                {enrollmentV1QueuesError ? (
                                    <div className="mb-2 rounded-lg border border-admin-border bg-admin-surface-card px-3 py-2 text-xs text-alloy-ember">
                                        Failed to load configured queue labels: {enrollmentV1QueuesError}
                                        {enrollmentV1QueuesRoute ? (
                                            <div className="mt-1 text-[11px] opacity-80">Route: {enrollmentV1QueuesRoute}</div>
                                        ) : null}
                                    </div>
                                ) : null}
                                {!isEnrollmentRuntimeReady ? (
                                    <ul className="adminv2-ws-queue-list" role="list" aria-hidden>
                                        {Array.from({ length: 3 }).map((_, i) => (
                                            <li key={i} className="adminv2-ws-wu-queue-item-wrap" role="listitem">
                                                <div className="adminv2-ws-wu-queue-card adminv2-ws-wu-queue-card--compact adminv2-ws-wu-queue-card--tier-standard flex flex-col items-stretch">
                                                    <div className="adminv2-ws-wu-queue-card-compact-text">
                                                        <div className="h-3 w-40 skeleton-pulse rounded bg-alloy-stone/20" />
                                                        <div
                                                            className="mt-2 h-3 w-56 skeleton-pulse rounded bg-alloy-stone/12"
                                                            style={{ animationDelay: "70ms" }}
                                                        />
                                                        <div
                                                            className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] tabular-nums"
                                                            style={{ color: "var(--d-muted)" }}
                                                        >
                                                            <div>
                                                                <span className="font-medium text-alloy-midnight/75">Count</span>{" "}
                                                                <span className="inline-block h-3 w-10 align-middle skeleton-pulse rounded bg-alloy-stone/12" />
                                                            </div>
                                                            <div className="text-right">
                                                                <span className="font-medium text-alloy-midnight/75">Value</span>{" "}
                                                                <span
                                                                    className="inline-block h-3 w-14 align-middle skeleton-pulse rounded bg-alloy-stone/12"
                                                                    style={{ animationDelay: "120ms" }}
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="adminv2-ws-wu-queue-card-compact-aside">
                                                        <span className="adminv2-ws-wu-queue-action-chip adminv2-ws-wu-queue-action-chip--open">
                                                            <span className="inline-block h-3 w-16 align-middle skeleton-pulse rounded bg-alloy-stone/10" />
                                                        </span>
                                                    </div>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                ) : primaryEnrollmentWorkUnit && enrollmentLifecycleQueues ? (
                                    <ul className="adminv2-ws-queue-list" role="list">
                                        {enrollmentLifecycleQueues.map((q) => (
                                            <li key={q.key} className="adminv2-ws-wu-queue-item-wrap" role="listitem">
                                                <Link
                                                    href={`${WORKSPACE_BASE}/dept/${encodeURIComponent(departmentId)}/work-unit/${encodeURIComponent(
                                                        primaryEnrollmentWorkUnit.id
                                                    )}?queue=${encodeURIComponent(q.key)}`}
                                                    className="adminv2-ws-wu-queue-card adminv2-ws-wu-queue-card--compact adminv2-ws-wu-queue-card--tier-standard flex flex-col items-stretch no-underline text-inherit hover:opacity-[0.98]"
                                                    data-ws-wu-urgency="standard"
                                                    data-enrollment-queue-key={q.key}
                                                >
                                                    <div className="adminv2-ws-wu-queue-card-compact-text">
                                                        <div className="adminv2-ws-wu-queue-card-title adminv2-ws-wu-queue-card-title--compact">
                                                            {q.label}
                                                        </div>
                                                        {q.description ? (
                                                            <div className="adminv2-ws-wu-queue-card-sub adminv2-ws-wu-queue-card-sub--compact">
                                                                {q.description}
                                                            </div>
                                                        ) : null}
                                                        <div
                                                            className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] tabular-nums"
                                                            style={{ color: "var(--d-muted)" }}
                                                        >
                                                            <div>
                                                                <span className="font-medium text-alloy-midnight/75">Count</span>{" "}
                                                                <span className="text-alloy-midnight/85">{q.count ?? 0}</span>
                                                            </div>
                                                            <div className="text-right">
                                                                <span className="font-medium text-alloy-midnight/75">Value</span>{" "}
                                                                <span className="text-alloy-midnight/85">—</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="adminv2-ws-wu-queue-card-compact-aside">
                                                        <span className="adminv2-ws-wu-queue-action-chip adminv2-ws-wu-queue-action-chip--open">
                                                            Open queue
                                                        </span>
                                                    </div>
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                ) : enrollmentPipelineCards.length ? (
                                    <ul className="adminv2-ws-queue-list" role="list">
                                        {enrollmentPipelineCards.map((card) => (
                                            <li key={card.segmentKey} className="adminv2-ws-wu-queue-item-wrap" role="listitem">
                                                <Link
                                                    href={card.openQueueAction.href}
                                                    className="adminv2-ws-wu-queue-card adminv2-ws-wu-queue-card--compact adminv2-ws-wu-queue-card--tier-standard flex flex-col items-stretch no-underline text-inherit hover:opacity-[0.98]"
                                                    data-ws-wu-urgency="standard"
                                                    data-enrollment-funnel-segment={card.segmentKey}
                                                >
                                                    <div className="adminv2-ws-wu-queue-card-compact-text">
                                                        <div
                                                            className="adminv2-ws-wu-queue-card-title adminv2-ws-wu-queue-card-title--compact"
                                                            data-enrollment-funnel-slot="stageLabel"
                                                        >
                                                            {card.stageLabel}
                                                        </div>
                                                        <div
                                                            className="adminv2-ws-wu-queue-card-sub adminv2-ws-wu-queue-card-sub--compact"
                                                            data-enrollment-funnel-slot="supportingCopy"
                                                        >
                                                            {card.supportingCopy}
                                                        </div>
                                                        <div
                                                            className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] tabular-nums"
                                                            style={{ color: "var(--d-muted)" }}
                                                        >
                                                            <div data-enrollment-funnel-slot="count">
                                                                <span className="font-medium text-alloy-midnight/75">Count</span>{" "}
                                                                <span className="text-alloy-midnight/85">{card.countDisplay}</span>
                                                            </div>
                                                            <div className="text-right" data-enrollment-funnel-slot="value">
                                                                <span className="font-medium text-alloy-midnight/75">Value</span>{" "}
                                                                <span className="text-alloy-midnight/85">{card.valueDisplay}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="adminv2-ws-wu-queue-card-compact-aside">
                                                        <span
                                                            className="adminv2-ws-wu-queue-action-chip adminv2-ws-wu-queue-action-chip--open"
                                                            data-enrollment-funnel-slot="openQueue"
                                                        >
                                                            {card.openQueueAction.label}
                                                        </span>
                                                    </div>
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                ) : null}
                            </div>
                        </section>
                    }
                    attentionSlot={
                        <section
                            className="adminv2-ws-dept-qsec adminv2-ws-dept-qsec--secondary adminv2-ws-dept-attention-panel"
                            aria-label="Needs Attention"
                        >
                            <header className="adminv2-ws-attention-panel-header">
                                <div>
                                    <div className="adminv2-ws-attention-panel-kicker">Needs attention</div>
                                    <h3 className="adminv2-ws-attention-panel-title">Needs Attention</h3>
                                    <p className="adminv2-ws-attention-card-sub" style={{ marginTop: 6 }}>
                                        Exceptions grouped by reason (from queue runtime).
                                    </p>
                                </div>
                            </header>
                            <div className="adminv2-ws-attention-stack">
                                <div className="adminv2-ws-attention-card adminv2-ws-attention-card--queue-aligned">
                                    <div className="adminv2-ws-wu-v2" data-ws-surface="work_unit">
                                        {primaryEnrollmentWorkUnit && enrollmentNeedsAttentionQueue ? (
                                            <ul className="adminv2-ws-queue-list" role="list">
                                                <li className="adminv2-ws-wu-queue-item-wrap" role="listitem">
                                                    <Link
                                                        href={`${WORKSPACE_BASE}/dept/${encodeURIComponent(
                                                            departmentId
                                                        )}/work-unit/${encodeURIComponent(primaryEnrollmentWorkUnit.id)}?queue=needs_attention`}
                                                        className="adminv2-ws-wu-queue-card adminv2-ws-wu-queue-card--compact adminv2-ws-wu-queue-card--attention adminv2-ws-wu-queue-card--tier-warning no-underline text-inherit hover:opacity-[0.98]"
                                                        data-ws-wu-urgency="warning"
                                                    >
                                                        <div className="adminv2-ws-wu-queue-card-compact-text">
                                                            <div className="adminv2-ws-wu-queue-card-title adminv2-ws-wu-queue-card-title--compact">
                                                                {enrollmentNeedsAttentionQueue.label}
                                                            </div>
                                                            {enrollmentNeedsAttentionQueue.description ? (
                                                                <div className="adminv2-ws-wu-queue-card-sub adminv2-ws-wu-queue-card-sub--compact">
                                                                    {enrollmentNeedsAttentionQueue.description}
                                                                </div>
                                                            ) : null}
                                                        </div>
                                                        <div className="adminv2-ws-wu-queue-card-compact-aside">
                                                            <span
                                                                className="adminv2-ws-wu-queue-count-badge adminv2-ws-wu-queue-count-badge--attention"
                                                                aria-label={`${enrollmentNeedsAttentionQueue.count} items`}
                                                            >
                                                                {enrollmentNeedsAttentionQueue.count}
                                                            </span>
                                                            <span className="adminv2-ws-wu-queue-action-chip adminv2-ws-wu-queue-action-chip--open adminv2-ws-wu-queue-action-chip--attention-open">
                                                                Open queue
                                                            </span>
                                                        </div>
                                                    </Link>
                                                </li>
                                            </ul>
                                        ) : !isEnrollmentRuntimeReady ? (
                                            <ul className="adminv2-ws-queue-list" role="list" aria-hidden>
                                                {Array.from({ length: 2 }).map((_, i) => (
                                                    <li key={i} className="adminv2-ws-wu-queue-item-wrap" role="listitem">
                                                        <div className="adminv2-ws-wu-queue-card adminv2-ws-wu-queue-card--compact adminv2-ws-wu-queue-card--attention adminv2-ws-wu-queue-card--tier-warning flex flex-col items-stretch">
                                                            <div className="adminv2-ws-wu-queue-card-compact-text">
                                                                <div className="h-3 w-44 skeleton-pulse rounded bg-alloy-stone/20" />
                                                                <div
                                                                    className="mt-2 h-3 w-60 skeleton-pulse rounded bg-alloy-stone/12"
                                                                    style={{ animationDelay: "70ms" }}
                                                                />
                                                            </div>
                                                            <div className="adminv2-ws-wu-queue-card-compact-aside">
                                                                <span className="adminv2-ws-wu-queue-action-chip adminv2-ws-wu-queue-action-chip--open adminv2-ws-wu-queue-action-chip--attention-open">
                                                                    <span className="inline-block h-3 w-16 align-middle skeleton-pulse rounded bg-alloy-stone/10" />
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </li>
                                                ))}
                                            </ul>
                                        ) : needsAttentionPreview.length ? (
                                            <div className="adminv2-ws-attention-preview-block">
                                                <div className="adminv2-ws-wu-queue-section-label adminv2-ws-attention-preview-kicker" role="presentation">
                                                    Next in queue
                                                </div>
                                                <ul className="adminv2-ws-queue-list" role="list">
                                                    {needsAttentionPreview.map((p) => (
                                                        <li key={p.id} className="adminv2-ws-wu-queue-item-wrap" role="listitem">
                                                            <Link
                                                                href={p.openQueueHref}
                                                                className="adminv2-ws-wu-queue-card adminv2-ws-wu-queue-card--compact adminv2-ws-wu-queue-card--attention adminv2-ws-wu-queue-card--tier-warning no-underline text-inherit hover:opacity-[0.98]"
                                                                data-ws-wu-urgency="warning"
                                                            >
                                                                <div className="adminv2-ws-wu-queue-card-compact-text">
                                                                    <div className="adminv2-ws-wu-queue-card-title adminv2-ws-wu-queue-card-title--compact">
                                                                        {p.headline}
                                                                    </div>
                                                                    <div className="adminv2-ws-wu-queue-card-sub adminv2-ws-wu-queue-card-sub--compact">
                                                                        {p.detail}
                                                                    </div>
                                                                </div>
                                                                <div className="adminv2-ws-wu-queue-card-compact-aside">
                                                                    <span className="adminv2-ws-wu-queue-action-chip adminv2-ws-wu-queue-action-chip--open adminv2-ws-wu-queue-action-chip--attention-open">
                                                                        Open queue
                                                                    </span>
                                                                </div>
                                                            </Link>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        ) : null}
                                        {needsAttentionGroups.length ? (
                                            <div className={needsAttentionPreview.length ? "mt-2 pt-2 adminv2-ws-attention-groups-divider" : ""}>
                                                <div
                                                    className="adminv2-ws-wu-queue-section-label adminv2-ws-attention-preview-kicker"
                                                    role="presentation"
                                                >
                                                    By reason
                                                </div>
                                                <ul className="adminv2-ws-queue-list" role="list">
                                                    {needsAttentionGroups.map((g) => (
                                                        <li key={g.label} className="adminv2-ws-wu-queue-item-wrap" role="listitem">
                                                            <Link
                                                                href={g.openQueueHref}
                                                                className="adminv2-ws-wu-queue-card adminv2-ws-wu-queue-card--compact adminv2-ws-wu-queue-card--attention adminv2-ws-wu-queue-card--tier-warning no-underline text-inherit hover:opacity-[0.98]"
                                                                data-ws-wu-urgency="warning"
                                                            >
                                                                <div className="adminv2-ws-wu-queue-card-compact-text">
                                                                    <div className="adminv2-ws-wu-queue-card-title adminv2-ws-wu-queue-card-title--compact">
                                                                        {g.label}
                                                                    </div>
                                                                    <div className="adminv2-ws-wu-queue-card-sub adminv2-ws-wu-queue-card-sub--compact">
                                                                        {g.count} {g.count === 1 ? "record" : "records"} in this bucket
                                                                    </div>
                                                                </div>
                                                                <div className="adminv2-ws-wu-queue-card-compact-aside">
                                                                    <span
                                                                        className="adminv2-ws-wu-queue-count-badge adminv2-ws-wu-queue-count-badge--attention"
                                                                        aria-label={`${g.count} items`}
                                                                    >
                                                                        {g.count}
                                                                    </span>
                                                                    <span className="adminv2-ws-wu-queue-action-chip adminv2-ws-wu-queue-action-chip--open adminv2-ws-wu-queue-action-chip--attention-open">
                                                                        Open queue
                                                                    </span>
                                                                </div>
                                                            </Link>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        ) : needsAttentionPreview.length ? null : (
                                            <p className="adminv2-ws-attention-empty-copy">Nothing needs intervention right now.</p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </section>
                    }
                    contextSlot={null}
                    railSlot={
                        <section className="adminv2-ws-actions-rail adminv2-ws-actions-rail--dept-panel px-3 pb-3 pt-3">
                            <h3 className="adminv2-ws-actions-rail-title">Actions</h3>
                            <div className="mt-2 flex flex-col gap-2">
                                {enrollmentActions.map((a) => (
                                    <Link
                                        key={a.id}
                                        href={a.href}
                                        className={a.variant === "primary" ? "adminv2-ws-action-primary" : "adminv2-ws-action-row"}
                                    >
                                        {a.label}
                                    </Link>
                                ))}
                            </div>
                        </section>
                    }
                />
            ) : (
                <div
                    className="rounded-xl border px-4 py-10 text-center text-sm text-alloy-midnight/55"
                    style={{ borderColor: "var(--d-border, rgba(39,63,82,0.14))" }}
                >
                    Department contract UI is implemented for Enrollment only.
                </div>
            )}
        </WorkspaceChrome>
    );
}
