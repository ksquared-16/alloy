"use client";

/**
 * THE WORKSPACE'S READS — one hook shape, one fetch per section, no client arithmetic.
 *
 * Every Financials section reads a server projection that has already applied the operator's
 * rights, the site filter and the location contract, and has already composed whatever money
 * figures it reports. The client's entire job is to hold the response.
 *
 * That is why these hooks return the payload untouched: a hook that "just totalled the rows"
 * would put a second financial answer in the browser, where nothing can certify it.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createGenerationGate } from "@/lib/financials/workspace/latestResponseWins";

import type { FinancialActivityFeed } from "@/lib/financials/workspace/resolveFinancialActivity";
import type { FinancialPaymentFlow } from "@/lib/financials/workspace/resolveFinancialPaymentFlow";
import type { FinancialPositionCohort } from "@/lib/financials/workspace/resolveFinancialPosition";
import type { FinancialSubjectCohort } from "@/lib/financials/workspace/resolveFinancialSubjects";

export type FinancialsReadState<T> = {
    data: T | null;
    loading: boolean;
    error: string | null;
    /** Re-read committed truth. Called after an action commits — never optimistic. */
    refresh: () => Promise<void>;
};

/** One money-related figure, exactly as the metric engine resolved it. */
export type FinancialsOverviewMetric = {
    metric_key: string;
    label: string;
    format: string;
    value: number | null;
    formatted_value: string;
    window: string;
    window_start: string;
    window_end: string;
    computed_at: string;
    sources: readonly string[];
    meta?: Record<string, unknown>;
};

export type FinancialsOverviewMetrics = {
    window: string;
    site_location_id: string | null;
    metrics: FinancialsOverviewMetric[];
};

function useFinancialsRead<T>(path: string, siteLocationId: string, enabled: boolean, failure: string): FinancialsReadState<T> {
    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState(enabled);
    const [error, setError] = useState<string | null>(null);
    /*
     * ── LATEST RESPONSE WINS ───────────────────────────────────────────────────────────────────
     *
     * Two reads are now in flight independently and the list no longer waits for both, so an older
     * response can return after a newer one. Without a generation token, changing the site filter
     * from A to B and back — or simply a slow A and a fast B — lets A's households and A's money
     * land on top of B's, and the screen then shows one site's figures under another site's name.
     *
     * Every response checks that its own request is still the current one before it writes
     * anything. A superseded response is dropped entirely: it must not set data, must not set an
     * error, and must not clear the loading flag that the newer request is still holding.
     */
    const gate = useRef(createGenerationGate());

    const load = useCallback(async () => {
        if (!enabled) return;
        const current = gate.current.begin();
        setLoading(true);
        try {
            const query = siteLocationId ? `?site_location_id=${encodeURIComponent(siteLocationId)}` : "";
            const res = await fetch(`${path}${query}`, { credentials: "include" });
            const json = (await res.json()) as { ok?: boolean; error?: string } & T;
            if (!current()) return;
            if (!res.ok || json.ok === false) {
                setData(null);
                setError(json.error ?? failure);
                return;
            }
            setData(json);
            setError(null);
        } catch (e) {
            if (!current()) return;
            setData(null);
            setError(e instanceof Error ? e.message : failure);
        } finally {
            if (current()) setLoading(false);
        }
    }, [path, siteLocationId, enabled, failure]);

    useEffect(() => {
        void load();
    }, [load]);

    return { data, loading, error, refresh: load };
}

/**
 * `enabled` is how a section pays for its own read. Overview does not fetch the activity feed,
 * and Activity does not resolve seven metrics — a workspace that loaded every section's data on
 * open would make the cheapest surface pay for the most expensive one.
 */
export function useFinancialsPosition(siteLocationId: string, enabled: boolean) {
    return useFinancialsRead<FinancialPositionCohort>(
        "/api/admin/financials/position",
        siteLocationId,
        enabled,
        "The financial position could not be loaded.",
    );
}

/**
 * WHO HAS AN ACCOUNT, separately from what their money is doing.
 *
 * Accounts joins this with the position cohort rather than deriving its rail from posted rows, so a
 * household with no transaction yet is still listed. The two reads stay separate on purpose: only
 * one of them is allowed to report money, and a single endpoint returning both would put the
 * temptation to compute a figure from identity in reach.
 */
export function useFinancialsSubjects(siteLocationId: string, enabled: boolean) {
    return useFinancialsRead<FinancialSubjectCohort>(
        "/api/admin/financials/subjects",
        siteLocationId,
        enabled,
        "Household accounts could not be loaded.",
    );
}

export function useFinancialsPaymentFlow(siteLocationId: string, enabled: boolean) {
    return useFinancialsRead<FinancialPaymentFlow>(
        "/api/admin/financials/payment-flow",
        siteLocationId,
        enabled,
        "Payments could not be loaded.",
    );
}

export function useFinancialsActivity(siteLocationId: string, enabled: boolean) {
    return useFinancialsRead<FinancialActivityFeed>(
        "/api/admin/financials/activity",
        siteLocationId,
        enabled,
        "Financial activity could not be loaded.",
    );
}

export function useFinancialsOverviewMetrics(siteLocationId: string, enabled: boolean) {
    return useFinancialsRead<FinancialsOverviewMetrics>(
        "/api/admin/financials/overview-metrics",
        siteLocationId,
        enabled,
        "Financial metrics could not be resolved.",
    );
}
