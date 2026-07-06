"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { LifecycleCatalogEntry } from "@/lib/lifecycle/lifecycleCatalogTypes";
import { lifecycleCatalogFetchInit } from "@/lib/workspace/workspaceDataFetch";
import { DEFAULT_WORKSPACE_PROCESS_SURFACE_CONFIG } from "@/lib/presentation/runtime/workspaceProcessSurfaceConfig";
import { loadWorkspaceProcessSurfaceConfig } from "@/lib/adminV2/settings/surfaces/workspaceProcessSurfaceService";
import {
    catalogEntriesAvailableToCreate,
    resolveSummaryCatalogIds,
    surfaceObjectForCatalogEntry,
} from "@/lib/adminV2/settings/surfaces/workspaceProcessCatalog";
import type { SurfaceConfigObject } from "@/components/adminV2/settings/surfaces/useSurfacesConfigurationSettings";

export function useWorkspaceProcessCatalog(extraCatalogIds: readonly string[] = []) {
    const [catalog, setCatalog] = useState<LifecycleCatalogEntry[]>([]);
    const [config, setConfig] = useState(DEFAULT_WORKSPACE_PROCESS_SURFACE_CONFIG);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const reload = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [catalogRes, loadedConfig] = await Promise.all([
                fetch("/api/admin/lifecycle-catalog", lifecycleCatalogFetchInit()),
                loadWorkspaceProcessSurfaceConfig(),
            ]);
            const catalogJson = (await catalogRes.json().catch(() => ({}))) as {
                items?: LifecycleCatalogEntry[];
                error?: string;
            };
            if (!catalogRes.ok) throw new Error(catalogJson.error ?? "Failed to load business processes");
            setCatalog(catalogJson.items ?? []);
            setConfig(loadedConfig);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to load workspace processes");
            setCatalog([]);
            setConfig(DEFAULT_WORKSPACE_PROCESS_SURFACE_CONFIG);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void reload();
    }, [reload]);

    const mergedConfig = useMemo(() => {
        if (!extraCatalogIds.length) return config;
        const ids = new Set(config.summaryCatalogIds ?? []);
        for (const id of extraCatalogIds) ids.add(id);
        return { ...config, summaryCatalogIds: [...ids] };
    }, [config, extraCatalogIds]);

    const configuredSurfaces = useMemo((): SurfaceConfigObject[] => {
        const ids = resolveSummaryCatalogIds(catalog, mergedConfig);
        return ids
            .map((id) => catalog.find((e) => e.id === id))
            .filter((e): e is LifecycleCatalogEntry => Boolean(e))
            .map(surfaceObjectForCatalogEntry);
    }, [catalog, mergedConfig]);

    const availableToCreate = useMemo(
        () => catalogEntriesAvailableToCreate(catalog, mergedConfig),
        [catalog, mergedConfig],
    );

    return {
        loading,
        error,
        catalog,
        config: mergedConfig,
        configuredSurfaces,
        availableToCreate,
        reload,
    };
}
