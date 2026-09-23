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
        /**
         * THE PRODUCER-OVERLAP SPANS (P0-7.6 / Slice 12F).
         *
         * `inner_compose_ms` and `card_producers_ms` describe two ADJACENT blocks, which was the
         * whole truth while the producers ran after composition. They now run BESIDE it, so
         * `card_producers_ms` is only the residual join and the producers' real start and duration
         * have no other observer. Without these, a shrunken join block reads as "the producers got
         * faster" when nothing about them changed except when they were started.
         *
         * `overlap_ms` + `tail_ms` reconstruct the producer wall. `producer_invocations` is the
         * acceptance gate, because the matching path must run the producers EXACTLY ONCE and no
         * duration can tell a reuse apart from a fast second run.
         */
        /**
         * THE WU-03 COUNT SEED (P0-7.6).
         *
         * The counts are the product's completion owner: measured deployed, WU-03's final
         * authoritative mutation lands ~11ms after the browser's separate queue-view-totals
         * request returns. The seed computes them inside the document instead, started from the
         * composer's announcement so it overlaps the rest of composition.
         *
         * `join_wait_ms` is the honest price: whatever the document waited AFTER its own work
         * finished. It is published separately from `page_total` precisely so relocating the
         * latency cannot be mistaken for removing it.
         */
        work_view_totals_seed?: {
            /** Compose start → the composer announced the configured count locations. */
            announce_offset_ms: number | null;
            /** The seed's own duration. */
            seed_ms: number | null;
            /** Compose start → seed settled. */
            seed_end_offset_ms: number | null;
            /** Compose start → composition settled. */
            compose_end_offset_ms: number | null;
            /** The part of the seed that ran while composition was still running. */
            overlap_ms: number | null;
            /** ADDED DOCUMENT WAIT: what was left after everything else finished. */
            join_wait_ms: number | null;
            /**
             * 1 when the Work View totals had landed by the commit boundary, 0 when they settle
             * afterwards. Candidate A stopped the frame waiting for them, so `join_wait_ms` is now
             * zero by construction; this is what says whether the values were actually there.
             */
            seed_at_commit?: number | null;
            /** resolved | seed_failed | no_announcement | a specific unavailable reason. */
            outcome: string;
            /** Distinct (work unit, queue key) lanes the seed evaluated. */
            groups: number | null;
            /** Count rows produced. Null when the seed did not resolve — never 0 for unavailable. */
            totals: number | null;
        };
        overlap?: {
            /** Compose start → the composer's subject announcement. */
            announce_offset_ms: number | null;
            /** The speculative participant read. */
            participant_ms: number | null;
            /** The speculative producer run. */
            producers_ms: number | null;
            /** Announcement → speculative run settled. */
            early_total_ms: number | null;
            /** Compose start → speculative run settled. */
            early_end_offset_ms: number | null;
            /** Compose start → composition settled (the same quantity as `inner_compose_ms`). */
            compose_end_offset_ms: number | null;
            /** The part of the speculative run that ran while composition was still running. */
            overlap_ms: number | null;
            /** What was left of the speculative run after composition finished. Clamped at 0. */
            tail_ms: number | null;
            /**
             * Which branch the join took: `used`, `subject_mismatch`, `customer_mismatch`,
             * `early_failed`, `no_announcement` or `not_operational`. Each implies a different
             * repair, so they are never collapsed into a single "not used".
             */
            outcome: string;
            /** MUST be 1 on the matching path. 2 means the early and canonical runs both executed. */
            producer_invocations: number;
            participant_reads: number;
        };
        /**
         * INSIDE the card producers, which Slice 12D measured as the dominant wait (median 2,791 ms).
         *
         * These run CONCURRENTLY under `Promise.allSettled`, so they DO NOT SUM — `card_producers_ms`
         * is approximately the longest of them, not their total. They exist to name the long pole,
         * which decides whether the Slice 12D gate repair is worth its full duration or nothing:
         * the saving is `financials_gate_ms` when Attendance or Health dominates, and zero when the
         * Financials chain does.
         */
        producers?: {
            financials_gate_ms: number | null;
            attendance_ms: number | null;
            health_ms: number | null;
            financials_build_ms: number | null;
            /**
             * Start/end of each producer, from the COMPOSE origin (see `producerClock`).
             *
             * This is what makes the residual tail attributable: the owner is the producer whose
             * `end` is latest, and the tail it owns is `end - compose_end_offset_ms`. Durations
             * cannot answer that, because a late start and a long run look identical in a duration.
             */
            offsets?: Partial<Record<ProducerSpanName, { at: number; end: number }>>;
        };
        /**
         * INSIDE `financials_build_ms`, which Slice 12D measured deployed as the producer long pole
         * (median 2,423 ms — 89 % of `card_producers_ms`).
         *
         * THEY DO NOT SUM, and the first version of this comment said they largely would. That was
         * written before Slice 12E made the branches concurrent and was disproved by the first
         * deployed payload that carried them: the spans total ~2,892 ms inside a
         * `financials_build_ms` of ~1,629 ms. The overlap IS the repair, so a large negative
         * residual here is the instrument agreeing with it, not a fault.
         *
         * `collectible_ms` covers a loop, and `collectible_calls` reports how many round trips that
         * loop made, which is the difference between "one slow read" and "N reads" — two facts that
         * need entirely different repairs and that a single duration cannot tell apart.
         */
        /** The four concurrent Health reads. They DO NOT SUM; `health_ms` is about the slowest. */
        health?: {
            health_facts_ms: number | null;
            health_profile_ms: number | null;
            health_documents_ms: number | null;
            health_contacts_ms: number | null;
        };
        financials?: {
            agreements_ms: number | null;
            members_ms: number | null;
            reductions_ms: number | null;
            charges_ms: number | null;
            config_ms: number | null;
            responsibility_ms: number | null;
            collectible_ms: number | null;
            collectible_calls: number | null;
            payments_ms: number | null;
            payment_views_ms: number | null;
            merchant_ms: number | null;
            payment_setup_ms: number | null;
            payer_candidates_ms: number | null;
            open_collections_ms: number | null;
        };
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


