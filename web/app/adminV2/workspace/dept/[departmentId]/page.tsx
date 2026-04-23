"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { WorkspaceChrome } from "@/components/admin/workspace/WorkspaceChrome";
import { useOperationsWorkspaceData } from "@/hooks/useOperationsWorkspaceData";
import { DepartmentWorkspaceBridgeShell } from "@/components/admin/workspace/DepartmentWorkspaceBridgeShell";
import KPIBlock from "@/app/adminV2/components/workspace/blocks/KPIBlock";
import {
    buildEnrollmentDepartmentActionLinks,
    buildEnrollmentDepartmentKpis,
    buildEnrollmentNeedsAttentionGroupsVm,
    buildEnrollmentNeedsAttentionPreviewVm,
    buildEnrollmentPipelineCardsVm,
} from "@/lib/workspace/viewModels/enrollmentDepartmentViewModel";
import { workspaceRouteParam } from "@/lib/workspace/workspaceRouteParam";

const WORKSPACE_BASE = "/adminV2/workspace";

export default function AdminV2WorkspaceDepartmentPage() {
    const params = useParams();
    const departmentId = workspaceRouteParam(params.departmentId);

    const { dept, title, runtime, error, loading } = useOperationsWorkspaceData(departmentId);

    const deptKey = (dept?.key ?? "").trim().toLowerCase();
    const isEnrollment = deptKey === "enrollment";
    const isEnrollmentRuntimeReady = runtime.opportunityQueues != null;

    const enrollmentKpis = useMemo(() => buildEnrollmentDepartmentKpis(runtime), [runtime]);

    const enrollmentPipelineCards = useMemo(
        () => (isEnrollment ? buildEnrollmentPipelineCardsVm(runtime, WORKSPACE_BASE, departmentId) : []),
        [runtime, isEnrollment, departmentId]
    );

    const needsAttentionGroups = useMemo(
        () => (isEnrollment ? buildEnrollmentNeedsAttentionGroupsVm(runtime, WORKSPACE_BASE, departmentId) : []),
        [runtime, isEnrollment, departmentId]
    );

    const needsAttentionPreview = useMemo(
        () => (isEnrollment ? buildEnrollmentNeedsAttentionPreviewVm(runtime, WORKSPACE_BASE, departmentId, 3) : []),
        [runtime, isEnrollment, departmentId]
    );

    const enrollmentActions = useMemo(() => (isEnrollment ? buildEnrollmentDepartmentActionLinks() : []), [isEnrollment]);

    if (loading && !dept) {
        return (
            <WorkspaceChrome
                variant="bridge"
                breadcrumbs={[
                    { href: WORKSPACE_BASE, label: "Workspace" },
                    { href: `${WORKSPACE_BASE}/dept/${departmentId}`, label: "…" },
                ]}
                title="Loading…"
                subtitle=""
            >
                <div className="relative">
                    <div
                        data-ws-surface="department"
                        className="adminv2-ws-root adminv2-ws-department adminv2-ws-dept-v2 opacity-[0.98]"
                        aria-busy="true"
                        aria-label="Loading department workspace"
                    >
                        <div className="adminv2-ws-dept-v2-contain">
                            <div className="adminv2-ws-dept-v2-page-split">
                                <div className="adminv2-ws-dept-v2-primary-column">
                                    <div className="adminv2-ws-dept-v2-control-deck">
                                        <div className="adminv2-ws-dept-v2-top-stack">
                                            <div className="adminv2-ws-dept-v2-brief">
                                                <div className="adminv2-ws-dept-v2-brief-focus-label">Today&apos;s focus</div>
                                                <div className="adminv2-ws-dept-v2-brief-head-row">
                                                    <h2 className="adminv2-ws-dept-v2-brief-headline adminv2-ws-dept-v2-brief-headline--placeholder">
                                                        Loading department
                                                    </h2>
                                                </div>
                                                <div className="mt-3 space-y-2 max-w-3xl" aria-hidden>
                                                    <div className="h-3 w-full skeleton-pulse rounded bg-alloy-stone/15" />
                                                    <div
                                                        className="h-3 w-2/3 skeleton-pulse rounded bg-alloy-stone/10"
                                                        style={{ animationDelay: "70ms" }}
                                                    />
                                                </div>
                                            </div>
                                            <div data-workspace-zone="kpi-banner">
                                                <div className="adminv2-ws-kpi-root-band" role="status" aria-label="Loading KPI banner">
                                                    <div className="adminv2-ws-kpi-strip adminv2-ws-kpi-strip--single-band" role="list" aria-hidden>
                                                        {Array.from({ length: 6 }).map((_, i) => (
                                                            <div
                                                                key={i}
                                                                className="adminv2-ws-kpi-cell adminv2-ws-kpi-cell--single-band adminv2-ws-kpi-cell--placeholder"
                                                            >
                                                                <span className="adminv2-ws-kpi-label"> </span>
                                                                <span className="adminv2-ws-kpi-value adminv2-ws-kpi-value--placeholder">—</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div
                                        className="adminv2-ws-dept-v2-operational-row adminv2-ws-dept-v2-operational-row--triple"
                                        aria-label="Operational lanes"
                                    >
                                        <div className="adminv2-ws-dept-v2-lane adminv2-ws-dept-v2-lane--throughput" data-ws-lane-kind="throughput">
                                            <div className="adminv2-ws-dept-v2-lane-chrome adminv2-ws-dept-v2-lane-chrome--throughput-deck">
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
                                                    </div>
                                                </section>
                                            </div>
                                        </div>

                                        <div className="adminv2-ws-dept-v2-lane adminv2-ws-dept-v2-lane--attention" data-ws-lane-kind="attention">
                                            <div className="adminv2-ws-dept-v2-lane-chrome adminv2-ws-dept-v2-board-secondary-slot">
                                                <section
                                                    className="adminv2-ws-dept-qsec adminv2-ws-dept-qsec--secondary adminv2-ws-dept-attention-panel"
                                                    aria-label="Needs Attention"
                                                >
                                                    <header className="adminv2-ws-attention-panel-header">
                                                        <div>
                                                            <div className="adminv2-ws-attention-panel-kicker">Needs attention</div>
                                                            <h3 className="adminv2-ws-attention-panel-title">Needs Attention</h3>
                                                            <div className="mt-2 space-y-2" aria-hidden>
                                                                <div className="h-3 w-48 skeleton-pulse rounded bg-alloy-stone/10" />
                                                                <div
                                                                    className="h-3 w-56 skeleton-pulse rounded bg-alloy-stone/10"
                                                                    style={{ animationDelay: "90ms" }}
                                                                />
                                                            </div>
                                                        </div>
                                                    </header>
                                                </section>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="adminv2-ws-dept-v2-command-column" data-adminv2-workspace-command-column>
                                    <aside
                                        className="adminv2-ws-dept-v2-rail adminv2-ws-dept-v2-rail--command-shell"
                                        data-adminv2-workspace-command-rail
                                        aria-label="Decisions and actions"
                                    >
                                        <section className="adminv2-ws-actions-rail adminv2-ws-actions-rail--dept-panel px-3 pb-3 pt-3">
                                            <div className="h-4 w-20 skeleton-pulse rounded bg-alloy-stone/15" aria-hidden />
                                            <div className="mt-3 space-y-2" aria-hidden>
                                                <div className="h-8 w-full skeleton-pulse rounded-md bg-alloy-stone/10" />
                                                <div
                                                    className="h-8 w-full skeleton-pulse rounded-md bg-alloy-stone/10"
                                                    style={{ animationDelay: "55ms" }}
                                                />
                                                <div
                                                    className="h-8 w-full skeleton-pulse rounded-md bg-alloy-stone/10"
                                                    style={{ animationDelay: "110ms" }}
                                                />
                                            </div>
                                        </section>
                                    </aside>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="ws-loading-overlay" aria-hidden>
                        <div className="ws-loading-indicator">
                            <span className="ws-loading-spinner" />
                            Loading department
                        </div>
                    </div>
                </div>
            </WorkspaceChrome>
        );
    }

    return (
        <WorkspaceChrome
            variant="bridge"
            breadcrumbs={[
                { href: WORKSPACE_BASE, label: "Workspace" },
                { href: `${WORKSPACE_BASE}/dept/${departmentId}`, label: loading ? "…" : title },
            ]}
            title={loading ? "Loading…" : title}
            subtitle=""
        >
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
                                ) : (
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
                                )}
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
                                        {!isEnrollmentRuntimeReady ? (
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
