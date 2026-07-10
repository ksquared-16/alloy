"use client";

/**
 * @module WorkspaceOperationalHealthStrip
 *
 * Alloy Operational Health Doctrine V3 — flat operational health ribbon for module nav bands.
 * One row, hairline-separated cells, no boxed KPI cards. Each signal reads:
 * label → value → trend placeholder (reserved for future trend data).
 *
 * Processing (Digital Mailroom) is the reference presentation; Work Items and future modules
 * compose this primitive with data-only adapters.
 */

import { WS_METRIC_EYEBROW, WS_OPERATIONAL_HEALTH_STRIP } from "@/components/workspace/workspaceTokens";

export type OperationalHealthStatus = "healthy" | "warning" | "critical" | "unknown";

export interface WorkspaceOperationalHealthItem {
    key: string;
    label: string;
    value: string;
    status?: OperationalHealthStatus;
    /** When omitted, renders the shared trend placeholder (`—`). */
    trend?: string | null;
}

type SignalState = "healthy" | "caution" | "critical" | "neutral";

function stateFromStatus(status: OperationalHealthStatus | undefined): SignalState {
    if (status === "healthy") return "healthy";
    if (status === "warning") return "caution";
    if (status === "critical") return "critical";
    return "neutral";
}

const DOT: Record<SignalState, string> = {
    healthy: "bg-alloy-juniper",
    caution: "bg-alloy-ember",
    critical: "bg-alloy-firewood",
    neutral: "bg-alloy-midnight/30",
};

const VALUE: Record<SignalState, string> = {
    healthy: "text-alloy-juniper",
    caution: "text-alloy-ember",
    critical: "text-alloy-firewood",
    neutral: "text-alloy-midnight/80",
};

function HealthSignal({
    item,
    loading,
    trendPlaceholder,
}: {
    item: WorkspaceOperationalHealthItem;
    loading: boolean;
    trendPlaceholder: string;
}) {
    const state = stateFromStatus(item.status);
    const trend = item.trend?.trim() ? item.trend.trim() : trendPlaceholder;
    return (
        <span className="flex min-w-0 flex-col gap-1" data-operational-health-key={item.key}>
            <span className="flex items-center gap-1.5">
                <span aria-hidden className={`h-[5px] w-[5px] shrink-0 rounded-full ${DOT[state]}`} />
                <span
                    className="truncate text-[12px] font-semibold leading-none text-alloy-midnight"
                    title={item.label}
                >
                    {item.label}
                </span>
            </span>
            <span
                className={`truncate text-[18px] font-bold leading-none tabular-nums ${VALUE[state]}`}
                data-operational-health-value
            >
                {loading ? "…" : item.value}
            </span>
            <span
                className="truncate text-[10.5px] leading-none text-alloy-midnight/45"
                data-operational-health-trend
                data-operational-health-trend-placeholder={trend === trendPlaceholder ? "true" : undefined}
            >
                {loading ? "…" : trend}
            </span>
        </span>
    );
}

export default function WorkspaceOperationalHealthStrip({
    items,
    eyebrow,
    loading = false,
    ariaLabel = "Operational health",
    className = "",
    trendPlaceholder = "—",
    "data-testid": testId,
}: {
    items: WorkspaceOperationalHealthItem[];
    eyebrow?: string;
    loading?: boolean;
    ariaLabel?: string;
    className?: string;
    trendPlaceholder?: string;
    "data-testid"?: string;
}) {
    if (items.length === 0) return null;

    const strip = (
        <div
            className={WS_OPERATIONAL_HEALTH_STRIP}
            data-workspace-operational-health-strip="true"
            data-testid={eyebrow ? undefined : testId}
            role="list"
            aria-label={ariaLabel}
            aria-busy={loading}
        >
            <div className="flex flex-nowrap items-stretch divide-x divide-alloy-stone/10 overflow-x-auto">
                {items.map((item) => (
                    <div key={item.key} role="listitem" className="shrink-0 px-4 py-2">
                        <HealthSignal item={item} loading={loading} trendPlaceholder={trendPlaceholder} />
                    </div>
                ))}
            </div>
        </div>
    );

    if (!eyebrow) {
        return <div className={`w-full min-w-0 ${className}`.trim()}>{strip}</div>;
    }

    return (
        <div
            className={`flex w-full min-w-0 flex-col gap-1 ${className}`.trim()}
            data-workspace-operational-health-band="true"
            data-testid={testId}
        >
            <p className={WS_METRIC_EYEBROW}>
                <span className="h-1.5 w-1.5 shrink-0 rotate-45 bg-alloy-slate/50" aria-hidden />
                {eyebrow}
            </p>
            {strip}
        </div>
    );
}
