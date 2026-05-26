"use client";

import clsx from "clsx";
import type { IntakeCommandCenterKpi } from "@/lib/forms/intakeCommandCenterPresentation";
import { opMetadata } from "@/lib/operational/ui/operationalVisualTokens";

const TONE_CLASS: Record<IntakeCommandCenterKpi["tone"], string> = {
    urgent: "bg-alloy-ember/[0.06] ring-alloy-ember/20 text-alloy-midnight",
    attention: "bg-amber-50/90 ring-amber-200/60 text-alloy-midnight",
    waiting: "bg-alloy-blue/[0.05] ring-alloy-blue/15 text-alloy-midnight",
    healthy: "bg-alloy-pine/[0.06] ring-alloy-pine/20 text-alloy-midnight",
    neutral: "bg-white/95 ring-alloy-midnight/[0.07] text-alloy-midnight",
};

type Props = {
    kpis: IntakeCommandCenterKpi[];
};

/** Compact KPI strip for intake command center (OI-1). */
export function IntakeCommandCenterKpiStrip({ kpis }: Props) {
    if (kpis.length === 0) return null;

    return (
        <div
            className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
            data-testid="intake-command-center-kpis"
            role="list"
            aria-label="Intake workload metrics"
        >
            {kpis.map((kpi) => (
                <div
                    key={kpi.id}
                    role="listitem"
                    className={clsx(
                        "rounded-xl px-3 py-2.5 ring-1 ring-inset transition-colors",
                        TONE_CLASS[kpi.tone]
                    )}
                    data-testid={`intake-kpi-${kpi.id}`}
                >
                    <p className={clsx("text-[11px] font-medium uppercase tracking-wide opacity-70")}>{kpi.label}</p>
                    <p className="mt-0.5 text-xl font-semibold tabular-nums tracking-tight">{kpi.value}</p>
                    {kpi.hint ?
                        <p className={clsx("mt-0.5 line-clamp-2", opMetadata)}>{kpi.hint}</p>
                    :   null}
                </div>
            ))}
        </div>
    );
}
