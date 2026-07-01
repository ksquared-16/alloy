"use client";

import type { ReactNode } from "react";
import type { ResolvedMetricMap } from "@/lib/metrics/fetchResolvedMetrics";
import type { OipMetricKey } from "@/lib/metrics/types";
import { getMetricDefinition } from "@/lib/metrics/registry";
import { oipSummaryLabel } from "@/lib/metrics/oipOperatorCopy";
import { oipKpiObjectStatusTextClass } from "@/lib/metrics/oipKpiObjectPresentation";
import { normalizeOipHealthStatus, oipHealthStatusLabel } from "@/lib/metrics/oipStatusPresentation";
import { OipHealthStrip } from "@/components/admin/workspace/OipHealthStrip";
import {
    OipKpiObjectCard,
    OipKpiObjectRow,
} from "@/components/admin/workspace/OipKpiObjectCard";
import { formatTargetFromKpi } from "@/lib/metrics/oipKpiObjectPresentation";
import { OPERATIONAL_PULSE_METRIC_KEYS } from "@/lib/kpi/workspaceKpiPresentation";
import type { WorkspaceHealthSummary } from "@/lib/metrics/workspaceHealthSummary";
import { WS_LAYOUT, WS_LAYOUT_ATTR } from "@/lib/workspace/workspaceLayoutSystem";

type Props = {
    health: WorkspaceHealthSummary;
    resolved: ResolvedMetricMap;
    loading?: boolean;
};

function CompactEmpty({ label }: { label: string }) {
    return (
        <p className="text-[11px] leading-snug text-alloy-midnight/45" data-oip-overview-empty="true">
            {label}
        </p>
    );
}

function InsightPanel({
    title,
    sectionKey,
    children,
}: {
    title: string;
    sectionKey: string;
    children: ReactNode;
}) {
    return (
        <div
            className="min-w-0 rounded-lg border border-alloy-midnight/10 bg-white px-3 py-2.5"
            data-oip-overview-section={sectionKey}
        >
            <h4 className="mb-2 text-xs font-semibold text-alloy-midnight">{title}</h4>
            {children}
        </div>
    );
}

function rankedInsights(
    resolved: ResolvedMetricMap,
    predicate: (status: ReturnType<typeof normalizeOipHealthStatus>) => boolean,
    limit: number
) {
    const out: { key: OipMetricKey; label: string; value: string; status: string }[] = [];
    for (const [key, metric] of Object.entries(resolved)) {
        const status = normalizeOipHealthStatus(metric?.kpi?.status);
        if (!predicate(status)) continue;
        out.push({
            key: key as OipMetricKey,
            label: metric?.label ?? getMetricDefinition(key as OipMetricKey).label,
            value: metric?.formatted_value ?? "—",
            status,
        });
    }
    return out.slice(0, limit);
}

/** O.I. Overview — insight panel layout (distinct from workspace command banner). */
export function OipOverviewStructure({ health, resolved, loading = false }: Props) {
    const needsAttention = resolved["ops.needs_attention_count"];
    const needsAttentionValue = needsAttention?.formatted_value ?? "—";
    const needsAttentionStatus = normalizeOipHealthStatus(needsAttention?.kpi?.status);

    const risks = rankedInsights(resolved, (s) => s === "warning" || s === "critical", 3);
    const opportunities = rankedInsights(resolved, (s) => s === "healthy", 3);

    return (
        <div
            className="space-y-3"
            data-oip-overview-structure="true"
            data-ws-layout={WS_LAYOUT_ATTR.oipOverview}
        >
            <section
                className={`${WS_LAYOUT.overviewSummary} space-y-2.5`}
                data-oip-overview-command="true"
                data-ws-layout={WS_LAYOUT_ATTR.overviewSummary}
            >
                <h3 className="text-xs font-semibold text-alloy-midnight">Performance snapshot</h3>
                <div>
                    <h4 className={WS_LAYOUT.sectionKicker}>Workspace Health</h4>
                    <div className="mt-1.5">
                        <OipHealthStrip health={health} />
                    </div>
                </div>

                <div className="border-t border-alloy-midnight/8 pt-2.5">
                    <h4 className={`${WS_LAYOUT.sectionKicker} mb-1.5`}>Operational Pulse</h4>
                    <OipKpiObjectRow layout="command" className="oip-overview-pulse-row">
                        {OPERATIONAL_PULSE_METRIC_KEYS.map((key) => {
                            const metric = resolved[key];
                            const def = getMetricDefinition(key);
                            return (
                                <OipKpiObjectCard
                                    key={key}
                                    label={def.label}
                                    value={metric?.formatted_value ?? "—"}
                                    target={formatTargetFromKpi(metric?.kpi)}
                                    status={metric?.kpi?.status}
                                    loading={loading}
                                    layout="command"
                                    metricKey={key}
                                />
                            );
                        })}
                    </OipKpiObjectRow>
                </div>
            </section>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                <InsightPanel title="Needs Attention Summary" sectionKey="needs-attention">
                    {needsAttentionValue === "—" ?
                        <CompactEmpty label="No attention signal in this window." />
                    :   <div className="space-y-1">
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                <span className="text-2xl font-semibold tabular-nums text-alloy-midnight">
                                    {needsAttentionValue}
                                </span>
                                <span className="text-sm text-alloy-midnight/60">
                                    {oipSummaryLabel("ops.needs_attention_count")}
                                </span>
                                {needsAttentionStatus !== "unknown" ?
                                    <span
                                        className={`text-xs font-medium ${oipKpiObjectStatusTextClass(needsAttentionStatus)}`}
                                    >
                                        {oipHealthStatusLabel(needsAttentionStatus)}
                                    </span>
                                :   null}
                            </div>
                            <p className="text-[11px] leading-snug text-alloy-midnight/50">
                                Records flagged across active operational playbooks.
                            </p>
                        </div>
                    }
                </InsightPanel>

                <InsightPanel title="Top Risks" sectionKey="risks">
                    {risks.length ?
                        <ul className="space-y-1.5">
                            {risks.map((item) => (
                                <li
                                    key={item.key}
                                    className="flex min-w-0 items-baseline justify-between gap-2 text-[11px]"
                                    data-oip-overview-insight={item.key}
                                >
                                    <span className="truncate text-alloy-midnight/65">{item.label}</span>
                                    <span className="inline-flex shrink-0 items-baseline gap-1 font-semibold tabular-nums text-alloy-midnight">
                                        {item.value}
                                        <span className={`text-[9px] ${oipKpiObjectStatusTextClass(item.status)}`}>
                                            ●
                                        </span>
                                    </span>
                                </li>
                            ))}
                        </ul>
                    :   <CompactEmpty label="No metrics flagged for review." />}
                </InsightPanel>

                <InsightPanel title="Top Opportunities" sectionKey="opportunities">
                    {opportunities.length ?
                        <ul className="space-y-1.5">
                            {opportunities.map((item) => (
                                <li
                                    key={item.key}
                                    className="flex min-w-0 items-baseline justify-between gap-2 text-[11px]"
                                    data-oip-overview-insight={item.key}
                                >
                                    <span className="truncate text-alloy-midnight/65">{item.label}</span>
                                    <span className="inline-flex shrink-0 items-baseline gap-1 font-semibold tabular-nums text-alloy-midnight">
                                        {item.value}
                                        <span className={`text-[9px] ${oipKpiObjectStatusTextClass(item.status)}`}>
                                            ●
                                        </span>
                                    </span>
                                </li>
                            ))}
                        </ul>
                    :   <CompactEmpty label="No on-track highlights yet." />}
                </InsightPanel>
            </div>
        </div>
    );
}
