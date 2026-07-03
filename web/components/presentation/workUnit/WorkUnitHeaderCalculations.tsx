"use client";

/**
 * Presentation Runtime V2 — WU.HEADER_CALCULATIONS.
 *
 * The published "Work Unit Header" surface, rendered as a compact operational SIGNAL strip
 * (not KPI cards): each signal reads statement-first — the configured label is the hero, the
 * value supports it, and a small state dot carries the operational state. Signals are
 * separated by whitespace, not borders/shadows, and flow as one continuous strip across the
 * header. Single row, well under ~20% of the viewport, so the queue + Focus Panel stay high.
 *
 * Pure presentation: receives resolved `WorkUnitHeaderCalculationCardVm`s from WorkUnitSurface,
 * never fetches. A signal with a drill target links to the canonical work-unit route. No
 * sparkline, no chart, no wave — ever.
 */

import Link from "next/link";
import type { WorkUnitHeaderCalculationCardVm } from "@/lib/presentation/runtime";
import {
    PRESENTATION_RUNTIME_LABELS,
    runtimeLabelProps,
} from "@/components/presentation/runtimeLabels";

type SignalState = "healthy" | "caution" | "critical" | "neutral";

/** Canonical KPI status → display state (localization only — never classification). */
function stateFromStatus(status: string): SignalState {
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
    healthy: "text-alloy-midnight",
    caution: "text-alloy-ember",
    critical: "text-alloy-firewood",
    neutral: "text-alloy-midnight/70",
};

/** One operational signal — statement (hero) over value (support) + state dot. */
function Signal({ card }: { card: WorkUnitHeaderCalculationCardVm }) {
    const state = stateFromStatus(card.status);
    return (
        <span className="flex min-w-0 flex-col gap-0.5" data-signal-key={card.sourceKey}>
            <span className="truncate text-[12px] font-semibold leading-tight text-alloy-midnight/80" title={card.label}>
                {card.label}
            </span>
            <span className="flex items-baseline gap-1.5">
                <span aria-hidden className={`h-[5px] w-[5px] shrink-0 translate-y-[-1px] rounded-full ${DOT[state]}`} />
                <span className={`truncate text-[13px] font-bold leading-none tabular-nums ${VALUE[state]}`}>
                    {card.formattedValue}
                </span>
            </span>
        </span>
    );
}

export function WorkUnitHeaderCalculations({
    cards,
}: {
    cards: WorkUnitHeaderCalculationCardVm[];
}) {
    if (!cards.length) return null;
    return (
        <div
            {...runtimeLabelProps(PRESENTATION_RUNTIME_LABELS.workUnitHeaderCalculations)}
            data-alloy-section="WU.HEADER_CALCULATIONS"
            data-wu-header-strip="true"
            className="flex flex-nowrap items-start gap-x-7 gap-y-1 overflow-x-auto py-0.5"
            role="list"
            aria-label="Work unit signals"
        >
            {cards.map((card) =>
                card.drillHref ? (
                    <Link
                        key={card.sourceKey}
                        href={card.drillHref}
                        role="listitem"
                        data-calculation-key={card.sourceKey}
                        className="shrink-0 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-alloy-juniper/60"
                    >
                        <Signal card={card} />
                    </Link>
                ) : (
                    <div key={card.sourceKey} role="listitem" data-calculation-key={card.sourceKey} className="shrink-0">
                        <Signal card={card} />
                    </div>
                ),
            )}
        </div>
    );
}
