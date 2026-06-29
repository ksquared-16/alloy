"use client";

import Link from "next/link";

import { MetricCardShell, MetricCardValue } from "@/components/admin/metrics/MetricCardShell";
import type { OperationalMetricCard as OperationalMetricCardModel } from "@/lib/analytics/runtime/operationalSurfaceModel";

const DIRECTION_ARROW: Record<"up" | "down" | "flat", string> = { up: "▲", down: "▼", flat: "→" };

/**
 * Renders one resolved Operational Calculation in the approved Metric Card language.
 * Presentation only — the value/health are resolved server-side from OIP.
 */
export function OperationalMetricCard({ card }: { card: OperationalMetricCardModel }) {
    return (
        <MetricCardShell
            label={card.label}
            visual="metric_scorecard"
            question={card.question}
            status={card.health}
            showHealthChip={card.health !== "unknown"}
            footer={
                card.drillHref ? (
                    <Link
                        href={card.drillHref}
                        className="inline-flex items-center gap-1 text-alloy-pine hover:underline"
                        data-operational-drill="metric"
                        data-metric-key={card.key}
                    >
                        <span aria-hidden="true">↳</span>
                        {card.drillLabel ?? "Open"}
                    </Link>
                ) : undefined
            }
        >
            <MetricCardValue value={card.formattedValue} />
            {card.comparison ? (
                <p
                    className={`text-[10px] font-medium ${card.comparison.available ? "text-alloy-midnight/60" : "text-alloy-midnight/40"}`}
                    data-metric-comparison={card.comparison.available ? card.comparison.direction : "unavailable"}
                    title="Prior-period comparison (direction only; sentiment depends on the metric)"
                >
                    {card.comparison.available
                        ? `${DIRECTION_ARROW[card.comparison.direction]} ${card.comparison.label}`
                        : card.comparison.label}
                </p>
            ) : null}
            {card.bounded ? (
                <p className="text-[10px] text-alloy-midnight/40" title="Bounded scan — not exhaustive org truth">
                    bounded snapshot
                </p>
            ) : null}
        </MetricCardShell>
    );
}
