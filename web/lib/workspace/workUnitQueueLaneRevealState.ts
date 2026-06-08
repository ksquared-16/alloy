import { workUnitQueuePillKeysEquivalent } from "@/lib/adminV2/workUnitQueueSelection";
import type { WorkUnitQueueItemsPayload } from "@/lib/workspace/workUnitQueueLaneDisplay";
import { peekCachedQueueItemsForPill } from "@/lib/workspace/workUnitQueueLaneDisplay";

/** Selected lane body reveal — never expose row skeleton as the visible lane state. */
export type WorkUnitQueueLaneRevealState =
    | "hidden_until_settled"
    | "ready_with_cache"
    | "ready_with_rows"
    | "ready_empty"
    | "ready_error";

export function workUnitQueueLaneRevealSettled(state: WorkUnitQueueLaneRevealState): boolean {
    return state !== "hidden_until_settled";
}

export function workUnitQueueLaneMayPaintRows(state: WorkUnitQueueLaneRevealState): boolean {
    return workUnitQueueLaneRevealSettled(state);
}

function queuePayloadMatchesActiveLane(args: {
    payload: WorkUnitQueueItemsPayload;
    active_queue_key: string;
    queue_definition?: unknown;
}): boolean {
    const pk =
        args.payload.queue != null && typeof args.payload.queue === "object"
            ? String((args.payload.queue as { key?: string }).key ?? "").trim()
            : "";
    const active = args.active_queue_key.trim();
    if (!pk || !active) return false;
    return workUnitQueuePillKeysEquivalent(
        args.queue_definition ? { queue_definition: args.queue_definition } : null,
        pk,
        active
    );
}

/**
 * Resolve whether the selected lane may render real rows, empty state, or error —
 * not row skeletons or a half-hydrated prior lane.
 */
export function resolveWorkUnitQueueLaneRevealState(args: {
    lane_authority_ready: boolean;
    work_unit_id: string | null;
    selected_queue_key: string | null;
    active_queue_key: string;
    attention_bucket_key: string;
    lane_unmapped_only: boolean;
    view_scope_fingerprint: string;
    queue_definition?: unknown;
    cache: Map<string, { payload: WorkUnitQueueItemsPayload; fetchedAt: number }>;
    queue_items: WorkUnitQueueItemsPayload | null;
    queue_items_loading: boolean;
    queue_items_error: string | null;
}): WorkUnitQueueLaneRevealState {
    if (args.queue_items_error) return "ready_error";
    if (!args.lane_authority_ready || !args.work_unit_id || !args.selected_queue_key?.trim()) {
        return "hidden_until_settled";
    }

    const cached = peekCachedQueueItemsForPill({
        cache: args.cache,
        viewScopeFingerprint: args.view_scope_fingerprint,
        workUnitId: args.work_unit_id,
        pillKey: args.selected_queue_key,
        attentionBucketKey: args.attention_bucket_key,
        unmappedOnly: args.lane_unmapped_only,
        queueDefinition: args.queue_definition,
    });
    const cacheMatches =
        cached != null &&
        queuePayloadMatchesActiveLane({
            payload: cached,
            active_queue_key: args.active_queue_key,
            queue_definition: args.queue_definition,
        });

    if (args.queue_items_loading) {
        if (cacheMatches) return "ready_with_cache";
        if (
            args.queue_items != null &&
            queuePayloadMatchesActiveLane({
                payload: args.queue_items,
                active_queue_key: args.active_queue_key,
                queue_definition: args.queue_definition,
            })
        ) {
            const items = Array.isArray(args.queue_items.items) ? args.queue_items.items : [];
            return items.length > 0 ? "ready_with_rows" : "ready_empty";
        }
        return "hidden_until_settled";
    }

    if (
        args.queue_items != null &&
        queuePayloadMatchesActiveLane({
            payload: args.queue_items,
            active_queue_key: args.active_queue_key,
            queue_definition: args.queue_definition,
        })
    ) {
        const items = Array.isArray(args.queue_items.items) ? args.queue_items.items : [];
        return items.length > 0 ? "ready_with_rows" : "ready_empty";
    }

    if (cacheMatches) return "ready_with_cache";
    return "hidden_until_settled";
}
