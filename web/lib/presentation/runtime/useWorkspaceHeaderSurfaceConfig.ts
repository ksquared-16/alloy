/**
 * Resolve the org's published Workspace Header Surface config for the runtime.
 *
 * Never flash defaults when a published config exists: exposes `loaded` so WS.SURFACE
 * commits the header atomically with KPI values.
 */

import { useEffect, useState } from "react";
import {
    DEFAULT_WORKSPACE_HEADER_SURFACE_CONFIG,
    type WorkspaceHeaderSurfaceConfig,
} from "@/lib/presentation/runtime/workspaceHeaderSurfaceConfig";
import {
    WORKSPACE_HEADER_SURFACE_PUBLISHED_EVENT,
    loadWorkspaceHeaderSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/workspaceHeaderSurfaceService";

type CacheState = {
    config: WorkspaceHeaderSurfaceConfig | null;
    promise: Promise<WorkspaceHeaderSurfaceConfig> | null;
    loaded: boolean;
};

const cache: CacheState = { config: null, promise: null, loaded: false };

function ensureLoad(): Promise<WorkspaceHeaderSurfaceConfig> {
    if (cache.loaded && cache.config) return Promise.resolve(cache.config);
    if (!cache.promise) {
        cache.promise = loadWorkspaceHeaderSurfaceConfig().then((config) => {
            cache.config = config;
            cache.loaded = true;
            cache.promise = null;
            return config;
        });
    }
    return cache.promise;
}

function invalidate(): Promise<WorkspaceHeaderSurfaceConfig> {
    cache.loaded = false;
    cache.promise = null;
    return ensureLoad();
}

export type WorkspaceHeaderSurfaceConfigState = {
    config: WorkspaceHeaderSurfaceConfig;
    loaded: boolean;
};

export function useWorkspaceHeaderSurfaceConfigState(): WorkspaceHeaderSurfaceConfigState {
    const [config, setConfig] = useState<WorkspaceHeaderSurfaceConfig>(
        cache.config ?? DEFAULT_WORKSPACE_HEADER_SURFACE_CONFIG,
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
        window.addEventListener(WORKSPACE_HEADER_SURFACE_PUBLISHED_EVENT, onPublished);
        return () => {
            active = false;
            window.removeEventListener(WORKSPACE_HEADER_SURFACE_PUBLISHED_EVENT, onPublished);
        };
    }, []);

    return { config, loaded };
}

/** Test-only cache reset. */
export function __resetWorkspaceHeaderSurfaceConfigCacheForTests(): void {
    cache.config = null;
    cache.promise = null;
    cache.loaded = false;
}
