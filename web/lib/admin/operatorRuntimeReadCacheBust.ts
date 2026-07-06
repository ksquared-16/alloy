/**
 * Client read-cache bust for queue-membership mutations — reuses existing cache modules only.
 *
 * Grain note (intentional, not aligned here):
 *   - Work View / queue rows API → opportunity/case grain
 *   - process participant metrics → participant/child grain via process_instances
 */
import { invalidateOipWarmCache } from "@/lib/metrics/oipWorkspaceWarmCache";
import { bustLifecycleSiblingFetchDedupe } from "@/lib/workspace/workspaceAdminFetchDedupe";

/** Bust metric warm cache + lifecycle summary/queue TTL fetches after record-create mutations. */
export function bustOperatorRuntimeReadCaches(): void {
    bustLifecycleSiblingFetchDedupe();
    invalidateOipWarmCache();
}
