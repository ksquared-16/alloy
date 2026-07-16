"use client";

import type { ConfigGlanceMetric } from "@/components/adminV2/settings/configurationRuntime/workspace/configWorkspaceTypes";
import { ConfigWorkspaceCard } from "@/components/adminV2/settings/configurationRuntime/workspace/configWorkspaceTypes";

const ICON_PATH: Record<NonNullable<ConfigGlanceMetric["icon"]>, string> = {
    capacity: "M4 19h16M6 17V9m4 8V5m4 12v-6m4 6V7",
    rooms: "M4 10l8-6 8 6v9a1 1 0 01-1 1h-5v-6H10v6H5a1 1 0 01-1-1v-9z",
    programs: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
    schedule: "M8 2v3M16 2v3M4 9h16M6 13h4m-4 4h7M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z",
};

function MetricIcon({ icon }: { icon: NonNullable<ConfigGlanceMetric["icon"]> }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-4 w-4" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATH[icon]} />
        </svg>
    );
}

function wellClass(tone: ConfigGlanceMetric["tone"]): string {
    if (tone === "attention") return "bg-alloy-ember/[0.08] text-alloy-ember";
    if (tone === "ready") return "bg-alloy-bend-pine/[0.10] text-alloy-bend-pine";
    return "bg-alloy-bend-pine/[0.08] text-[#007d68]";
}

/**
 * Compact operational glance — summary objects with identity, primary value, secondary state.
 * Prefer icon wells + metric hierarchy over equal text boxes.
 */
export function ConfigGlanceMetrics({
    title = "Configured",
    metrics,
    testId = "config-glance-metrics",
}: {
    title?: string;
    metrics: ConfigGlanceMetric[];
    testId?: string;
}) {
    return (
        <ConfigWorkspaceCard title={title} compact testId={testId}>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {metrics.map((metric) => {
                    const body = (
                        <>
                            <div className="flex items-start gap-2.5">
                                {metric.icon ?
                                    <span
                                        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${wellClass(metric.tone)}`}
                                        data-config-glance-icon-well=""
                                    >
                                        <MetricIcon icon={metric.icon} />
                                    </span>
                                :   null}
                                <div className="min-w-0">
                                    <span className="block text-[11px] font-medium uppercase tracking-[0.06em] text-alloy-midnight/45">
                                        {metric.label}
                                    </span>
                                    <span className="mt-0.5 block text-lg font-semibold leading-tight text-alloy-midnight">
                                        {metric.value}
                                    </span>
                                </div>
                            </div>
                            {metric.hint ?
                                <span
                                    className={`mt-2 block text-[11px] leading-snug ${
                                        metric.tone === "attention" ?
                                            "font-medium text-alloy-ember"
                                        :   "text-alloy-midnight/50"
                                    }`}
                                >
                                    {metric.hint}
                                </span>
                            :   null}
                        </>
                    );
                    const shellClass =
                        "rounded-xl border border-alloy-forge/10 bg-white px-3 py-2.5 shadow-[0_1px_0_rgba(15,23,42,0.03)]";
                    if (metric.onSelect) {
                        return (
                            <button
                                key={metric.key}
                                type="button"
                                className={`${shellClass} text-left transition-colors hover:border-alloy-bend-pine/25 hover:bg-alloy-bend-pine/[0.03]`}
                                onClick={metric.onSelect}
                                data-testid={`${testId}-${metric.key}`}
                            >
                                {body}
                            </button>
                        );
                    }
                    return (
                        <div key={metric.key} className={shellClass} data-testid={`${testId}-${metric.key}`}>
                            {body}
                        </div>
                    );
                })}
            </div>
        </ConfigWorkspaceCard>
    );
}
