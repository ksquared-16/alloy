"use client";

import type { WorkspaceKpiBlock, WorkspaceRuntimeData } from "@/lib/workspace/types";

function formatUsd(n: number): string {
    return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: n >= 100 ? 0 : 2,
    }).format(n);
}

function LifecyclePipelineKpiBridge({
    block,
    data,
}: {
    block: Extract<WorkspaceKpiBlock, { state: "opportunity_lifecycle_pipeline" }>;
    data: NonNullable<WorkspaceRuntimeData["opportunityLifecycleKpis"]>;
}) {
    const title = block.title ?? "Pipeline";

    if (data.status === "loading") {
        return (
            <div data-workspace-block="kpi" className="adminv2-ws-dept-v2-kpi-measurement-strip" role="status" aria-label="Loading pipeline metrics">
                <div className="adminv2-ws-dept-v2-kpi-dual">
                    <div className="adminv2-ws-dept-v2-kpi-rail adminv2-ws-dept-v2-kpi-rail--business w-full max-w-full">
                        <div className="adminv2-ws-dept-v2-kpi-rail-heading">{title}</div>
                        <p className="text-xs mt-1" style={{ color: "var(--d-muted)" }}>
                            Loading lifecycle metrics…
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    if (data.status === "error") {
        return (
            <div data-workspace-block="kpi" className="adminv2-ws-dept-v2-kpi-measurement-strip" role="alert">
                <div className="adminv2-ws-dept-v2-kpi-dual">
                    <div className="adminv2-ws-dept-v2-kpi-rail adminv2-ws-dept-v2-kpi-rail--business w-full max-w-full">
                        <div className="adminv2-ws-dept-v2-kpi-rail-heading">{title}</div>
                        <p className="text-xs mt-1 text-amber-800">{data.message}</p>
                    </div>
                </div>
            </div>
        );
    }

    const { counts, values } = data;
    // Keep v1 concise: show the operational “now” buckets and a compact closed summary.
    const cells: { label: string; value: number; emphasize?: boolean }[] = [
        {
            label: block.recordLabel ? `Total (${block.recordLabel.trim()})` : "Total opportunities",
            value: counts.total,
            emphasize: true,
        },
        { label: "New + qualifying", value: counts.intake + counts.qualification },
        { label: "Quoting", value: counts.execution },
        { label: "Priced follow-up", value: counts.decision },
        { label: "Closed", value: counts.success + counts.failure },
    ];

    return (
        <div data-workspace-block="kpi" className="adminv2-ws-dept-v2-kpi-measurement-strip" role="group" aria-label="Pipeline metrics">
            <div className="adminv2-ws-dept-v2-kpi-dual">
                <div className="adminv2-ws-dept-v2-kpi-rail adminv2-ws-dept-v2-kpi-rail--business w-full max-w-full">
                    <div className="adminv2-ws-dept-v2-kpi-rail-heading">{title}</div>
                    {block.subtitle ? (
                        <p className="text-xs mt-0.5 mb-2" style={{ color: "var(--d-muted)", lineHeight: 1.35 }}>
                            {block.subtitle}
                        </p>
                    ) : null}
                    <div className="adminv2-ws-kpi-strip adminv2-ws-kpi-strip--dept-embedded flex flex-wrap gap-2">
                        {cells.map((c) => (
                            <div
                                key={c.label}
                                className="adminv2-ws-kpi-cell min-w-[100px] flex-1"
                                data-emphasis={c.emphasize ? "true" : undefined}
                            >
                                <span className="adminv2-ws-kpi-label">{c.label}</span>
                                <span className="adminv2-ws-kpi-value tabular-nums font-semibold" style={{ fontSize: c.emphasize ? 18 : 15 }}>
                                    {c.value}
                                </span>
                            </div>
                        ))}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs" style={{ color: "var(--d-muted)" }}>
                        <span>
                            <span className="font-medium text-alloy-midnight/80">Open pipeline value: </span>
                            {formatUsd(values.openPipeline)}
                        </span>
                        <span>
                            <span className="font-medium text-alloy-midnight/80">Priced in motion: </span>
                            {formatUsd(values.pricedInMotion)}
                        </span>
                    </div>
                    <div className="mt-1 text-[11px]" style={{ color: "var(--d-muted)" }}>
                        Intake {counts.intake} · Qualification {counts.qualification} · Success {counts.success} · Not enrolled {counts.failure}
                        {counts.unclassified > 0 ? ` · Unclassified ${counts.unclassified}` : ""}
                    </div>
                </div>
            </div>
        </div>
    );
}

export function KpiBlock({
    block,
    runtime,
    presentation = "flat",
}: {
    block: WorkspaceKpiBlock;
    runtime?: WorkspaceRuntimeData;
    presentation?: "flat" | "bridge";
}) {
    if (block.state === "opportunity_lifecycle_pipeline") {
        const data = runtime?.opportunityLifecycleKpis ?? { status: "loading" as const };
        if (presentation === "bridge") {
            return <LifecyclePipelineKpiBridge block={block} data={data} />;
        }
        return (
            <section className="rounded-xl border border-admin-border bg-white p-4 shadow-sm" data-workspace-block="kpi">
                <LifecyclePipelineKpiBridge block={block} data={data} />
            </section>
        );
    }

    if (presentation === "bridge") {
        return (
            <div data-workspace-block="kpi" className="adminv2-ws-dept-v2-kpi-measurement-strip" role="group" aria-label="Key metrics">
                <div className="adminv2-ws-dept-v2-kpi-dual">
                    <div className="adminv2-ws-dept-v2-kpi-rail adminv2-ws-dept-v2-kpi-rail--business">
                        <div className="adminv2-ws-dept-v2-kpi-rail-heading">{block.title ?? "KPIs"}</div>
                        <div className="adminv2-ws-kpi-strip adminv2-ws-kpi-strip--dept-embedded">
                            <div className="adminv2-ws-kpi-cell adminv2-ws-kpi-cell--placeholder">
                                <span className="adminv2-ws-kpi-label">Status</span>
                                <span
                                    className="adminv2-ws-kpi-value adminv2-ws-kpi-value--placeholder"
                                    style={{ fontWeight: 500, fontSize: 12, lineHeight: 1.4 }}
                                >
                                    {block.message}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <section
            className="rounded-xl border border-dashed border-admin-border bg-alloy-stone/15 p-4 text-sm text-alloy-midnight/70"
            data-workspace-block="kpi"
        >
            <p className="font-medium text-alloy-midnight/85">{block.title ?? "KPIs"}</p>
            <p className="mt-1">{block.message}</p>
        </section>
    );
}
