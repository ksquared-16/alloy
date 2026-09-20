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

    /*
     * ── THE WORK VIEW TOTALS ENDPOINT (P0-7.6 / WU-03) ──
     *
     * /api/admin/queue-view-totals emitted ONE number, `total`, and that number is now the product's
     * completion owner: measured deployed it is ~1,934ms, and WU-03's final authoritative mutation
     * lands ~11ms after it returns. A single total cannot say WHICH of its phases costs that, and
     * the endpoint has several candidates that need entirely different repairs — a duplicated
     * population read, two database enrichments the composer already gets free from maintained
     * facts, and a per-child-view membership projection that fans out with configuration.
     *
     * Named here rather than in a second header so there is one Server-Timing authority for this
     * route family. Durations only; no ids, no tenant, no query shape.
     */
    /** `loadAdminRouteGate` — authorization. */
    qvt_gate?: number;
    /** Record-scope constraints + viewer timezone, resolved concurrently. */
    qvt_scope?: number;
    /** Work-unit access check + department metadata, memoized per request. */
    qvt_access?: number;
    /** All child-grain lenses, each a FULL membership projection, run concurrently. */
    qvt_child_counts?: number;
    /** `loadWorkUnitProcessPopulation` — the read the document composer has already performed. */
    qvt_population?: number;
    /** Effective-enrollment-stage attach (a DATABASE read on this path). */
    qvt_epp?: number;
    /** Active-tour-fact attach (also a database read on this path). */
    qvt_tours?: number;
    /** `aggregateWorkViewTotals` — pure, zero queries. */
    qvt_aggregate?: number;
};

/**
 * Cardinalities, emitted as `desc` markers rather than durations.
 *
 * A per-view marginal cost cannot be derived from durations alone: `qvt_child_counts` of 900ms
 * means something very different for one configured child lens than for five. These say how many
 * of each kind the request actually evaluated, so fixed setup and per-view cost can be separated
 * without hardcoding any assumption about today's configured view set.
 */
export type QueueServerTimingCounts = {
    /** Distinct (workUnitId, queueKey) lanes in the request. */
    groups?: number;
    /** Configured views requested, after filtering to the ones this work unit publishes. */
    views?: number;
    /** Of those, evaluated at child grain (one membership projection each). */
    child_views?: number;
    /** Of those, evaluated over the opportunity/process population. */
    lane_views?: number;
    /** Of those, refused — grain did not resolve. These must stay UNKNOWN, never zero. */
    unknown_views?: number;
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
    "qvt_gate",
    "qvt_scope",
    "qvt_access",
    "qvt_child_counts",
    "qvt_population",
    "qvt_epp",
    "qvt_tours",
    "qvt_aggregate",
];

const COUNT_ORDER: Array<keyof QueueServerTimingCounts> = [
    "groups",
    "views",
    "child_views",
    "lane_views",
    "unknown_views",
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
    counts?: QueueServerTimingCounts;
}): string {
    const parts: string[] = [];
    for (const key of METRIC_ORDER) {
        const v = input.metrics[key];
        if (isEmittableDuration(v)) {
            // Round to 0.1ms; Server-Timing `dur` is milliseconds.
            parts.push(`${key};dur=${Math.round(v * 10) / 10}`);
        }
    }
    for (const key of COUNT_ORDER) {
        const v = input.counts?.[key];
        // A count of ZERO is a measurement ("no child lenses were configured"), not an absence, so
        // it is emitted. Only a genuinely missing count is omitted.
        if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
            parts.push(`${key};desc="${Math.round(v)}"`);
        }
    }
    if (typeof input.cacheHit === "boolean") {
        parts.push(`cache;desc="${input.cacheHit ? "hit" : "miss"}"`);
    }
    return parts.join(", ");
}
