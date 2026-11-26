/**
 * Cache invalidation for effective status_definitions merges.
 *
 * The tag names and the process-LRU drop used to live here inline. They now live in
 * `bumpOrgConfigFreshness`, which is the single owner of "this org's configuration changed" across
 * every family that has a cached read — so this stays as the status-shaped façade its two existing
 * callers already use, and there is one place where the org/platform distinction is decided.
 */

import { bumpOrgConfigFreshness } from "@/lib/admin/configFreshness";

/** Revalidate Next data cache tags and in-process LRU for effective status definitions. */
export function revalidateEffectiveStatusDefinitionsCache(orgId: string): void {
    bumpOrgConfigFreshness({ family: "status_definitions", orgId });
}

/** A PLATFORM-DEFAULT status write (`org_id IS NULL`) changes the answer for every inheriting org. */
export function revalidatePlatformDefaultStatusDefinitionsCache(): void {
    bumpOrgConfigFreshness({ family: "status_definitions", orgId: null });
}
