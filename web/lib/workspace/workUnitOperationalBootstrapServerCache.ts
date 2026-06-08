import { unstable_cache } from "next/cache";
import type { WorkUnitOperationalBootstrapPayload } from "@/lib/workspace/loadWorkUnitOperationalBootstrap";
import type { WorkUnitBootstrapPerfPhases } from "@/lib/workspace/workUnitOperationalBootstrapPerf";
import {
    buildWorkUnitBootstrapLoaderCacheKey,
    wuBootstrapCacheKeyDigest,
} from "@/lib/workspace/workUnitQueueScopeCacheKey";
import { logWuBootstrapCache } from "@/lib/workspace/wuBootstrapCacheInstrumentation";

const PROCESS_TTL_MS = 45_000;
const NEXT_REVALIDATE_S = 45;

type LoaderResult =
    | { payload: WorkUnitOperationalBootstrapPayload; phases: WorkUnitBootstrapPerfPhases }
    | { error: string; status: number };

type ProcessEntry = { atMs: number; value: LoaderResult };

const globalStore = globalThis as typeof globalThis & {
    __workUnitBootstrapLoaderCache?: Map<string, ProcessEntry>;
};

function processMap(): Map<string, ProcessEntry> {
    if (!globalStore.__workUnitBootstrapLoaderCache) {
        globalStore.__workUnitBootstrapLoaderCache = new Map();
    }
    return globalStore.__workUnitBootstrapLoaderCache;
}

function readProcess(cacheKey: string): LoaderResult | null {
    const hit = processMap().get(cacheKey);
    if (!hit) return null;
    if (Date.now() - hit.atMs > PROCESS_TTL_MS) {
        processMap().delete(cacheKey);
        return null;
    }
    return hit.value;
}

function writeProcess(cacheKey: string, value: LoaderResult): void {
    processMap().set(cacheKey, { atMs: Date.now(), value });
    if (processMap().size > 64) {
        const first = processMap().keys().next().value;
        if (first) processMap().delete(first);
    }
}

export type WorkUnitBootstrapLoaderCacheParams = Parameters<typeof buildWorkUnitBootstrapLoaderCacheKey>[0];

export function workUnitBootstrapLoaderCacheTag(orgId: string, workUnitId: string): string {
    return `wu-bootstrap:${orgId.trim()}:${workUnitId.trim()}`;
}

export async function loadWorkUnitOperationalBootstrapCached(
    cacheParams: WorkUnitBootstrapLoaderCacheParams,
    loader: () => Promise<LoaderResult>
): Promise<{ result: LoaderResult; cache_hit: boolean; cache_key_digest: string }> {
    const cacheKey = buildWorkUnitBootstrapLoaderCacheKey(cacheParams);
    const cache_key_digest = wuBootstrapCacheKeyDigest(cacheKey);

    const processHit = readProcess(cacheKey);
    if (processHit) {
        logWuBootstrapCache("process", "hit", {
            cache_key_digest,
            org_id: cacheParams.orgId,
            work_unit_id: cacheParams.workUnitId,
        });
        return { result: processHit, cache_hit: true, cache_key_digest };
    }

    const runLoader = async (): Promise<LoaderResult> => {
        logWuBootstrapCache("next_data", "miss", {
            cache_key_digest,
            org_id: cacheParams.orgId,
            work_unit_id: cacheParams.workUnitId,
            reason: "fetch",
        });
        return loader();
    };

    let result: LoaderResult;
    if (typeof unstable_cache === "function" && process.env.NODE_ENV !== "test") {
        const tag = workUnitBootstrapLoaderCacheTag(cacheParams.orgId, cacheParams.workUnitId);
        result = await unstable_cache(runLoader, [`wu-bootstrap-v1-${cacheKey}`], {
            revalidate: NEXT_REVALIDATE_S,
            tags: [tag, `wu-bootstrap-org:${cacheParams.orgId.trim()}`],
        })();
    } else {
        result = await runLoader();
    }

    writeProcess(cacheKey, result);

    logWuBootstrapCache("next_data", "miss", {
        cache_key_digest,
        org_id: cacheParams.orgId,
        work_unit_id: cacheParams.workUnitId,
        reason: "stored",
    });

    return { result, cache_hit: false, cache_key_digest };
}

export function applyWorkUnitBootstrapLoaderCacheHitPhases(
    phases: WorkUnitBootstrapPerfPhases
): WorkUnitBootstrapPerfPhases {
    return {
        ...phases,
        queue_summaries_cache_hit: true,
        primary_lane_rows_cache_hit: true,
        queue_summaries_ms: 0,
        primary_lane_rows_ms: 0,
    };
}

export function resetWorkUnitOperationalBootstrapServerCacheForTests(): void {
    processMap().clear();
}
