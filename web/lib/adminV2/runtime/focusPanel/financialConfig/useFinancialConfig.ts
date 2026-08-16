"use client";

import { useEffect, useState } from "react";
import type { FinancialConfigApiResponse } from "./financialConfigTypes";
import { loadFinancialConfig } from "./financialConfigResource";

type UseFinancialConfigResult = {
    data: FinancialConfigApiResponse | null;
    loading: boolean;
    error: string | null;
};

/**
 * Lazy-fetch tuition rate resolutions for the Financial Configuration card expanded overlay.
 * Only fetches when `open` is true and `opportunityId` is provided.
 *
 * Tuition rates are not available in context.truth — they live in a separate
 * commercial_tuition_rates table and require a server query to resolve.
 */
export function useFinancialConfig(
    opportunityId: string | null,
    open: boolean,
): UseFinancialConfigResult {
    const [data, setData] = useState<FinancialConfigApiResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!open || !opportunityId) return;

        let cancelled = false;
        setLoading(true);
        setError(null);

        loadFinancialConfig(opportunityId)
            .then((payload) => {
                if (!cancelled) setData(payload);
            })
            .catch((err: unknown) => {
                if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [opportunityId, open]);

    return { data, loading, error };
}
