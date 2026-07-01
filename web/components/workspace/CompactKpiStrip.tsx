"use client";

/**
 * Compact, glanceable KPI/status strip shared by operator workspaces (Processing,
 * Communications). One short row of chips — semantic dot + value + label — instead of
 * tall decorative cards. Colors come from the platform KPI semantics
 * (`kpiSemantics.ts`), never module-specific decoration.
 *
 * Presentation only: callers compute values from real/derived data and pass them in.
 */

import type { HTMLAttributes } from "react";
import { kpiDotClass, kpiValueClass, type KpiState } from "./kpiSemantics";

export interface CompactKpiItem {
    key?: string;
    label: string;
    value: string;
    state?: KpiState;
}

export default function CompactKpiStrip({
    items,
    loading = false,
    ariaLabel = "Status",
    ...rest
}: {
    items: CompactKpiItem[];
    loading?: boolean;
    ariaLabel?: string;
} & HTMLAttributes<HTMLDivElement>) {
    if (items.length === 0) return null;
    return (
        <div
            className="w-full shrink-0 border-b border-alloy-stone/12 bg-gradient-to-b from-alloy-stone/[0.05] to-white px-4 py-1.5"
            data-kpi-strip="true"
            role="group"
            aria-label={ariaLabel}
            {...rest}
        >
            <div className="flex flex-wrap items-center gap-1.5">
                {items.map((it) => (
                    <div
                        key={it.key ?? it.label}
                        className="inline-flex items-center gap-1.5 rounded-md border border-alloy-stone/15 bg-white px-2 py-1 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
                        data-kpi-item={it.key ?? it.label}
                    >
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${kpiDotClass(it.state)}`} aria-hidden />
                        {loading ? (
                            <span className="h-3 w-5 animate-pulse rounded bg-alloy-stone/60" aria-hidden />
                        ) : (
                            <span className={`text-[13px] font-semibold leading-none tabular-nums ${kpiValueClass(it.state)}`}>
                                {it.value}
                            </span>
                        )}
                        <span className="whitespace-nowrap text-[11px] leading-none text-alloy-midnight/55">{it.label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
