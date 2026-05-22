import {
    enforceQueueRowCacheLru,
    putQueueRowCache,
    type QueueRowClientCacheBucket,
} from "@/lib/workspace/queueRowClientCache";
import type { WorkUnitLanePreviewEntry } from "@/lib/workspace/workUnitLanePreviewBundle";

export type WorkUnitLanePreviewQueueItemsPayload = {
    queue: WorkUnitLanePreviewEntry["queue"];
    items: unknown[];
    total: number;
    limit: number;
    offset: number;
    total_omitted?: boolean;
};

export function queueItemsPayloadFromLanePreview(preview: WorkUnitLanePreviewEntry): WorkUnitLanePreviewQueueItemsPayload {
    return {
        queue: preview.queue,
        items: preview.items ?? [],
        total: preview.total,
        limit: preview.limit,
        offset: preview.offset,
        ...(preview.total_omitted ? { total_omitted: true } : {}),
    };
}

/** Seed one lane preview into the work-unit row client cache (session-scoped Map). */
export function seedWorkUnitLanePreviewIntoCache<TPayload extends WorkUnitLanePreviewQueueItemsPayload>(
    map: Map<string, QueueRowClientCacheBucket<TPayload>>,
    accessScopeFingerprint: string,
    workUnitId: string,
    preview: WorkUnitLanePreviewEntry
): void {
    const payload = queueItemsPayloadFromLanePreview(preview) as TPayload;
    putQueueRowCache(
        map,
        accessScopeFingerprint,
        workUnitId,
        preview.queue_key,
        payload,
        preview.attention_bucket
    );
    enforceQueueRowCacheLru(map);
}

export function seedWorkUnitLanePreviewBundleIntoCache<TPayload extends WorkUnitLanePreviewQueueItemsPayload>(
    map: Map<string, QueueRowClientCacheBucket<TPayload>>,
    accessScopeFingerprint: string,
    workUnitId: string,
    previews: WorkUnitLanePreviewEntry[]
): number {
    let n = 0;
    for (const p of previews) {
        seedWorkUnitLanePreviewIntoCache(map, accessScopeFingerprint, workUnitId, p);
        n++;
    }
    return n;
}