/** The four producer spans, by the names the payload carries. */
type ProducerSpanName = "financials_gate_ms" | "attendance_ms" | "health_ms" | "financials_build_ms";

/**
 * A CLOCK FOR CONCURRENT PRODUCERS.
 *
 * The three card producers run under one `Promise.allSettled`, so their spans OVERLAP and must not
 * be summed — `card_producers_ms` is approximately the longest of them, not their total. This timer
 * records each independently so the LONG POLE can be named, which is the fact that decides whether
 * Slice 12D's gate repair is worth its full duration or nothing at all.
 *
 * Inert when the flag is off: `time()` then returns the caller's promise untouched, adding no clock
 * read and no allocation to the product path.
 */
export function producerClock(originMs?: number): {
    time: <T>(name: ProducerSpanName, run: () => Promise<T>) => Promise<T>;
    spans: () => Partial<Record<ProducerSpanName, number>>;
    offsets: () => Partial<Record<ProducerSpanName, { at: number; end: number }>>;
} {
    const enabled = routeTimingEnabled();
    const out: Partial<Record<ProducerSpanName, number>> = {};
    const off: Partial<Record<ProducerSpanName, { at: number; end: number }>> = {};
    /*
     * THE ORIGIN IS THE COMPOSE'S, NOT THE CLOCK'S (P0-7.6 — producer-tail ownership).
     *
     * Durations alone cannot say who owns the residual tail: three producers that each took 200 ms
     * are indistinguishable from one that started 200 ms late, and only the one still running at
     * composition end is on the critical path. Offsets are therefore measured from the SAME origin
     * the overlap block uses (`tInner`), so `end` is directly comparable to `compose_end_offset_ms`
     * and `early_end_offset_ms` without reconciling two clocks.
     *
     * Falls back to clock creation when no origin is passed, which keeps the spans self-consistent
     * but NOT comparable across blocks — callers that need attribution must pass the origin.
     */
    const origin = originMs ?? (enabled ? performance.now() : 0);
    return {
        time: <T>(name: ProducerSpanName, run: () => Promise<T>): Promise<T> => {
            if (!enabled) return run();
            const started = performance.now();
            // `finally` rather than `then`: a producer that rejects still consumed the time, and
            // `allSettled` will surface the rejection — swallowing it here would hide a real fault.
            return run().finally(() => {
                const ended = performance.now();
                out[name] = Math.round(ended - started);
                off[name] = { at: Math.round(started - origin), end: Math.round(ended - origin) };
            });
        },
        spans: () => out,
        offsets: () => off,
    };
}

