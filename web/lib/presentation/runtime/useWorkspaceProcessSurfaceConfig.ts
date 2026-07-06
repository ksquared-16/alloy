"use client";

/**
 * Resolve the org's published Workspace Process Surface config for the runtime.
 *
 * The runtime must not first render defaults and then swap to the published card grammar.
 * This hook exposes readiness so WS.SURFACE can commit the process-card surface atomically.
 * Module-cached (one fetch per session), refreshed on the publish event so the builder's
 * "see it live" loop works.
 */

import { useEffect, useState } from "react";
import {
    DEFAULT_WORKSPACE_PROCESS_SURFACE_CONFIG,
    type WorkspaceProcessSurfaceConfig,
} from "@/lib/presentation/runtime/workspaceProcessSurfaceConfig";
import {
    WORKSPACE_PROCESS_SURFACE_PUBLISHED_EVENT,
    loadWorkspaceProcessSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/workspaceProcessSurfaceService";

type CacheState = {
    config: WorkspaceProcessSurfaceConfig | null;
    promise: Promise<WorkspaceProcessSurfaceConfig> | null;
    loaded: boolean;
};

const cache: CacheState = { config: null, promise: null, loaded: false };

function ensureLoad(): Promise<WorkspaceProcessSurfaceConfig> {
    if (cache.loaded && cache.config) return Promise.resolve(cache.config);
    if (!cache.promise) {
        cache.promise = loadWorkspaceProcessSurfaceConfig().then((config) => {
            cache.config = config;
            cache.loaded = true;
            cache.promise = null;
            return config;
        });
    }
    return cache.promise;
}

function invalidate(): Promise<WorkspaceProcessSurfaceConfig> {
    cache.loaded = false;
    cache.promise = null;
    return ensureLoad();
}

export type WorkspaceProcessSurfaceConfigState = {
    config: WorkspaceProcessSurfaceConfig;
    loaded: boolean;
};

export function useWorkspaceProcessSurfaceConfigState(): WorkspaceProcessSurfaceConfigState {
    const [config, setConfig] = useState<WorkspaceProcessSurfaceConfig>(
        cache.config ?? DEFAULT_WORKSPACE_PROCESS_SURFACE_CONFIG,
    );
    const [loaded, setLoaded] = useState(cache.loaded);

    useEffect(() => {
        let active = true;
        void ensureLoad().then((c) => {
            if (active) {
                setConfig(c);
                setLoaded(true);
            }
        });
        const onPublished = () => {
            setLoaded(false);
            void invalidate().then((c) => {
                if (active) {
                    setConfig(c);
                    setLoaded(true);
                }
            });
        };
        window.addEventListener(WORKSPACE_PROCESS_SURFACE_PUBLISHED_EVENT, onPublished);
        return () => {
            active = false;
            window.removeEventListener(WORKSPACE_PROCESS_SURFACE_PUBLISHED_EVENT, onPublished);
        };
    }, []);

    return { config, loaded };
}

export function useWorkspaceProcessSurfaceConfig(): WorkspaceProcessSurfaceConfig {
    return useWorkspaceProcessSurfaceConfigState().config;
}
