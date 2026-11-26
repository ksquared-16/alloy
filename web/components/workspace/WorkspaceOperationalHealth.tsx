"use client";

/**
 * @module WorkspaceOperationalHealth
 *
 * Flat operational health band — not cards, not pills, not interactive.
 * Module adapters supply counts + trend placeholders; layout and typography live here.
 */

import { WS_METRIC_EYEBROW, WS_TEXT_SECONDARY } from "@/components/workspace/workspaceTokens";

export type WorkspaceOperationalHealthTone = "pine" | "gold" | "ember" | "midnight" | "neutral";

export type WorkspaceOperationalHealthTrendDirection = "up" | "down" | "none";

export interface WorkspaceOperationalHealthTrend {
    direction: WorkspaceOperationalHealthTrendDirection;
    label: string;
    /** Trend line color — defaults from direction + item tone when omitted. */
    tone?: WorkspaceOperationalHealthTone;
}

export interface WorkspaceOperationalHealthItem {
    key: string;
    label: string;
    value: string;
    tone?: WorkspaceOperationalHealthTone;
    trend?: WorkspaceOperationalHealthTrend;
}

const VALUE_TONE: Record<WorkspaceOperationalHealthTone, string> = {
    pine: "text-alloy-bend-pine",
    gold: "text-alloy-gold-dark",
    ember: "text-alloy-ember",
    midnight: "text-alloy-midnight",
    neutral: "text-alloy-midnight",
};

const TREND_TONE: Record<WorkspaceOperationalHealthTone, string> = {
    pine: "text-alloy-bend-pine",
    gold: "text-alloy-gold-dark",
    ember: "text-alloy-ember",
    midnight: "text-alloy-slate",
    neutral: "text-alloy-slate",
};

function trendArrow(direction: WorkspaceOperationalHealthTrendDirection): string {
    if (direction === "up") return "↑";
    if (direction === "down") return "↓";
    return "";
}

function resolveTrendTone(
    item: WorkspaceOperationalHealthItem,
    trend: WorkspaceOperationalHealthTrend
): WorkspaceOperationalHealthTone {
    if (trend.tone) return trend.tone;
    if (trend.direction === "up") return "pine";
    if (item.tone === "ember") return "ember";
    return "midnight";
}

export default function WorkspaceOperationalHealth({
    eyebrow,
    items,
    loading = false,
    ariaLabel = "Operational health",
    className = "",
    "data-testid": testId,
}: {
    eyebrow: string;
    items: WorkspaceOperationalHealthItem[];
    loading?: boolean;
    ariaLabel?: string;
    className?: string;
    "data-testid"?: string;
}) {
    if (items.length === 0) return null;

    return (
        <div
            className={`flex w-full min-w-0 flex-col gap-1.5 ${className}`.trim()}
            data-workspace-operational-health="true"
            data-testid={testId}
            aria-label={ariaLabel}
            aria-busy={loading}
        >
            <p className={WS_METRIC_EYEBROW}>
                <span className="h-1.5 w-1.5 shrink-0 rotate-45 bg-alloy-slate/50" aria-hidden />
                {eyebrow}
            </p>
            <div
                className="flex flex-wrap items-start gap-x-6 gap-y-2"
                data-workspace-operational-health-metrics="true"
                role="list"
            >
                {items.map((item) => {
                    const valueTone = VALUE_TONE[item.tone ?? "neutral"];
                    const displayValue = loading ? "…" : item.value;

                    return (
                        <div key={item.key} role="listitem" className="min-w-[5.5rem] shrink-0">
                            <p className="leading-tight">
                                <span className={`text-[22px] font-semibold tabular-nums leading-none ${valueTone}`}>
                                    {displayValue}
                                </span>
                                <span className={`ml-1.5 text-[13px] font-medium ${WS_TEXT_SECONDARY}`}>{item.label}</span>
                            </p>
                            {item.trend ? (
                                <p
                                    className={`mt-0.5 text-[12px] font-medium leading-tight ${TREND_TONE[resolveTrendTone(item, item.trend)]}`}
                                    data-workspace-operational-health-trend={item.trend.direction}
                                >
                                    {item.trend.direction !== "none" ? (
                                        <>
                                            <span aria-hidden>{trendArrow(item.trend.direction)} </span>
                                            {item.trend.label}
                                        </>
                                    ) : (
                                        item.trend.label
                                    )}
                                </p>
                            ) : (
                                <p
                                    className="mt-0.5 text-[12px] leading-tight text-transparent"
                                    aria-hidden
                                >
                                    —
                                </p>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
