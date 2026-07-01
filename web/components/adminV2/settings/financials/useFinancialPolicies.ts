"use client";

import { useCallback, useEffect, useState } from "react";
import type { FinancialPolicyRow } from "@/lib/financials/policies/financialPolicyTypes";

/**
 * Loader + thin write hook for Financial Policies (Commercial Model, Slice C).
 * GET lists; create/version/retire/void POST to the role-gated route. All
 * supersede/versioning discipline lives server-side; configuration only.
 */
const URL = "/api/admin/financial/policies";

async function postJson(body: Record<string, unknown>): Promise<unknown> {
    const res = await fetch(URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
    return json;
}

export function useFinancialPolicies() {
    const [policies, setPolicies] = useState<FinancialPolicyRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(URL, { credentials: "include" });
            const json = (await res.json()) as { policies?: FinancialPolicyRow[]; error?: string };
            if (!res.ok) throw new Error(json.error ?? `Policies failed (${res.status})`);
            setPolicies(json.policies ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load financial policies");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const run = useCallback(
        async (body: Record<string, unknown>): Promise<void> => {
            setBusy(true);
            try {
                await postJson(body);
                await refresh();
            } finally {
                setBusy(false);
            }
        },
        [refresh],
    );

    return {
        policies,
        loading,
        error,
        busy,
        refresh,
        createPolicy: (body: Record<string, unknown>) => run({ action: "create", ...body }),
        versionPolicy: (body: Record<string, unknown>) => run({ action: "version", ...body }),
        retirePolicy: (body: Record<string, unknown>) => run({ action: "retire", ...body }),
        voidPolicy: (id: string) => run({ action: "void", id }),
    };
}
