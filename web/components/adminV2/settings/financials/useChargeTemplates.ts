"use client";

import { useCallback, useEffect, useState } from "react";
import type { ChargeTemplateRow } from "@/lib/financials/chargeTemplates/chargeTemplateTypes";

/**
 * Loader + thin write hook for Charge Templates (Commercial Model, Slice B).
 * GET lists; create/version/retire/void POST to the role-gated route. All
 * supersede/versioning discipline lives server-side; configuration only.
 */
const URL = "/api/admin/financial/charge-templates";

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

export function useChargeTemplates() {
    const [templates, setTemplates] = useState<ChargeTemplateRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch(URL, { credentials: "include" });
            const json = (await res.json()) as { templates?: ChargeTemplateRow[]; error?: string };
            if (!res.ok) throw new Error(json.error ?? `Charge templates failed (${res.status})`);
            setTemplates(json.templates ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load charge templates");
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
        templates,
        loading,
        error,
        busy,
        refresh,
        createTemplate: (body: Record<string, unknown>) => run({ action: "create", ...body }),
        versionTemplate: (body: Record<string, unknown>) => run({ action: "version", ...body }),
        retireTemplate: (body: Record<string, unknown>) => run({ action: "retire", ...body }),
        voidTemplate: (id: string) => run({ action: "void", id }),
    };
}
