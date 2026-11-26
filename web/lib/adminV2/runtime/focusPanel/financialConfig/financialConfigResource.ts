"use client";

import type { FinancialConfigApiResponse } from "./financialConfigTypes";

/**
 * The ONE place the opportunity financial config is loaded.
 *
 * Three consumers wanted this resource — `useFinancialConfig`, `SchedulingCard` and
 * `AssignmentProposalControls` — and each issued its own `fetch`. The hook had no dedupe, so
 * two of them mounting together produced a byte-identical
 * `GET /api/admin/financial-config/opportunity/<id>` twice. Observed on Firefly's family
 * subject while opening the Focus Panel edit path.
 *
 * This is the same shape already corrected for form delivery and tour schedule: a shared
 * resource with no shared loader. In-flight requests are shared and a short TTL keeps a
 * remount from re-asking, which is what makes concurrent AND sequential consumers collapse to
 * one request. Failures are never cached.
 */
const TTL_MS = 30_000;

type Entry = { promise: Promise<FinancialConfigApiResponse>; startedAt: number };
const cache = new Map<string, Entry>();

function isFresh(entry: Entry, now: number): boolean {
    return now - entry.startedAt < TTL_MS;
}

/** Load (or join) the financial config for an opportunity. Throws on HTTP failure. */
export function loadFinancialConfig(
    opportunityId: string,
    now: number = Date.now(),
): Promise<FinancialConfigApiResponse> {
    const id = opportunityId.trim();
    const existing = cache.get(id);
    if (existing && isFresh(existing, now)) return existing.promise;

    const promise = fetch(`/api/admin/financial-config/opportunity/${id}`, { credentials: "include" })
        .then((res) => {
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res.json() as Promise<FinancialConfigApiResponse>;
        })
        .catch((err: unknown) => {
            // Never cache a failure — the next consumer must be able to retry.
            if (cache.get(id)?.promise === promise) cache.delete(id);
            throw err;
        });

    cache.set(id, { promise, startedAt: now });
    return promise;
}

/** Retire the entry after a mutation that changes financial configuration. */
export function invalidateFinancialConfig(opportunityId: string): void {
    cache.delete(opportunityId.trim());
}

/** @internal test seam */
export function clearFinancialConfigForTests(): void {
    cache.clear();
}
