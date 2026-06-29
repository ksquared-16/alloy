"use client";

import { useCallback, useState } from "react";

/**
 * Client hook for versioned rate authoring (Operational Configuration V1, Batch
 * 1). Thin POST wrappers over the role-gated authoring routes; all versioning /
 * supersede discipline lives server-side. On success it triggers the read
 * loader's `refresh` so the timeline re-renders from authoritative state.
 *
 * No write logic is performed here beyond shaping the request — the server is the
 * single source of truth for effective-dated writes.
 */

const PLANS_URL = "/api/admin/financial/rate-plans";
const RULES_URL = "/api/admin/financial/rate-rules";

async function postJson(url: string, body: Record<string, unknown>): Promise<unknown> {
    const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
        throw new Error(json.error ?? `Request failed (${res.status})`);
    }
    return json;
}

export type RateAuthoring = ReturnType<typeof useRateAuthoring>;

export function useRateAuthoring(refresh: () => Promise<void> | void) {
    const [busy, setBusy] = useState(false);

    const run = useCallback(
        async (fn: () => Promise<unknown>) => {
            setBusy(true);
            try {
                const result = await fn();
                await refresh();
                return result;
            } finally {
                setBusy(false);
            }
        },
        [refresh],
    );

    return {
        busy,
        createPlan: (body: Record<string, unknown>) => run(() => postJson(PLANS_URL, { action: "create", ...body })),
        versionPlan: (body: Record<string, unknown>) => run(() => postJson(PLANS_URL, { action: "version", ...body })),
        retirePlan: (body: Record<string, unknown>) => run(() => postJson(PLANS_URL, { action: "retire", ...body })),
        voidPlan: (planId: string) => run(() => postJson(PLANS_URL, { action: "void", plan_id: planId })),
        createRule: (body: Record<string, unknown>) => run(() => postJson(RULES_URL, { action: "create", ...body })),
        versionRule: (body: Record<string, unknown>) => run(() => postJson(RULES_URL, { action: "version", ...body })),
        retireRule: (body: Record<string, unknown>) => run(() => postJson(RULES_URL, { action: "retire", ...body })),
        voidRule: (ruleId: string) => run(() => postJson(RULES_URL, { action: "void", rule_id: ruleId })),
    };
}
