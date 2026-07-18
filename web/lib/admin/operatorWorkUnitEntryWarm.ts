import type { OperatorLifecycleLandingCard } from "@/lib/admin/buildOperatorLifecycleLanding";
import {
    normalizeOperatorPathname,
    parseOperatorWorkUnitPath,
} from "@/lib/admin/canonicalOperatorRoutes";
import {
    peekWorkUnitSlugRouteCache,
    putWorkUnitSlugRouteCache,
    type WorkUnitSlugRouteCacheEntry,
} from "@/lib/admin/workUnitSlugRouteCache";
import {
    fetchWorkUnitOperationalBootstrapSession,
    type WorkUnitBootstrapOwnership,
} from "@/lib/adminV2/workUnitBootstrapClientSession";
import { tracePlatformPrefetch, tracePlatformRouteLoad } from "@/lib/perf/platformSurfacePerfTrace";

// Blank-time removal: workspace tiles warm the exact K2 provisioning answer on hover/focus intent.
// Re-exported here so all entry points share one warm-helpers import surface.
export {
    prefetchWorkUnitProvisioning,
    prefetchWorkUnitProvisioningFromHref,
} from "@/lib/runtime/kernel/workUnitProvisioningPrefetch";

type SlugResolvedPayload = {
    kind: "work_unit_key" | "work_view" | "queue_lane_key";
    route_slug: string;
    work_unit_id: string;
    department_id: string;
    department_name?: string | null;
    work_unit_key: string;
    work_unit_name: string;
    initial_queue_key: string | null;
    initial_work_view_id?: string | null;
};

export type WorkUnitSlugRouteResolveResult = {
    entry: WorkUnitSlugRouteCacheEntry | null;
    errorMessage: string | null;
};

const slugInflight = new Map<string, Promise<WorkUnitSlugRouteResolveResult>>();

function cacheEntryFromPayload(json: SlugResolvedPayload): WorkUnitSlugRouteCacheEntry {
    return {
        routeSlug: json.route_slug,
        departmentId: json.department_id,
        departmentName: json.department_name ?? null,
        workUnitId: json.work_unit_id,
        workUnitKey: json.work_unit_key,
        workUnitName: json.work_unit_name,
        initialQueueKey: json.initial_queue_key,
        initialWorkViewId: json.initial_work_view_id ?? null,
    };
}

export function parseOperatorWorkUnitEntryHref(href: string): { workUnitSlug: string | null } {
    try {
        const base = typeof window !== "undefined" ? window.location.origin : "https://alloy.local";
        const url = new URL(href, base);
        const { workUnitSlug } = parseOperatorWorkUnitPath(normalizeOperatorPathname(url.pathname));
        return { workUnitSlug };
    } catch {
        return { workUnitSlug: null };
    }
}

/** Deduped slug resolution — shared by route host and lifecycle prewarm. */
export async function warmWorkUnitSlugRoute(
    workUnitSlug: string,
    reason: string = "prefetch",
): Promise<WorkUnitSlugRouteResolveResult> {
    const slug = workUnitSlug.trim();
    if (!slug || typeof window === "undefined") {
        return { entry: null, errorMessage: "Could not load work unit." };
    }

    const cached = peekWorkUnitSlugRouteCache(slug);
    if (cached) {
        tracePlatformRouteLoad("wu_slug_cache_hit", { work_unit_slug: slug, reason });
        return { entry: cached, errorMessage: null };
    }

    const inflight = slugInflight.get(slug);
    if (inflight) return inflight;

    tracePlatformRouteLoad("wu_slug_fetch_start", { work_unit_slug: slug, reason });

    const promise = (async (): Promise<WorkUnitSlugRouteResolveResult> => {
        try {
            const res = await fetch(
                `/api/admin/work-units/by-slug/${encodeURIComponent(slug)}`,
                { credentials: "include" },
            );
            if (res.status === 404) {
                return { entry: null, errorMessage: "Work unit not found." };
            }
            if (res.status === 409) {
                return {
                    entry: null,
                    errorMessage:
                        "This work unit name exists in more than one department. Contact an admin to rename or disambiguate.",
                };
            }
            if (!res.ok) {
                return { entry: null, errorMessage: "Could not load work unit." };
            }
            const json = (await res.json()) as SlugResolvedPayload;
            const entry = cacheEntryFromPayload(json);
            putWorkUnitSlugRouteCache(slug, entry);
            tracePlatformRouteLoad("wu_slug_fetch_ready", {
                work_unit_slug: slug,
                work_unit_id: entry.workUnitId,
                reason,
            });
            return { entry, errorMessage: null };
        } catch {
            return { entry: null, errorMessage: "Could not load work unit." };
        } finally {
            slugInflight.delete(slug);
        }
    })();

    slugInflight.set(slug, promise);
    return promise;
}

export function warmWorkUnitBootstrapFromSlugEntry(
    entry: WorkUnitSlugRouteCacheEntry,
    selectedSiteId: string | null,
    reason: string = "prefetch",
): void {
    const ownership: WorkUnitBootstrapOwnership = {
        departmentId: entry.departmentId,
        workUnitId: entry.workUnitId,
        selectedSiteId,
        focusQueue: entry.initialQueueKey,
        attentionBucket: null,
    };
    tracePlatformPrefetch("wu_bootstrap_warm_start", {
        work_unit_id: entry.workUnitId,
        department_id: entry.departmentId,
        reason,
    });
    void fetchWorkUnitOperationalBootstrapSession(ownership, "prefetch").catch(() => {
        /* best-effort warm */
    });
}

/** Slug resolve + operational bootstrap — lifecycle tile / sidebar intent. */
export function warmOperatorWorkUnitEntryFromHref(
    href: string,
    selectedSiteId: string | null,
    reason: string = "lifecycle_intent",
): void {
    const { workUnitSlug } = parseOperatorWorkUnitEntryHref(href);
    if (!workUnitSlug) return;
    void warmWorkUnitSlugRoute(workUnitSlug, reason).then(({ entry }) => {
        if (entry) warmWorkUnitBootstrapFromSlugEntry(entry, selectedSiteId, reason);
    });
}

/** Max lifecycle entry tiles to idle-prewarm without flooding the network. */
export const OPERATOR_LIFECYCLE_ENTRY_WARM_CAP = 6;

/** Idle prewarm after /workspace settles — visible lifecycle entry tiles (capped). */
export function warmDefaultOperatorLifecycleEntries(
    cards: readonly Pick<OperatorLifecycleLandingCard, "entryHref">[],
    selectedSiteId: string | null,
    cap: number = OPERATOR_LIFECYCLE_ENTRY_WARM_CAP,
): void {
    const hrefs = [...new Set(cards.map((card) => card.entryHref.trim()).filter(Boolean))].slice(0, cap);
    for (const href of hrefs) {
        warmOperatorWorkUnitEntryFromHref(href, selectedSiteId, "workspace_idle_default");
    }
}

/** @internal */
export function clearWorkUnitSlugInflightForTests(): void {
    slugInflight.clear();
}
