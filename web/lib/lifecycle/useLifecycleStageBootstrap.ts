"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LifecycleStageBootstrapPayload } from "@/lib/lifecycle/lifecycleStageBootstrapTypes";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

const cache = new Map<string, LifecycleStageBootstrapPayload>();

function cacheKey(departmentId: string, stageKey: string): string {
    return `${departmentId.trim()}:${stageKey.trim()}`;
}

export function useLifecycleStageBootstrap(
    departmentId: string,
    stageKey: string,
    options?: { primaryRecordLabel?: string; enabled?: boolean }
) {
    const enabled = options?.enabled !== false && Boolean(departmentId.trim() && stageKey.trim());
    const [data, setData] = useState<LifecycleStageBootstrapPayload | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inflightKey = useRef<string | null>(null);

    const load = useCallback(
        async (opts?: { force?: boolean }) => {
            const dept = departmentId.trim();
            const stage = stageKey.trim();
            if (!dept || !stage) {
                setData(null);
                return null;
            }
            const key = cacheKey(dept, stage);
            if (!opts?.force && cache.has(key)) {
                const cached = cache.get(key)!;
                setData(cached);
                setError(null);
                return cached;
            }
            if (inflightKey.current === key && !opts?.force) return data;

            inflightKey.current = key;
            setLoading(true);
            setError(null);
            try {
                const qs = new URLSearchParams({
                    department_id: dept,
                    stage_key: stage,
                    primary_record_label: options?.primaryRecordLabel?.trim() || "Lead",
                });
                const res = await fetch(
                    `/api/admin/lifecycle-builder/stage-bootstrap?${qs.toString()}`,
                    workspaceDataFetchInit()
                );
                const j = (await res.json().catch(() => ({}))) as LifecycleStageBootstrapPayload & {
                    error?: string;
                };
                if (!res.ok) throw new Error(j.error ?? "Failed to load stage configuration");
                cache.set(key, j);
                setData(j);
                return j;
            } catch (e) {
                const msg = e instanceof Error ? e.message : "Failed to load";
                setError(msg);
                return null;
            } finally {
                setLoading(false);
                if (inflightKey.current === key) inflightKey.current = null;
            }
        },
        [departmentId, stageKey, options?.primaryRecordLabel]
    );

    useEffect(() => {
        if (!enabled) {
            setData(null);
            setLoading(false);
            return;
        }
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- load when identity/stage changes only
    }, [enabled, departmentId, stageKey, options?.primaryRecordLabel]);

    const refresh = useCallback(() => load({ force: true }), [load]);

    const patch = useCallback(
        (partial: Partial<LifecycleStageBootstrapPayload>) => {
            const dept = departmentId.trim();
            const stage = stageKey.trim();
            if (!dept || !stage) return;
            const key = cacheKey(dept, stage);
            setData((prev) => {
                if (!prev) return prev;
                const next = { ...prev, ...partial };
                cache.set(key, next);
                return next;
            });
        },
        [departmentId, stageKey]
    );

    return { data, loading, error, refresh, patch };
}

export function clearLifecycleStageBootstrapCache(): void {
    cache.clear();
}
