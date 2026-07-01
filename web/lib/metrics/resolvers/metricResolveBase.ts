import type { MetricResolveContext, MetricTimeWindowKey, ResolvedMetricValue } from "@/lib/metrics/types";
import { resolveMetricTimeWindowBounds } from "@/lib/metrics/timeWindow";

export function buildMetricResultBase(
    ctx: MetricResolveContext,
    partial: Pick<ResolvedMetricValue, "key" | "label" | "format" | "sources">,
    now: Date
): Omit<ResolvedMetricValue, "value" | "formattedValue" | "meta"> {
    const { windowStart, windowEnd } = resolveMetricTimeWindowBounds(ctx.window, now);
    return {
        key: partial.key,
        label: partial.label,
        format: partial.format,
        window: ctx.window,
        windowStartIso: windowStart.toISOString(),
        windowEndIso: windowEnd.toISOString(),
        computedAtIso: now.toISOString(),
        sources: partial.sources,
        resolveMode: ctx.mode ?? "live",
    };
}

export function defaultWindowForMetric(defaultWindow: MetricTimeWindowKey): MetricTimeWindowKey {
    return defaultWindow;
}