/** Merge the producer spans into the request's existing `route_compose_spans`, never replacing it. */
export function recordProducerSpans(
    spans: Partial<Record<ProducerSpanName, number>>,
    offsets?: Partial<Record<ProducerSpanName, { at: number; end: number }>>,
): void {
    if (!routeTimingEnabled() || Object.keys(spans).length === 0) return;
    try {
        const { marks } = routeTimingCollector();
        const existing = marks.route_compose_spans;
        const producers = {
            financials_gate_ms: spans.financials_gate_ms ?? null,
            attendance_ms: spans.attendance_ms ?? null,
            health_ms: spans.health_ms ?? null,
            financials_build_ms: spans.financials_build_ms ?? null,
            ...(offsets ? { offsets } : {}),
        };
        // The outer compose records `route_compose_spans` AFTER the producers finish, so the object
        // may not exist yet. Stashing the producers now and letting the outer record merge would be
        // two writers for one field; instead the partial is created here and the outer call merges
        // into it, because `recordRouteTiming` assigns whole fields.
        marks.route_compose_spans = existing
            ? { ...existing, producers }
            : ({ producers } as never);
    } catch {
        /* diagnostics are never load-bearing */
    }
}

/**
 * A CLOCK FOR THE HEALTH BUILD'S FOUR CONCURRENT READS.
 *
 * `health_ms` measured 559 ms deployed and is the BINDING producer once the Financials gate is
 * removed — yet the card's first-order content is four requirement flags and an emergency-contact
 * count. Four reads run under one `Promise.allSettled`, so they DO NOT SUM and the 559 ms is
 * approximately the slowest of them. Which one decides whether a request-time first-order
 * architecture is viable at all, so it is measured rather than assumed.
 */
export type HealthSpanName = "health_facts_ms" | "health_profile_ms" | "health_documents_ms" | "health_contacts_ms";

export function healthClock(): {
    time: <T>(name: HealthSpanName, run: () => PromiseLike<T>) => Promise<T>;
    spans: () => Partial<Record<HealthSpanName, number>>;
} {
    const enabled = routeTimingEnabled();
    const out: Partial<Record<HealthSpanName, number>> = {};
    return {
        time: <T>(name: HealthSpanName, run: () => PromiseLike<T>): Promise<T> => {
            if (!enabled) return Promise.resolve(run());
            const started = performance.now();
            return Promise.resolve(run()).finally(() => {
                out[name] = Math.round(performance.now() - started);
            });
        },
        spans: () => out,
    };
}

/** Merge the Health spans into the request's `route_compose_spans`, never replacing it. */
export function recordHealthSpans(spans: Partial<Record<HealthSpanName, number>>): void {
    if (!routeTimingEnabled() || Object.keys(spans).length === 0) return;
    try {
        const { marks } = routeTimingCollector();
        const existing = marks.route_compose_spans;
        const health = {
            health_facts_ms: spans.health_facts_ms ?? null,
            health_profile_ms: spans.health_profile_ms ?? null,
            health_documents_ms: spans.health_documents_ms ?? null,
            health_contacts_ms: spans.health_contacts_ms ?? null,
        };
        marks.route_compose_spans = existing ? { ...existing, health } : ({ health } as never);
    } catch {
        /* diagnostics are never load-bearing */
    }
}

