/**
 * ONE OWNER FOR "THIS ORG'S CONFIGURATION CHANGED" (P0-7.6 · Step 1-prime).
 *
 * ── WHY THIS EXISTS, AND WHY IT IS NOT A NEW MECHANISM ──
 *
 * The convergence audit asked whether Alloy needed a new freshness authority and the answer was no:
 * org-scoped Next Data Cache tags plus the process caches beside them already are it. What was
 * missing was COVERAGE. Of the writers that mutate a configuration family with a cached read, most
 * bumped nothing, so the cache's TTL was doing the job a bump should do — a bounded wrong answer
 * dressed as a design.
 *
 * This file is the single place that knows, per family, what "changed" means. It REPLACES the
 * invalidation logic that used to be inlined in `statusDefinitionsCache` and the nothing-at-all that
 * stood in for it everywhere else. It stores no payload, owns no cache, and adds no layer.
 *
 * ── ONLY FAMILIES WITH A CACHED READ APPEAR HERE ──
 *
 * Five of the seven families the projection work once proposed to protect — option sets, option set
 * items, GL accounts, GL mappings, charge templates — are read DIRECTLY from Postgres by every
 * reader. There is no cache in front of them, so there is nothing to invalidate, and a writer that
 * "forgets" to bump them has forgotten nothing. Adding them here would be inventing an obligation to
 * satisfy a coverage metric. They are deliberately absent.
 *
 * ── ORG-LOCAL IS NARROWER THAN PLATFORM-DEFAULT ──
 *
 * A row with `org_id IS NULL` is a shared platform default that every inheriting org resolves
 * through, so changing one changes the effective answer for all of them. An org-local write must NOT
 * pay that cost: it bumps only its own org's scope. Passing `null` is the deliberate, wider act.
 */

import { revalidateTag } from "next/cache";
import {
    invalidateProcessStatusDefinitionsCache,
    STATUS_EFFECTIVE_UNSTABLE_CACHE_TAGS,
} from "@/lib/admin/statusDefinitionsResolve";
import { invalidateLocationProgramCategoriesCache } from "@/lib/locations/loadLocationProgramCategoriesForOrg";
import { invalidateConfigReadCache } from "@/lib/runtime/provisioning/configReadCache";

/** The configuration families that have a cached read, and therefore a freshness obligation. */
export type ConfigFreshnessFamily =
    | "status_definitions"
    | "location_program_categories"
    /** `configReadCache` keys: work unit, department, queue-row layout, header layout. */
    | "work_unit_config"
    /** `configReadCache` keys: action definitions, focus-panel summary config. */
    | "operational_action_config";

/** `null` org means a PLATFORM-DEFAULT write: every inheriting org is affected. */
export type ConfigFreshnessScope = { family: ConfigFreshnessFamily; orgId: string | null };

function tag(name: string): void {
    if (typeof revalidateTag !== "function") return;
    try {
        revalidateTag(name, "max");
    } catch {
        /* Outside an App Router mutation context there is no tag store; the process caches below
         * still clear, and a route that never runs in that context has no Data Cache entry anyway. */
    }
}

/**
 * Publish "this configuration changed" to every cache that answers for it.
 *
 * Call it ONLY after the canonical write has committed. A bump before the write — or after one that
 * failed — advertises truth that does not exist, and the next reader will cache the old row again
 * under a fresh timestamp, which is worse than never having bumped at all.
 */
export function bumpOrgConfigFreshness({ family, orgId }: ConfigFreshnessScope): void {
    const org = orgId?.trim() || null;

    switch (family) {
        case "status_definitions": {
            invalidateProcessStatusDefinitionsCache(org ?? "");
            if (org) {
                /* Narrow on purpose. Every `unstable_cache` entry carries BOTH the org tag and the
                 * family tag, so the org tag alone is sufficient for this org — and bumping the
                 * family tag here would flush every other tenant for a write that cannot affect
                 * them. That over-invalidation is what this replaces. */
                tag(`status-def-org:${org}`);
            } else {
                for (const t of STATUS_EFFECTIVE_UNSTABLE_CACHE_TAGS) tag(t);
            }
            return;
        }
        case "location_program_categories": {
            invalidateLocationProgramCategoriesCache(org ?? undefined);
            return;
        }
        case "work_unit_config": {
            if (org) {
                invalidateConfigReadCache(`wu:${org}`);
                invalidateConfigReadCache(`dept:${org}`);
                invalidateConfigReadCache(`qrl:${org}`);
                invalidateConfigReadCache(`hdr:${org}`);
            } else {
                invalidateConfigReadCache();
            }
            return;
        }
        case "operational_action_config": {
            if (org) {
                invalidateConfigReadCache(`act:${org}`);
                invalidateConfigReadCache(`fps:${org}`);
            } else {
                invalidateConfigReadCache();
            }
            return;
        }
    }
}
