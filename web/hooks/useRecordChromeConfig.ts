"use client";

import { useEffect, useState } from "react";
import type { RecordActionRow, RecordLayoutRow } from "@/lib/recordChrome/types";
import { dedupeAdminFetchWithTtl } from "@/lib/workspace/workspaceAdminFetchDedupe";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

const RECORD_CHROME_TTL_MS = 1500;

export type RecordChromeEntityKind = "job" | "schedule" | "opportunity";

/**
 * Fetches record layout + actions for a logical entity (above RRS).
 * Returns null layout/actions when entityKind is null or request fails (caller keeps static fallback).
 */
export function useRecordChromeConfig(entityKind: RecordChromeEntityKind | null) {
    const [layout, setLayout] = useState<RecordLayoutRow | null>(null);
    const [actions, setActions] = useState<RecordActionRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!entityKind) {
            setLayout(null);
            setActions([]);
            setError(null);
            return;
        }
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError(null);
            try {
                const init = workspaceDataFetchInit();
                const [lRes, aRes] = await Promise.all([
                    dedupeAdminFetchWithTtl(
                        `/api/admin/record-layouts?entity_type=${encodeURIComponent(entityKind)}`,
                        init,
                        RECORD_CHROME_TTL_MS
                    ),
                    dedupeAdminFetchWithTtl(
                        `/api/admin/record-actions?entity_type=${encodeURIComponent(entityKind)}`,
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
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [entityKind]);

    return { layout, actions, loading, error };
}
