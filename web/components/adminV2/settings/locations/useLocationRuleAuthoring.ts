"use client";

import { useCallback, useState } from "react";

/**
 * Client hook for versioned Locations operational-rule authoring (Operational
 * Configuration V1, Phase 3). Thin POST wrappers over the role-gated config-rule
 * authoring routes; all supersede/versioning discipline lives server-side. On
 * success it triggers the read loader's `refresh` so timelines re-render from
 * authoritative state. No write logic beyond shaping the request.
 */

const BASE = "/api/admin/operational-config";
const URLS = {
    capacity: `${BASE}/capacity-rules`,
    ratio: `${BASE}/ratio-rules`,
    operating: `${BASE}/operating-windows`,
    schedule: `${BASE}/schedule-rules`,
} as const;

export type ConfigRuleKind = keyof typeof URLS;

async function postJson(url: string, body: Record<string, unknown>): Promise<unknown> {
    const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
    return json;
}

export type LocationRuleAuthoring = ReturnType<typeof useLocationRuleAuthoring>;

export function useLocationRuleAuthoring(refresh: () => Promise<void> | void) {
    const [busy, setBusy] = useState(false);

    const run = useCallback(
        async (kind: ConfigRuleKind, body: Record<string, unknown>): Promise<void> => {
            setBusy(true);
            try {
                await postJson(URLS[kind], body);
                await refresh();
            } finally {
                setBusy(false);
            }
        },
        [refresh],
    );

    return {
        busy,
        create: (kind: ConfigRuleKind, body: Record<string, unknown>) => run(kind, { action: "create", ...body }),
        version: (kind: ConfigRuleKind, body: Record<string, unknown>) => run(kind, { action: "version", ...body }),
        retire: (kind: ConfigRuleKind, body: Record<string, unknown>) => run(kind, { action: "retire", ...body }),
        void: (kind: ConfigRuleKind, id: string) => run(kind, { action: "void", id }),
    };
}
