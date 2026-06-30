"use client";

import type { TuitionReadiness } from "@/lib/commercial/tuitionRates";

type Props = {
    readiness: TuitionReadiness;
    scopeLabel: string;
};

/**
 * Config Runtime primitive — readiness bar for a configuration grid.
 * Shows % complete, configured, not-offered, and missing counts.
 */
export function ConfigReadinessCard({ readiness, scopeLabel }: Props) {
    const { total, configured, notOffered, missing, percentComplete } = readiness;

    const color =
        percentComplete === 100
            ? "bg-pine-500"
            : percentComplete >= 60
              ? "bg-yellow-400"
              : "bg-red-400";

    return (
        <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-2">
            <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">
                    Readiness — {scopeLabel}
                </span>
                <span className="text-sm font-semibold text-gray-900">{percentComplete}%</span>
            </div>

            <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
                <div
                    className={`h-full rounded-full transition-all ${color}`}
                    style={{ width: `${percentComplete}%` }}
                />
            </div>

            <div className="flex gap-4 text-xs text-gray-500">
                <span>
                    <span className="font-medium text-pine-600">{configured}</span> configured
                </span>
                <span>
                    <span className="font-medium text-gray-400">{notOffered}</span> not offered
                </span>
                <span>
                    <span className="font-medium text-red-500">{missing}</span> missing
                </span>
                <span className="ml-auto text-gray-400">{total} total cells</span>
            </div>
        </div>
    );
}
