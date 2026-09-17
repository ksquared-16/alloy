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

import { cache } from "react";

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
    /** The layout's own wall time. It no longer composes, so this is route-meta plus its own render. */
    layout_total_ms: number;

    // ── PAGE SEGMENT — the boundary that actually composes (Slice 12A) ───────────────────────────
    /** Wall-clock epoch at page entry — subtract `layout_entry_epoch_ms` for the layout→page gap. */
    page_entry_epoch_ms: number;
    /**
     * The REAL awaited `composeProvisioningAnswerForRoute` duration, measured where it happens.
     *
     * Until Slice 12A this was a literal `0` emitted by the layout, which had stopped composing —
     * a precise, confident, wrong number for the single most expensive operation on the route.
     */
    compose_wall_ms: number;
    /** Whether the PAGE actually produced an answer to seed (a gate failure / error terminal → false). */
    seeded: boolean;
    /** The page segment's whole wall time, compose included. */
    page_total_ms: number;

    /**
     * The compose's own internal sections, surfaced rather than re-timed.
     *
     * `composeWorkUnitProvisioningAnswer` has always carried `ProvisioningTimings`; it simply never
     * reached the document, so no cold-load harness could see inside the compose. These are those
     * numbers, verbatim — scattering a second set of timers over the same code would have created
     * two authorities that can disagree, which is the defect this slice exists to remove.
     */
    /**
     * The compose's own `total_ms`, available from BOTH composers.
     *
     * A contextual answer measures only this, so it is carried separately from `compose_sections`:
     * the sections being null means "this composer has no breakdown", not "the breakdown was zero".
     */
    compose_total_ms: number | null;

    compose_sections: {
        authorization_ms: number;
        work_unit_ms: number;
        configuration_ms: number;
        presentation_ms: number;
        records_ms: number;
        projection_ms: number;
        composition_ms: number;
        total_ms: number;
        /** Named sub-spans inside composition, when the compose recorded any. */
        spans?: Record<string, number>;
    } | null;

    /**
     * THE OUTER COMPOSE'S OWN AWAITS (P0-7.6 / Slice 12C).
     *
     * Slice 12B measured `compose_wall_ms` − the inner composer's `total_ms` at ~3,869 ms median and
     * called it a PRELUDE. Source tracing for this slice shows that name was wrong: the gap is work
     * on BOTH sides of the inner composer. `composeProvisioningAnswerForRoute` has exactly three
     * awaits —
     *
     *   route_identity_ms   BEFORE  — `resolveWorkUnitRouteIdentity` (the route gate + the slug→unit read)
     *   inner_compose_ms            — the outer view of `composeWorkUnitProvisioningAnswer`
     *   card_producers_ms   AFTER   — `projectFocusPanelCardProducers`, which performs its own DB reads
     *
     * — and the other two steps (`createAdminClient`, `documentActorFromAdminGate`) are synchronous
     * local derivation, timed here only so that "it is not those" is measured rather than assumed.
     *
     * Reported alongside, never instead of, `compose_wall_ms` and the inner `total_ms`, which remain
     * the authoritative outer boundaries. Whatever these spans do not explain stays unattributed.
     */
    route_compose_spans: {
        route_identity_ms: number;
        admin_client_ms: number;
        document_actor_ms: number;
        inner_compose_ms: number;
        /** Null when the answer was not operational, so the producers step genuinely did not run. */
        card_producers_ms: number | null;
    } | null;

    /**
     * When `focusPanelSummaryDoc` became available, measured from compose start (P0-7.6 item 13).
     *
     * DIAGNOSTIC ONLY. This slice does not decouple, flush or stream the published composition; it
     * only answers how early it *could* be available if a later slice did.
     */
    composition_ready_ms: number | null;
};

/**
 * THE ONE TIMING PAYLOAD FOR THIS ROUTE — collected across two server boundaries, emitted once.
 *
 * The layout and the page are separate server components with no prop channel between them (the
 * page arrives as `children`), and both hold numbers the other cannot see. Rather than emit two
 * script tags that a consumer must reconcile — the shape that let a stale layout field survive as an
 * authority for work it no longer did — both write into one request-scoped collector and the PAGE
 * emits it, because the page is the boundary that finishes last and owns the compose.
 *
 * `cache()` is the codebase's existing request-scoping mechanism (see `resolveWorkUnitRouteIdentity`),
 * so the collector is per-request and needs no global.
 */
export const routeTimingCollector = cache((): { marks: Partial<RouteTimingMarks> } => ({ marks: {} }));

/** Record one boundary's marks. Cheap and inert when the flag is off. */
export function recordRouteTiming(partial: Partial<RouteTimingMarks>): void {
    if (!routeTimingEnabled()) return;
    Object.assign(routeTimingCollector().marks, partial);
}

/**
 * The collected payload, or null when the flag is off or nothing was recorded.
 *
 * Returns what was ACTUALLY recorded. A boundary that did not run contributes no field, and the
 * consumer sees its absence rather than a zero that reads like a measurement.
 */
export function collectedRouteTiming(): Partial<RouteTimingMarks> | null {
    if (!routeTimingEnabled()) return null;
    const { marks } = routeTimingCollector();
    return Object.keys(marks).length > 0 ? marks : null;
}

/** Time a promise without changing its result or its rejection behaviour. */
export async function timedSpan<T>(promise: Promise<T>): Promise<[T, number]> {
    const started = performance.now();
    const value = await promise;
    return [value, performance.now() - started];
}
