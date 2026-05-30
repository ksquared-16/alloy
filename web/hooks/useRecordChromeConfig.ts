"use client";

import { useEffect, useLayoutEffect, useState } from "react";
import type { RecordActionRow, RecordLayoutRow } from "@/lib/recordChrome/types";
import { dedupeAdminFetchWithTtl } from "@/lib/workspace/workspaceAdminFetchDedupe";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

const RECORD_CHROME_TTL_MS = 1500;

export type RecordChromeEntityKind = "job" | "schedule" | "opportunity" | "person";

/**
 * Fetches record layout + actions for a logical entity (above RRS).
 * `configResolved` becomes true after the first fetch attempt for the current `entityKind` finishes
 * (so callers can avoid rendering classic vs workflow layout before org/global config is known).
 */
export type RecordChromeConfigOptions = {
    /** AdminV2 opportunity drawer bootstrap supplies layout — skip record-layouts/actions fetch. */
    bootstrapSeeded?: boolean;
    seededLayout?: RecordLayoutRow | null;
};

export function useRecordChromeConfig(
    entityKind: RecordChromeEntityKind | null,
    orgScopeKey?: string | null,
    options?: RecordChromeConfigOptions
) {
    const [layout, setLayout] = useState<RecordLayoutRow | null>(null);
    const [actions, setActions] = useState<RecordActionRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [configResolved, setConfigResolved] = useState(() => entityKind == null);

    const bootstrapSeeded = options?.bootstrapSeeded === true;

    useLayoutEffect(() => {
        if (!entityKind) {
            setLayout(null);
            setActions([]);
            setError(null);
            setLoading(false);
            setConfigResolved(true);
            return;
        }
        if (bootstrapSeeded) {
            setLayout(options?.seededLayout ?? null);
            setActions([]);
            setError(null);
            setLoading(false);
            setConfigResolved(true);
            return;
        }
        setLayout(null);
        setActions([]);
        setError(null);
        setLoading(true);
        setConfigResolved(false);
    }, [entityKind, orgScopeKey, bootstrapSeeded, options?.seededLayout]);

    useEffect(() => {
        if (!entityKind || bootstrapSeeded) {
            return;
        }
        let cancelled = false;
        const scope = (orgScopeKey ?? "").trim();
        const scopeQs = scope ? `&_org_scope=${encodeURIComponent(scope)}` : "";
        (async () => {
            setError(null);
            try {
                const init = workspaceDataFetchInit();
                const [lRes, aRes] = await Promise.all([
                    dedupeAdminFetchWithTtl(
                        `/api/admin/record-layouts?entity_type=${encodeURIComponent(entityKind)}${scopeQs}`,
                        init,
                        RECORD_CHROME_TTL_MS
                    ),
                    dedupeAdminFetchWithTtl(
                        `/api/admin/record-actions?entity_type=${encodeURIComponent(entityKind)}${scopeQs}`,
                        init,
                        RECORD_CHROME_TTL_MS
                    ),
                ]);
                const lJson = (await lRes.json().catch(() => ({}))) as {
                    layouts?: RecordLayoutRow[];
                    error?: string;
                };
                const aJson = (await aRes.json().catch(() => ({}))) as {
                    actions?: RecordActionRow[];
                    error?: string;
                };
                if (!lRes.ok) throw new Error(lJson.error ?? "Failed to load record layouts");
                if (!aRes.ok) throw new Error(aJson.error ?? "Failed to load record actions");
                const layouts = lJson.layouts ?? [];
                const defaultLayout =
                    layouts.find((x) => x.key === "default") ?? layouts[0] ?? null;
                if (!cancelled) {
                    setLayout(defaultLayout);
                    setActions(aJson.actions ?? []);
                }
            } catch (e) {
                if (!cancelled) {
                    setLayout(null);
                    setActions([]);
                    setError(e instanceof Error ? e.message : "Record chrome load failed");
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                    setConfigResolved(true);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [entityKind, orgScopeKey, bootstrapSeeded]);

    return { layout, actions, loading, error, configResolved };
}
