"use client";

/**
 * Resolve the org's published Workspace Process Surface config for the runtime.
 *
 * Returns the built-in default until the published config loads, so first paint is never
 * blocked and the common case (no customization) renders the same cards. Module-cached
 * (one fetch per session), refreshed on the publish event so the builder's "see it live"
 * loop works. This is the runtime consuming the authored surface config.
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

export function useWorkspaceProcessSurfaceConfig(): WorkspaceProcessSurfaceConfig {
    const [config, setConfig] = useState<WorkspaceProcessSurfaceConfig>(
        cache.config ?? DEFAULT_WORKSPACE_PROCESS_SURFACE_CONFIG,
    );

    useEffect(() => {
        let active = true;
        void ensureLoad().then((c) => {
            if (active) setConfig(c);
        });
        const onPublished = () => {
            void invalidate().then((c) => {
                if (active) setConfig(c);
            });
        };
        window.addEventListener(WORKSPACE_PROCESS_SURFACE_PUBLISHED_EVENT, onPublished);
        return () => {
            active = false;
            window.removeEventListener(WORKSPACE_PROCESS_SURFACE_PUBLISHED_EVENT, onPublished);
        };
    }, []);

    return config;
}
