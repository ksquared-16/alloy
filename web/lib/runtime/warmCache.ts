"use client";

/**
 * Shared warm-cache primitive — the Runtime lifecycle for operational workspaces, extracted from
 * FOUR repeated implementations (Processing queue, Processing forms, Work Items tasks, Operational
 * Intelligence, and the family-communication workspace). Each had independently grown the SAME shape:
 *
 *   - a module-level cache keyed by scope,
 *   - a single in-flight request per key (concurrent consumers dedupe),
 *   - stale-while-revalidate freshness,
 *   - a snapshot getter + a subscribe seam (for `useSyncExternalStore` / effects),
 *   - a `warm({ force })` that a surface arms on nav intent so it opens with NO load.
 *
 * This is NOT a new abstraction invented up front — it is the convergent design those migrations
 * produced, lifted once so the bespoke copies can be replaced by one implementation. A surface stays a
 * "Runtime consumer" by (1) warming the exact entries it reads on nav intent and (2) reading them
 * warm-first through the returned accessor.
 *
 * Singleton caches (one global entry, e.g. the Processing queue) pass a constant `keyOf`; keyed caches
 * (per scope/filter, e.g. tasks by filter or OI by site|window) derive the key from their params.
 */

export type WarmCacheEntryState<V> = {
    data: V | null;
    fetchedAt: number | null;
    error: string | null;
};

export type WarmCacheResult<V> = {
    data: V | null;
    error: string | null;
};

export type WarmCache<P, V> = {
    /** The cached value for a scope, or null. */
    get: (params: P) => V | null;
    /** Full `{ data, fetchedAt, error }` for a scope — for `useSyncExternalStore` snapshots. */
    getState: (params: P) => WarmCacheEntryState<V>;
    /** Seed a scope's value directly (e.g. from an optimistic mutation) without a fetch. */
    set: (params: P, data: V) => void;
    /** Notified on every cache write. */
    subscribe: (listener: () => void) => () => void;
    /**
     * Warm-first + deduped. Reuses a fresh entry (no fetch); otherwise shares the single in-flight
     * request for the key. `{ force: true }` bypasses cache freshness (never the in-flight dedupe) to
     * revalidate after a mutation.
     */
    warm: (params: P, opts?: { force?: boolean }) => Promise<WarmCacheResult<V>>;
    /** Drop one scope's entry (or all when no params) so the next read refetches. */
    invalidate: (params?: P) => void;
    /** Test-only reset. */
    reset: () => void;
};

export function createWarmCache<P, V>(config: {
    /** Stable string key per scope. Return a constant for a singleton cache. Null → uncacheable. */
    keyOf: (params: P) => string | null;
    /** The network read for a scope. Throwing (or rejecting) is surfaced as `error`. */
    fetcher: (params: P) => Promise<V>;
    /** Freshness window; a fresh entry is reused without fetching. Default 20s. */
    staleMs?: number;
    /** Error copy when the fetcher throws without a message. */
    errorMessage?: string;
}): WarmCache<P, V> {
    const staleMs = config.staleMs ?? 20_000;
    const errorMessage = config.errorMessage ?? "Failed to load";

    const cache = new Map<string, { data: V; fetchedAt: number }>();
    const inflight = new Map<string, Promise<WarmCacheResult<V>>>();
    const listeners = new Set<() => void>();

    const notify = () => listeners.forEach((l) => l());

    const getState = (params: P): WarmCacheEntryState<V> => {
        const key = config.keyOf(params);
        const entry = key ? cache.get(key) : null;
        return { data: entry?.data ?? null, fetchedAt: entry?.fetchedAt ?? null, error: null };
    };

    const runInflight = (key: string, params: P): Promise<WarmCacheResult<V>> => {
        const existing = inflight.get(key);
        if (existing) return existing;
        const promise = (async (): Promise<WarmCacheResult<V>> => {
            try {
                const data = await config.fetcher(params);
                cache.set(key, { data, fetchedAt: Date.now() });
                notify();
                return { data, error: null };
            } catch (e) {
                return { data: cache.get(key)?.data ?? null, error: e instanceof Error ? e.message : errorMessage };
            } finally {
                inflight.delete(key);
            }
        })();
        inflight.set(key, promise);
        return promise;
    };

    return {
        get: (params) => {
            const key = config.keyOf(params);
            return key ? cache.get(key)?.data ?? null : null;
        },
        getState,
        set: (params, data) => {
            const key = config.keyOf(params);
            if (!key) return;
            cache.set(key, { data, fetchedAt: Date.now() });
            notify();
        },
        subscribe: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        warm: async (params, opts) => {
            // `warm` is only ever invoked from client handlers/effects (nav intent, mount), never
            // during SSR render, so no window guard is needed — and adding one would break node tests
            // that mock `fetch`.
            const key = config.keyOf(params);
            if (!key) return { data: null, error: null };
            if (!opts?.force) {
                const entry = cache.get(key);
                if (entry && Date.now() - entry.fetchedAt <= staleMs) return { data: entry.data, error: null };
            }
            return runInflight(key, params);
        },
        invalidate: (params) => {
            if (params === undefined) {
                cache.clear();
            } else {
                const key = config.keyOf(params);
                if (key) cache.delete(key);
            }
            notify();
        },
        reset: () => {
            cache.clear();
            inflight.clear();
            listeners.clear();
        },
    };
}
