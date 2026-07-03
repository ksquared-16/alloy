"use client";

/**
 * Presentation Runtime V2 — WU.HEADER_CALCULATIONS.
 *
 * The published "Work Unit Header" surface, rendered as ONE operational signal ribbon — not
 * KPI cards. Each signal reads top-down: signal title (the eye-catcher) → value (secondary) →
 * supporting context (quiet, only when real data exists). Signals share a single near-invisible
 * container and are divided by hairlines, so the strip reads as one object that disappears into
 * the header. State is carried ONLY by a small dot + the value's color. No card chrome, no
 * pills, no colored boxes, no chart/wave/sparkline — ever. Single row, compact; queue + Focus
 * Panel stay the hero.
 *
 * Pure presentation: receives resolved `WorkUnitHeaderCalculationCardVm`s, never fetches. A
 * signal with a drill target links to the canonical work-unit route. Supporting context is
 * rendered only if the VM carries it — never fabricated (no invented trend / delta / target).
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
/** State by answer color — the value carries the operational read, nothing else does. */
const VALUE: Record<SignalState, string> = {
    healthy: "text-alloy-juniper",
    caution: "text-alloy-ember",
    critical: "text-alloy-firewood",
    neutral: "text-alloy-midnight/80",
};

/** Real supporting context on the VM, if the data layer provides it (never fabricated). */
function supportingContextOf(card: WorkUnitHeaderCalculationCardVm): string | null {
    const ctx = (card as { supportingContext?: unknown }).supportingContext;
    return typeof ctx === "string" && ctx.trim() ? ctx.trim() : null;
}

/** One operational signal — title (hero) → value (support) → context (quiet, if real). */
function Signal({ card }: { card: WorkUnitHeaderCalculationCardVm }) {
    const state = stateFromStatus(card.status);
    const context = supportingContextOf(card);
    return (
        <span className="flex min-w-0 flex-col gap-1" data-signal-key={card.sourceKey}>
            <span className="flex items-center gap-1.5">
                <span aria-hidden className={`h-[5px] w-[5px] shrink-0 rounded-full ${DOT[state]}`} />
                <span className="truncate text-[12px] font-semibold leading-none text-alloy-midnight" title={card.label}>
                    {card.label}
                </span>
            </span>
            <span className={`truncate text-[18px] font-bold leading-none tabular-nums ${VALUE[state]}`}>
                {card.formattedValue}
            </span>
            {context ? (
                <span className="truncate text-[10.5px] leading-none text-alloy-midnight/45" data-signal-context>
                    {context}
                </span>
            ) : null}
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
            className="overflow-hidden rounded-lg border border-alloy-stone/10 bg-alloy-stone/[0.02]"
            role="list"
            aria-label="Work unit signals"
        >
            <div className="flex flex-nowrap items-stretch divide-x divide-alloy-stone/10 overflow-x-auto">
                {cards.map((card) =>
                    card.drillHref ? (
                        <Link
                            key={card.sourceKey}
                            href={card.drillHref}
                            role="listitem"
                            data-calculation-key={card.sourceKey}
                            className="shrink-0 px-4 py-2 transition-colors hover:bg-alloy-midnight/[0.02] focus-visible:relative focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-alloy-juniper/60"
                        >
                            <Signal card={card} />
                        </Link>
                    ) : (
                        <div key={card.sourceKey} role="listitem" data-calculation-key={card.sourceKey} className="shrink-0 px-4 py-2">
                            <Signal card={card} />
                        </div>
                    ),
                )}
            </div>
        </div>
    );
}
