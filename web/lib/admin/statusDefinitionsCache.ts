/**
 * Cache invalidation for effective status_definitions merges.
 */

import { revalidateTag } from "next/cache";
import {
    invalidateProcessStatusDefinitionsCache,
    STATUS_EFFECTIVE_UNSTABLE_CACHE_TAGS,
} from "@/lib/admin/statusDefinitionsResolve";

/** Revalidate Next data cache tags and in-process LRU for effective status definitions. */
export function revalidateEffectiveStatusDefinitionsCache(orgId: string): void {
    invalidateProcessStatusDefinitionsCache(orgId);
    if (typeof revalidateTag !== "function") return;
    try {
        revalidateTag(`status-def-org:${orgId.trim()}`, "max");
        for (const tag of STATUS_EFFECTIVE_UNSTABLE_CACHE_TAGS) {
            revalidateTag(tag, "max");
        }
    } catch {
        // Non-fatal outside App Router mutation context.
    }
}