/** The Financials build spans, by the names the payload carries. */
export type FinancialsSpanName =
    | "agreements_ms"
    | "members_ms"
    | "reductions_ms"
    | "charges_ms"
    | "config_ms"
    | "responsibility_ms"
    | "collectible_ms"
    | "payments_ms"
    | "payment_views_ms"
    | "merchant_ms"
    | "payment_setup_ms"
    | "payer_candidates_ms"
    | "open_collections_ms";

/**
 * A CLOCK FOR THE FINANCIALS BUILD'S INTERNAL BOUNDARIES.
 *
 * Slice 12D named `financials_build_ms` the producer long pole but could not say what is inside it:
 * one 2,423 ms span over roughly fifteen table reads. Choosing a repair from that label is exactly
 * what Slice 12B did when it called a straddling gap a *prelude*, so this names every awaited
 * boundary first.
 *
 * `count()` exists because one of those boundaries is a LOOP. A duration alone cannot distinguish
 * a single slow query from N round trips, and those want opposite repairs.
 *
 * Inert when the flag is off: `time()` returns the caller's promise untouched.
 */
export function financialsClock(): {
    time: <T>(name: FinancialsSpanName, run: () => PromiseLike<T>) => Promise<T>;
    count: (name: "collectible_calls", n: number) => void;
    spans: () => Partial<Record<FinancialsSpanName | "collectible_calls", number>>;
} {
    const enabled = routeTimingEnabled();
    const out: Partial<Record<FinancialsSpanName | "collectible_calls", number>> = {};
    return {
        /*
         * `PromiseLike`, because several of these boundaries await a Supabase query BUILDER rather
         * than a promise. `Promise.resolve(run())` subscribes to it exactly as `await` would — the
         * query is issued at the same moment, in the same order — and adds only a microtask hop.
         */
        time: <T>(name: FinancialsSpanName, run: () => PromiseLike<T>): Promise<T> => {
            if (!enabled) return Promise.resolve(run());
            const started = performance.now();
            // `finally`, not `then`: a boundary that rejects still consumed the time, and the
            // caller's own catch must still see the rejection.
            return Promise.resolve(run()).finally(() => {
                out[name] = Math.round((out[name] ?? 0) + performance.now() - started);
            });
        },
        count: (name: "collectible_calls", n: number): void => {
            if (!enabled) return;
            out[name] = n;
        },
        spans: () => out,
    };
}

/** Merge the Financials spans into the request's `route_compose_spans`, never replacing it. */
export function recordFinancialsSpans(
    spans: Partial<Record<FinancialsSpanName | "collectible_calls", number>>,
): void {
    if (!routeTimingEnabled() || Object.keys(spans).length === 0) return;
    try {
        const { marks } = routeTimingCollector();
        const existing = marks.route_compose_spans;
        const financials = {
            agreements_ms: spans.agreements_ms ?? null,
            members_ms: spans.members_ms ?? null,
            reductions_ms: spans.reductions_ms ?? null,
            charges_ms: spans.charges_ms ?? null,
            config_ms: spans.config_ms ?? null,
            responsibility_ms: spans.responsibility_ms ?? null,
            collectible_ms: spans.collectible_ms ?? null,
            collectible_calls: spans.collectible_calls ?? null,
            payments_ms: spans.payments_ms ?? null,
            payment_views_ms: spans.payment_views_ms ?? null,
            merchant_ms: spans.merchant_ms ?? null,
            payment_setup_ms: spans.payment_setup_ms ?? null,
            payer_candidates_ms: spans.payer_candidates_ms ?? null,
            open_collections_ms: spans.open_collections_ms ?? null,
        };
        // Same merge discipline as `recordProducerSpans`: the outer compose writes
        // `route_compose_spans` after this runs, and merges into whatever is already here.
        marks.route_compose_spans = existing
            ? { ...existing, financials }
            : ({ financials } as never);
    } catch {
        /* diagnostics are never load-bearing */
    }
}
