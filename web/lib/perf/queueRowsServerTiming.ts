/**
 * Server-Timing header for the Work Unit queue endpoints (Trust Closure — server critical path).
 *
 * The queue rows/summaries services already capture a full timing breakdown (auth, prep, queue-def
 * load, operational-day resolution, base query, count, status defs, enrichment, serialization). It is
 * logged server-side; this surfaces it as a standard `Server-Timing` response header so a browser
 * trace can correlate client and server time on the SAME request without extra round-trips.
 *
 * PII-safe by construction: only durations and a cache hit/miss flag are emitted — never ids, SQL,
 * record values, tenant identifiers, or query signatures.
 */

/** Time metrics (ms). Undefined/negative values are omitted. */
export type QueueServerTimingMetrics = {
    auth?: number;
    prep?: number;
    load_def?: number;
    operational_day?: number;
    base_query?: number;
    count?: number;
    status_defs?: number;
    enrichment?: number;
    serialize?: number;
    service_total?: number;
    total?: number;
};

const METRIC_ORDER: Array<keyof QueueServerTimingMetrics> = [
    "auth",
    "prep",
    "load_def",
    "operational_day",
    "base_query",
    "count",
    "status_defs",
    "enrichment",
    "serialize",
    "service_total",
    "total",
];

function isEmittableDuration(n: unknown): n is number {
    return typeof n === "number" && Number.isFinite(n) && n >= 0;
}

/**
 * Build a `Server-Timing` header value. `cacheHit` becomes a `cache;desc="hit|miss"` marker. Returns
 * an empty string when nothing is emittable (callers should then omit the header).
 */
export function buildQueueRowsServerTimingHeader(input: {
    metrics: QueueServerTimingMetrics;
    cacheHit?: boolean;
}): string {
    const parts: string[] = [];
    for (const key of METRIC_ORDER) {
        const v = input.metrics[key];
        if (isEmittableDuration(v)) {
            // Round to 0.1ms; Server-Timing `dur` is milliseconds.
            parts.push(`${key};dur=${Math.round(v * 10) / 10}`);
        }
    }
    if (typeof input.cacheHit === "boolean") {
        parts.push(`cache;desc="${input.cacheHit ? "hit" : "miss"}"`);
    }
    return parts.join(", ");
}
