/**
 * Server route timing — the cold-load phases that `ProvisioningTimings` structurally cannot see.
 *
 * `workUnitProvisioningAnswer`'s `timings` starts its clock *inside* the compose, so everything
 * before it is invisible to any client-side budget: the middleware's per-request auth round trip,
 * Next's route-module load on a fresh process, the RSC boot, and the route-identity resolution that
 * `composeProvisioningAnswerForRoute` performs before that clock starts. On a cold process those
 * phases measured LARGER than the compose itself, so a budget built from `timings` alone
 * under-counts TTFB by roughly half and lands the remainder in "unknown".
 *
 * Two transports, because the two halves of the request can't use the same one:
 *   - middleware finishes BEFORE the first byte, so it reports via response headers;
 *   - the layout runs DURING the stream, too late for headers, so it reports via a JSON script tag.
 * Both carry wall-clock epochs, so the consumer can subtract across the two.
 *
 * Off unless `ALLOY_ROUTE_TIMING=1`. Emits ids/durations only — never subject or operator data.
 * NOTE: middleware runs on the Edge runtime, where `process.env` is inlined at BUILD time — the
 * flag must be set for the build, not only for the server process.
 */

export const ROUTE_TIMING_SCRIPT_ID = "__alloy_route_timing";
export const ROUTE_TIMING_HEADER_T0 = "x-alloy-mw-t0";
export const ROUTE_TIMING_HEADER_AUTH_MS = "x-alloy-mw-auth-ms";

export function routeTimingEnabled(): boolean {
    return process.env.ALLOY_ROUTE_TIMING === "1";
}

export type RouteTimingMarks = {
    /** Wall-clock epoch at layout entry — subtract the middleware's `t0` header for the gap. */
    layout_entry_epoch_ms: number;
    /** Route-identity/meta resolve, measured on its own even though it runs concurrently. */
    route_meta_ms: number;
    /** Provisioning compose WALL time — includes the identity resolution that precedes `timings.t0`. */
    compose_wall_ms: number;
    /** Both of the above joined (they run under one `Promise.all`, so this is the max, not the sum). */
    layout_total_ms: number;
    /** Whether this request seeded an answer at all (a deep link resolves to null). */
    seeded: boolean;
};

/** Time a promise without changing its result or its rejection behaviour. */
export async function timedSpan<T>(promise: Promise<T>): Promise<[T, number]> {
    const started = performance.now();
    const value = await promise;
    return [value, performance.now() - started];
}
