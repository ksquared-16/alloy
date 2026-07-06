/**
 * Resolve the org's published Work Unit Header Surface config for the runtime.
 *
 * Never flash defaults when a published config exists: exposes `loaded` so WU.SURFACE
 * commits the header atomically with KPI values.
 */

import { useEffect, useState } from "react";
import {
    DEFAULT_WORK_UNIT_HEADER_SURFACE_CONFIG,
    type WorkUnitHeaderSurfaceConfig,
} from "@/lib/presentation/runtime/workUnitHeaderSurfaceConfig";
import {
    WORK_UNIT_HEADER_SURFACE_PUBLISHED_EVENT,
    loadWorkUnitHeaderSurfaceConfig,
} from "@/lib/adminV2/settings/surfaces/workUnitHeaderSurfaceService";

type CacheState = {
    config: WorkUnitHeaderSurfaceConfig | null;
    promise: Promise<WorkUnitHeaderSurfaceConfig> | null;
    loaded: boolean;
};

const cache: CacheState = { config: null, promise: null, loaded: false };

function ensureLoad(): Promise<WorkUnitHeaderSurfaceConfig> {
    if (cache.loaded && cache.config) return Promise.resolve(cache.config);
    if (!cache.promise) {
        cache.promise = loadWorkUnitHeaderSurfaceConfig().then((config) => {
            cache.config = config;
            cache.loaded = true;
            cache.promise = null;
            return config;
        });
    }
    return cache.promise;
}

function invalidate(): Promise<WorkUnitHeaderSurfaceConfig> {
    cache.loaded = false;
    cache.promise = null;
    return ensureLoad();
}

export type WorkUnitHeaderSurfaceConfigState = {
    config: WorkUnitHeaderSurfaceConfig;
    loaded: boolean;
};

export function useWorkUnitHeaderSurfaceConfigState(): WorkUnitHeaderSurfaceConfigState {
    const [config, setConfig] = useState<WorkUnitHeaderSurfaceConfig>(
        cache.config ?? DEFAULT_WORK_UNIT_HEADER_SURFACE_CONFIG,
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
        window.addEventListener(WORK_UNIT_HEADER_SURFACE_PUBLISHED_EVENT, onPublished);
        return () => {
            active = false;
            window.removeEventListener(WORK_UNIT_HEADER_SURFACE_PUBLISHED_EVENT, onPublished);
        };
    }, []);

    return { config, loaded };
}

/** Test-only cache reset. */
export function __resetWorkUnitHeaderSurfaceConfigCacheForTests(): void {
    cache.config = null;
    cache.promise = null;
    cache.loaded = false;
}
