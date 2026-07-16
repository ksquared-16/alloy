"use client";

import type { ConfigGlanceMetric } from "@/components/adminV2/settings/configurationRuntime/workspace/configWorkspaceTypes";
import { ConfigWorkspaceCard } from "@/components/adminV2/settings/configurationRuntime/workspace/configWorkspaceTypes";

/**
 * Compact operational glance — utilization / inventory metrics, each optionally a link.
 * Prefer one dense strip over large sparse cards.
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
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {metrics.map((metric) => {
                    const body = (
                        <>
                            <span className="config-typo-sublabel block">{metric.label}</span>
                            <span className="mt-0.5 block text-base font-semibold text-alloy-midnight">
                                {metric.value}
                            </span>
                            {metric.hint ?
                                <span className="config-typo-meta mt-0.5 block">{metric.hint}</span>
                            :   null}
                        </>
                    );
                    if (metric.onSelect) {
                        return (
                            <button
                                key={metric.key}
                                type="button"
                                className="rounded-lg border border-alloy-forge/10 px-2.5 py-2 text-left hover:bg-alloy-stone/10"
                                onClick={metric.onSelect}
                                data-testid={`${testId}-${metric.key}`}
                            >
                                {body}
                            </button>
                        );
                    }
                    return (
                        <div
                            key={metric.key}
                            className="rounded-lg border border-alloy-forge/10 px-2.5 py-2"
                            data-testid={`${testId}-${metric.key}`}
                        >
                            {body}
                        </div>
                    );
                })}
            </div>
        </ConfigWorkspaceCard>
    );
}
