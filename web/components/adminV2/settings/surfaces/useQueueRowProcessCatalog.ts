"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { LifecycleCatalogEntry } from "@/lib/lifecycle/lifecycleCatalogTypes";
import { lifecycleCatalogFetchInit } from "@/lib/workspace/workspaceDataFetch";
import {
    resolveQueueRowCatalogIds,
    surfaceObjectForQueueRowCatalogEntry,
} from "@/lib/adminV2/settings/surfaces/queueRowProcessCatalog";
import { loadQueueRowSurfaceConfig } from "@/lib/adminV2/settings/surfaces/queueRowSurfaceService";
import type { SurfaceConfigObject } from "@/components/adminV2/settings/surfaces/useSurfacesConfigurationSettings";

export function useQueueRowProcessCatalog() {
    const [catalog, setCatalog] = useState<LifecycleCatalogEntry[]>([]);
    const [namesBySurfaceId, setNamesBySurfaceId] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const reload = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const catalogRes = await fetch("/api/admin/lifecycle-catalog", lifecycleCatalogFetchInit());
            const catalogJson = (await catalogRes.json().catch(() => ({}))) as {
                items?: LifecycleCatalogEntry[];
                error?: string;
            };
            if (!catalogRes.ok) throw new Error(catalogJson.error ?? "Failed to load business processes");
            const items = catalogJson.items ?? [];
            setCatalog(items);

            const ids = resolveQueueRowCatalogIds(items);
            const nameEntries = await Promise.all(
                ids.map(async (catalogId) => {
                    const entry = items.find((e) => e.id === catalogId);
                    if (!entry) return null;
                    const surfaceId = surfaceObjectForQueueRowCatalogEntry(entry).id;
                    try {
                        const loaded = await loadQueueRowSurfaceConfig(
                            surfaceId,
                            entry.process_key ?? undefined,
                        );
                        return [surfaceId, loaded.envelope.name] as const;
                    } catch {
                        return [surfaceId, surfaceObjectForQueueRowCatalogEntry(entry).title] as const;
                    }
                }),
            );
            setNamesBySurfaceId(Object.fromEntries(nameEntries.filter(Boolean) as [string, string][]));
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load queue row processes");
            setCatalog([]);
            setNamesBySurfaceId({});
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void reload();
    }, [reload]);

    const configuredSurfaces = useMemo((): SurfaceConfigObject[] => {
        const ids = resolveQueueRowCatalogIds(catalog);
        return ids
            .map((id) => catalog.find((e) => e.id === id))
            .filter((e): e is LifecycleCatalogEntry => Boolean(e))
            .map((entry) => {
                const surfaceId = surfaceObjectForQueueRowCatalogEntry(entry).id;
                const persistedName = namesBySurfaceId[surfaceId];
                return surfaceObjectForQueueRowCatalogEntry(entry, persistedName ? { name: persistedName } : null);
            });
    }, [catalog, namesBySurfaceId]);

    return {
        loading,
        error,
        catalog,
        configuredSurfaces,
        reload,
    };
}
