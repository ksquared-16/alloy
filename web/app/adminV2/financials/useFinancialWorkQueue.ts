"use client";

/**
 * ONE READ, FEEDING EVERY NUMBER IN THE WORKSPACE.
 *
 * The Overview tiles, the section health band and the queue itself all come from this single fetch
 * of `/api/admin/financials/work-queue`. That is deliberate: a workspace whose tile counts come from
 * one query and whose list comes from another is a workspace that will eventually show 7 above a
 * list of 6, and no operator can be expected to reconcile that. The counts the API returns are
 * derived from the very rows it returned.
 */

import { useCallback, useEffect, useState } from "react";

import type { FinancialWorkQueue } from "@/lib/financials/workspace/resolveFinancialWorkQueue";

export type FinancialWorkQueueState = {
    data: FinancialWorkQueue | null;
    loading: boolean;
    error: string | null;
    /** Re-read committed truth. Called after an action commits — never optimistic. */
    refresh: () => Promise<void>;
};

export function useFinancialWorkQueue(siteLocationId: string): FinancialWorkQueueState {
    const [data, setData] = useState<FinancialWorkQueue | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const query = siteLocationId ? `?site_location_id=${encodeURIComponent(siteLocationId)}` : "";
            const res = await fetch(`/api/admin/financials/work-queue${query}`, { credentials: "include" });
            const json = (await res.json()) as { ok?: boolean; error?: string } & FinancialWorkQueue;
            if (!res.ok || json.ok === false) {
                setData(null);
                setError(json.error ?? "Financial work could not be loaded.");
                return;
            }
            setData(json);
            setError(null);
        } catch (e) {
            setData(null);
            setError(e instanceof Error ? e.message : "Financial work could not be loaded.");
        } finally {
            setLoading(false);
        }
    }, [siteLocationId]);

    useEffect(() => {
        void load();
    }, [load]);

    return { data, loading, error, refresh: load };
}
