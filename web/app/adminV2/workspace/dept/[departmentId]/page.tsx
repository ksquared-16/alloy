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

const WORKSPACE_BASE = "/adminV2/workspace";

export default function AdminV2WorkspaceDepartmentPage() {
    const params = useParams();
    const departmentId = typeof params.departmentId === "string" ? params.departmentId : "";

    const { dept, title, runtime, error, loading } = useOperationsWorkspaceData(departmentId);

    const deptKey = (dept?.key ?? "").trim().toLowerCase();
    const isEnrollment = deptKey === "enrollment";

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
            {error && <p className="text-sm text-amber-800 px-1">{error}</p>}
            {loading || !dept ? (
                <div
                    className="rounded-xl border px-4 py-10 text-center text-sm text-alloy-midnight/55"
                    style={{ borderColor: "var(--d-border, rgba(39,63,82,0.14))" }}
                >
                    Loading department workspace…
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
                                <div className="adminv2-ws-attention-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                    {needsAttentionPreview.length ? (
                                        <div className="mb-2">
                                            <div className="text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/55 mb-1.5">
                                                Next up
                                            </div>
                                            <ul className="space-y-1.5 pl-0 list-none" role="list">
                                                {needsAttentionPreview.map((p) => (
                                                    <li key={p.id}>
                                                        <Link
                                                            href={p.openQueueHref}
                                                            className="block rounded-md border border-[var(--d-border,rgba(39,63,82,0.12))] bg-[var(--d-surface,#fff)] px-2 py-1.5 no-underline hover:opacity-[0.97]"
                                                        >
                                                            <div className="text-[11px] font-semibold text-alloy-midnight/90 leading-snug">
                                                                {p.headline}
                                                            </div>
                                                            <div className="text-[10px] text-alloy-midnight/60 leading-snug mt-0.5">
                                                                {p.detail}
                                                            </div>
                                                        </Link>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    ) : null}
                                    {needsAttentionGroups.length ? (
                                        <ul className="space-y-2 pl-0 list-none" role="list">
                                            {needsAttentionGroups.map((g) => (
                                                <li
                                                    key={g.label}
                                                    className="rounded-lg border border-[var(--d-border,rgba(39,63,82,0.14))] bg-[var(--d-surface,#fff)] px-2 py-2"
                                                >
                                                    <div
                                                        style={{
                                                            display: "grid",
                                                            gridTemplateColumns: "minmax(0, 1fr) auto",
                                                            gap: "8px 12px",
                                                            alignItems: "start",
                                                        }}
                                                    >
                                                        <div style={{ minWidth: 0 }}>
                                                            <div className="text-xs font-semibold text-alloy-midnight/80 tabular-nums">
                                                                {g.label}
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <div className="text-xs font-semibold tabular-nums text-alloy-midnight/80">
                                                                {g.count}
                                                            </div>
                                                            <Link href={g.openQueueHref} className="adminv2-ws-attention-panel-viewall">
                                                                Open queue
                                                            </Link>
                                                        </div>
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    ) : needsAttentionPreview.length ? null : (
                                        <p className="text-[11px]" style={{ color: "var(--d-muted)" }}>
                                            Nothing needs intervention right now.
                                        </p>
                                    )}
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
