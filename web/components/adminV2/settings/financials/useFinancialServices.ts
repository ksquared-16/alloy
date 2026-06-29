"use client";

import { useCallback, useEffect, useState } from "react";
import type { FinancialService } from "@/lib/financials/services/financialServicesStore";

/**
 * Loader + thin write hook for the Financial Services catalog (Financial
 * Configuration Convergence). GET lists; create/update/set-active POST to the
 * role-gated route, which persists to org_settings.metadata.financials. All
 * validation lives server-side.
 */
export function useFinancialServices() {
    const [services, setServices] = useState<FinancialService[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/admin/financial/services", { credentials: "include" });
            const json = (await res.json()) as { services?: FinancialService[]; error?: string };
            if (!res.ok) throw new Error(json.error ?? `Services failed (${res.status})`);
            setServices(json.services ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load services");
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
                const res = await fetch("/api/admin/financial/services", {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                });
                const json = (await res.json().catch(() => ({}))) as { error?: string };
                if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
                await refresh();
            } finally {
                setBusy(false);
            }
        },
        [refresh],
    );

    return {
        services,
        loading,
        error,
        busy,
        refresh,
        createService: (body: Record<string, unknown>) => run({ action: "create", ...body }),
        updateService: (body: Record<string, unknown>) => run({ action: "update", ...body }),
        setServiceActive: (id: string, isActive: boolean) => run({ action: "set_active", id, is_active: isActive }),
    };
}
