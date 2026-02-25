"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

const CACHE_KEY = "entity_labels_cache";
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export type EntityLabelEntry = { singular: string | null; plural: string | null };
export type EntityLabelsMap = Record<string, EntityLabelEntry>;

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

export function EntityLabelsProvider({ children }: { children: ReactNode }) {
    const [labels, setLabels] = useState<EntityLabelsMap>(() => loadFromCache() ?? {});
    const [loading, setLoading] = useState(true);

    const refreshEntityLabels = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/entity-labels");
            const json = await res.json().catch(() => ({}));
            if (!res.ok) return;
            const effective = (json as { effective?: { entity_type: string; singular: string | null; plural: string | null }[] }).effective ?? [];
            const map = buildMap(effective);
            setLabels(map);
            saveToCache(effective);
        } catch (_) {
            // keep previous labels on error
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const cached = loadFromCache();
        if (Object.keys(cached ?? {}).length > 0) {
            setLabels(cached!);
            setLoading(false);
            refreshEntityLabels();
            return;
        }
        refreshEntityLabels();
    }, [refreshEntityLabels]);

    return (
        <EntityLabelsContext.Provider value={{ labels, loading, refreshEntityLabels }}>
            {children}
        </EntityLabelsContext.Provider>
    );
}
