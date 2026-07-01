"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { runWhenAdminV2PrimarySurfaceReady } from "@/lib/workspace/adminV2DeferBackgroundWork";
import { dedupeAdminFetchWithTtl } from "@/lib/workspace/workspaceAdminFetchDedupe";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import { isAdminV2PrimarySurfacePending } from "@/lib/perf/adminV2PrimarySurfaceGate";

const CACHE_KEY = "entity_labels_cache";
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

import type { EntityLabelEntry, EntityLabelsMap } from "@/lib/admin/entityLabelDisplay";
import { getEntityLabel } from "@/lib/admin/entityLabelDisplay";

export type { EntityLabelEntry, EntityLabelsMap };
export { getEntityLabel };

type EntityLabelsContextValue = {
    labels: EntityLabelsMap;
    loading: boolean;
    refreshEntityLabels: () => Promise<void>;
};

const EntityLabelsContext = createContext<EntityLabelsContextValue | null>(null);

function loadFromCache(): EntityLabelsMap | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = sessionStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const { at, data } = JSON.parse(raw) as { at: number; data: { entity_type: string; singular: string | null; plural: string | null }[] };
        if (Date.now() - at > CACHE_TTL_MS) return null;
        const map: EntityLabelsMap = {};
        for (const row of data ?? []) {
            map[row.entity_type] = { singular: row.singular ?? null, plural: row.plural ?? null };
        }
        return map;
    } catch {
        return null;
    }
}

function saveToCache(effective: { entity_type: string; singular: string | null; plural: string | null }[]) {
    if (typeof window === "undefined") return;
    try {
        sessionStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data: effective }));
    } catch (_) {}
}

function buildMap(effective: { entity_type: string; singular: string | null; plural: string | null }[]): EntityLabelsMap {
    const map: EntityLabelsMap = {};
    for (const row of effective) {
        map[row.entity_type] = { singular: row.singular ?? null, plural: row.plural ?? null };
    }
    return map;
}

export function useEntityLabels(): EntityLabelsContextValue {
    const ctx = useContext(EntityLabelsContext);
    if (!ctx) throw new Error("useEntityLabels must be used within EntityLabelsProvider");
    return ctx;
}

async function fetchEntityLabelsMap(seeded: boolean): Promise<EntityLabelsMap> {
    const fetchInit = workspaceDataFetchInit() ?? {};
    const ttlMs = seeded ? 120_000 : 4500;
    const res = await dedupeAdminFetchWithTtl("/api/admin/entity-labels", fetchInit, ttlMs);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return {};
    const effective =
        (json as { effective?: { entity_type: string; singular: string | null; plural: string | null }[] })
            .effective ?? [];
    saveToCache(effective);
    return buildMap(effective);
}

/** Shell-level surfaces (e.g. top-nav My Tasks modal) sit outside route-scoped EntityLabelsProvider. */
function useEntityLabelsOutsideProvider(active: boolean): EntityLabelsContextValue {
    const [labels, setLabels] = useState<EntityLabelsMap>(() => (active ? (loadFromCache() ?? {}) : {}));
    const [loading, setLoading] = useState(() => active && Object.keys(loadFromCache() ?? {}).length === 0);

    const refreshEntityLabels = useCallback(async () => {
        if (!active) return;
        try {
            const map = await fetchEntityLabelsMap(false);
            if (Object.keys(map).length > 0) setLabels(map);
        } catch {
            // keep previous labels on error
        } finally {
            setLoading(false);
        }
    }, [active]);

    useEffect(() => {
        if (!active) return;
        const cached = loadFromCache();
        if (Object.keys(cached ?? {}).length > 0) {
            setLabels(cached!);
            setLoading(false);
            return runWhenAdminV2PrimarySurfaceReady(() => refreshEntityLabels(), "entity_labels_shell_cached");
        }
        if (isAdminV2PrimarySurfacePending()) {
            return runWhenAdminV2PrimarySurfaceReady(() => refreshEntityLabels(), "entity_labels_shell_unseeded");
        }
        void refreshEntityLabels();
    }, [active, refreshEntityLabels]);

    return { labels, loading, refreshEntityLabels };
}

/** Same as {@link useEntityLabels} but safe outside EntityLabelsProvider (uses session cache + fetch). */
export function useEntityLabelsOptional(): EntityLabelsContextValue {
    const ctx = useContext(EntityLabelsContext);
    const fallback = useEntityLabelsOutsideProvider(ctx == null);
    return ctx ?? fallback;
}

export function EntityLabelsProvider({
    children,
    initialLabels,
}: {
    children: ReactNode;
    /** Server-hydrated map (same shape as labels) so nav labels match org config on first paint. */
    initialLabels?: EntityLabelsMap;
}) {
    const seeded = !!(initialLabels && Object.keys(initialLabels).length > 0);
    const [labels, setLabels] = useState<EntityLabelsMap>(() => (seeded ? { ...initialLabels! } : {}));
    const [loading, setLoading] = useState(() => !seeded);

    const refreshEntityLabels = useCallback(async () => {
        try {
            const map = await fetchEntityLabelsMap(seeded);
            if (Object.keys(map).length > 0) setLabels(map);
        } catch (_) {
            // keep previous labels on error
        } finally {
            setLoading(false);
        }
    }, [seeded]);

    useEffect(() => {
        if (seeded) {
            return runWhenAdminV2PrimarySurfaceReady(() => {
                if (isAdminV2PrimarySurfacePending()) return;
                void refreshEntityLabels();
            }, "entity_labels_seeded");
        }
        const cached = loadFromCache();
        if (Object.keys(cached ?? {}).length > 0) {
            setLabels(cached!);
            setLoading(false);
            return runWhenAdminV2PrimarySurfaceReady(() => refreshEntityLabels(), "entity_labels_cached");
        }
        if (isAdminV2PrimarySurfacePending()) {
            return runWhenAdminV2PrimarySurfaceReady(() => refreshEntityLabels(), "entity_labels_unseeded");
        }
        void refreshEntityLabels();
    }, [seeded, refreshEntityLabels]);

    return (
        <EntityLabelsContext.Provider value={{ labels, loading, refreshEntityLabels }}>
            {children}
        </EntityLabelsContext.Provider>
    );
}
