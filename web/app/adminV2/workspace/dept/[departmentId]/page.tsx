"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { WorkspaceChrome } from "@/components/admin/workspace/WorkspaceChrome";
import { useOperationsWorkspaceData } from "@/hooks/useOperationsWorkspaceData";
import { DepartmentWorkspaceBridgeShell } from "@/components/admin/workspace/DepartmentWorkspaceBridgeShell";
import KPIBlock from "@/app/adminV2/components/workspace/blocks/KPIBlock";
import type { KPIVm } from "@/lib/ui-v2/workspace-types";

const WORKSPACE_BASE = "/adminV2/workspace";

function int(n: number | null | undefined): string {
    if (n == null || Number.isNaN(Number(n))) return "0";
    return String(Math.max(0, Math.floor(Number(n))));
}

export default function AdminV2WorkspaceDepartmentPage() {
    const params = useParams();
    const departmentId = typeof params.departmentId === "string" ? params.departmentId : "";

    const { dept, title, runtime, error, loading } = useOperationsWorkspaceData(departmentId);

    const deptKey = (dept?.key ?? "").trim().toLowerCase();
    const isEnrollment = deptKey === "enrollment";

    const enrollmentKpis = useMemo((): KPIVm[] => {
        const k = runtime.opportunityLifecycleKpis;
        if (!k || k.status !== "ready") return [];
        const byKey = new Map<string, number>();
        for (const s of k.statusBreakdown ?? []) {
            byKey.set(String(s.status_key ?? "").trim().toLowerCase(), Number(s.count ?? 0));
        }
        const c = (key: string) => byKey.get(key) ?? 0;

        const newCount = c("new_inquiry");
        const contacted = c("contacted");
        const tours = c("tour_scheduled") + c("tour_completed");
        const decision = c("ready_to_enroll") + c("waitlisted");
        const closed = c("enrolled") + c("lost");
        const totalActive = Math.max(0, (k.counts?.total ?? 0) - closed);

        return [
            { id: "total_active", label: "Total inquiries", value: int(totalActive), lane: "business" },
            { id: "new", label: "New", value: int(newCount), lane: "business" },
            { id: "contacted", label: "Contacted", value: int(contacted), lane: "business" },
            { id: "tours", label: "Tours", value: int(tours), lane: "business" },
            { id: "decision", label: "Decision", value: int(decision), lane: "business" },
            { id: "closed", label: "Closed", value: int(closed), lane: "business" },
            {
                id: "pipeline_value",
                label: "Pipeline value",
                value: k.values?.openPipeline != null ? `$${Number(k.values.openPipeline).toFixed(0)}` : "—",
                lane: "business",
            },
        ];
    }, [runtime.opportunityLifecycleKpis]);

    const enrollmentWorkUnits = useMemo(() => {
        const byKey = new Map<string, { id: string; key?: string | null; name: string | null }>();
        for (const wu of runtime.workUnits ?? []) {
            const k = String(wu.key ?? "").trim().toLowerCase();
            if (!k) continue;
            byKey.set(k, { id: wu.id, key: wu.key, name: wu.name });
        }
        return {
            pipeline_overview: byKey.get("pipeline_overview") ?? null,
            early_inquiries: byKey.get("early_inquiries") ?? null,
            quoting: byKey.get("quoting") ?? null,
            priced_followup: byKey.get("priced_followup") ?? null,
            needs_attention: byKey.get("needs_attention") ?? null,
        };
    }, [runtime.workUnits]);

    const needsAttentionGroups = useMemo(() => {
        const oq = runtime.opportunityQueues?.needs_attention;
        const items = oq?.items ?? [];
        const m = new Map<string, number>();
        for (const it of items as Array<{ _attention_reason_label?: string | null }>) {
            const label = String(it._attention_reason_label ?? "").trim() || "Needs attention";
            m.set(label, (m.get(label) ?? 0) + 1);
        }
        return [...m.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([label, count]) => ({ label, count }));
    }, [runtime.opportunityQueues?.needs_attention]);

    const base = `${WORKSPACE_BASE}/dept/${encodeURIComponent(departmentId)}`;

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
                            <KPIBlock
                                kpis={enrollmentKpis}
                                surface="department"
                                maxVisible={7}
                                dualRailHeadings={{ business: "Enrollment KPIs", secondary: "" }}
                            />
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
                                    {[
                                        {
                                            key: "all",
                                            label: "All inquiries",
                                            desc: "All active inquiries (excludes enrolled/lost).",
                                            wu: enrollmentWorkUnits.pipeline_overview,
                                        },
                                        {
                                            key: "new",
                                            label: "New",
                                            desc: "New inquiries that have not been contacted yet.",
                                            wu: enrollmentWorkUnits.pipeline_overview,
                                            statusKeys: ["new_inquiry"],
                                        },
                                        {
                                            key: "contacted",
                                            label: "Contacted",
                                            desc: "Conversation has started; move to tour.",
                                            wu: enrollmentWorkUnits.pipeline_overview,
                                            statusKeys: ["contacted"],
                                        },
                                        {
                                            key: "tours",
                                            label: "Tours in progress",
                                            desc: "Tours scheduled or completed.",
                                            wu: enrollmentWorkUnits.quoting,
                                        },
                                        {
                                            key: "decision",
                                            label: "Ready / waitlist",
                                            desc: "Awaiting family decision.",
                                            wu: enrollmentWorkUnits.priced_followup,
                                        },
                                    ].map((lane) => {
                                        const href =
                                            lane.wu?.id
                                                ? `${base}/work-unit/${encodeURIComponent(lane.wu.id)}${
                                                      lane.statusKeys?.length
                                                          ? `?status_keys=${encodeURIComponent(lane.statusKeys.join(","))}`
                                                          : ""
                                                  }`
                                                : base;
                                        const count = (() => {
                                            const k = runtime.opportunityLifecycleKpis;
                                            if (!k || k.status !== "ready") return null;
                                            const byKey = new Map<string, number>();
                                            for (const s of k.statusBreakdown ?? []) {
                                                byKey.set(String(s.status_key ?? "").trim().toLowerCase(), Number(s.count ?? 0));
                                            }
                                            const c = (key: string) => byKey.get(key) ?? 0;
                                            if (lane.key === "all") {
                                                const closed = c("enrolled") + c("lost");
                                                return Math.max(0, (k.counts?.total ?? 0) - closed);
                                            }
                                            if (lane.key === "new") return c("new_inquiry");
                                            if (lane.key === "contacted") return c("contacted");
                                            if (lane.key === "tours") return c("tour_scheduled") + c("tour_completed");
                                            if (lane.key === "decision") return c("ready_to_enroll") + c("waitlisted");
                                            return null;
                                        })();
                                        return (
                                            <li key={lane.key} className="adminv2-ws-wu-queue-item-wrap" role="listitem">
                                                <Link
                                                    href={href}
                                                    className="adminv2-ws-wu-queue-card adminv2-ws-wu-queue-card--compact adminv2-ws-wu-queue-card--tier-standard flex flex-col items-stretch no-underline text-inherit hover:opacity-[0.98]"
                                                    data-ws-wu-urgency="standard"
                                                >
                                                    <div className="adminv2-ws-wu-queue-card-compact-text">
                                                        <div className="adminv2-ws-wu-queue-card-title adminv2-ws-wu-queue-card-title--compact">
                                                            {lane.label}
                                                        </div>
                                                        <div className="adminv2-ws-wu-queue-card-sub adminv2-ws-wu-queue-card-sub--compact">
                                                            {lane.desc}
                                                        </div>
                                                        {typeof count === "number" ? (
                                                            <div
                                                                className="mt-2 text-[11px] tabular-nums"
                                                                style={{ color: "var(--d-muted)" }}
                                                            >
                                                                <span className="font-medium text-alloy-midnight/75">Count:</span>{" "}
                                                                {count}
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
                                    })}
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
                                        Exceptions grouped by reason.
                                    </p>
                                </div>
                            </header>
                            <div className="adminv2-ws-attention-stack">
                                <div className="adminv2-ws-attention-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                    {needsAttentionGroups.length ? (
                                        <ul className="space-y-2 pl-0 list-none" role="list">
                                            {needsAttentionGroups.map((g) => {
                                                const href =
                                                    enrollmentWorkUnits.needs_attention?.id
                                                        ? `${base}/work-unit/${encodeURIComponent(
                                                              enrollmentWorkUnits.needs_attention.id
                                                          )}?attention_reason=${encodeURIComponent(g.label)}`
                                                        : base;
                                                return (
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
                                                                <Link href={href} className="adminv2-ws-attention-panel-viewall">
                                                                    Open queue
                                                                </Link>
                                                            </div>
                                                        </div>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                    ) : (
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
                                <Link
                                    href="/admin/opportunities"
                                    className="adminv2-ws-action-primary"
                                >
                                    New inquiry
                                </Link>
                                <Link href="/admin/opportunities" className="adminv2-ws-action-row">
                                    Open all inquiries
                                </Link>
                                <Link href="/admin/system/work-units" className="adminv2-ws-action-row">
                                    Manage work units
                                </Link>
                            </div>
                        </section>
                    }
                />
            ) : (
                <div className="rounded-xl border px-4 py-10 text-center text-sm text-alloy-midnight/55" style={{ borderColor: "var(--d-border, rgba(39,63,82,0.14))" }}>
                    Department contract UI is implemented for Enrollment only.
                </div>
            )}
        </WorkspaceChrome>
    );
}
