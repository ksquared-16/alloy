/**
 * Canonical client owner for the deferred opportunity stage-work (Current Work) resource.
 *
 * ONE cache key per (org, record, department, stage), ONE in-flight request coalesced across
 * consumers, prefetch and selection share the same entry, TTL + stale-while-revalidate, and
 * per-record / per-org invalidation. Mirrors `drawerFamilyWorkspacePrefetchCache` so the Focus
 * Panel runtime never issues raw component-local duplicate fetches.
 *
 * A stale response for record A can never land on record B: entries are keyed per record, and the
 * consuming runtime additionally re-checks the live selection before applying (see the payload hook).
 */

import type { OpportunityStageWorkSlice } from "@/lib/adminV2/viewModel/drawer/opportunity/resolveOpportunityStageWorkSlice";

const CACHE_TTL_MS = 90_000;

export type OpportunityStageWorkParams = {
    /** Tenant scope — partitions the cache so an org switch cannot cross-read. */
    orgScope?: string | null;
    opportunityId: string;
    departmentId: string | null;
    /** Builder stage_key (= `workspace.lifecycle_rail.current_stage_key`). */
    stageKey: string | null;
    stageLabel?: string | null;
    /** Child-grain subject — included in cache key so siblings do not share execution subject. */
    customerMemberId?: string | null;
    opportunityCustomerMemberId?: string | null;
    processInstanceId?: string | null;
};

type CacheEntry = { slice: OpportunityStageWorkSlice; fetchedAt: number };

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<OpportunityStageWorkSlice | null>>();
const listeners = new Set<() => void>();

function notify(): void {
    listeners.forEach((l) => l());
}

/** Stable per-record key: org + opportunity + department + stage (+ child subject when present). */
export function opportunityStageWorkCacheKey(params: OpportunityStageWorkParams): string | null {
    const opp = params.opportunityId?.trim();
    const stage = params.stageKey?.trim();
    if (!opp || !stage) return null;
    const org = params.orgScope?.trim() || "_";
    const dept = params.departmentId?.trim() || "_";
    const child =
        params.customerMemberId?.trim()
        || params.opportunityCustomerMemberId?.trim()
        || params.processInstanceId?.trim()
        || "_";
    return `${org}:opp:${opp}:dept:${dept}:stage:${stage}:child:${child}`;
}

function buildFetchQuery(params: OpportunityStageWorkParams): string | null {
    const stage = params.stageKey?.trim();
    if (!stage) return null;
    const qs = new URLSearchParams();
    qs.set("stage_key", stage);
    if (params.departmentId?.trim()) qs.set("department_id", params.departmentId.trim());
    if (params.stageLabel?.trim()) qs.set("stage_label", params.stageLabel.trim());
    if (params.customerMemberId?.trim()) qs.set("customer_member_id", params.customerMemberId.trim());
    if (params.opportunityCustomerMemberId?.trim()) {
        qs.set("opportunity_customer_member_id", params.opportunityCustomerMemberId.trim());
    }
    if (params.processInstanceId?.trim()) qs.set("process_instance_id", params.processInstanceId.trim());
    return qs.toString();
}

export function getOpportunityStageWorkWarm(
    params: OpportunityStageWorkParams,
): OpportunityStageWorkSlice | null {
    const key = opportunityStageWorkCacheKey(params);
    if (!key) return null;
    const entry = cache.get(key);
    if (!entry || Date.now() - entry.fetchedAt > CACHE_TTL_MS) return null;
    return entry.slice;
}

/** In-flight request for the same record/stage — join instead of issuing a duplicate. */
export function getOpportunityStageWorkInflight(
    params: OpportunityStageWorkParams,
): Promise<OpportunityStageWorkSlice | null> | null {
    const key = opportunityStageWorkCacheKey(params);
    if (!key) return null;
    return inflight.get(key) ?? null;
}

export function subscribeOpportunityStageWorkCache(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/** Drop cached entries for one record, or (no scope) flush everything — used on org switch. */
export function invalidateOpportunityStageWorkCache(scope?: {
    opportunityId?: string;
    orgScope?: string;
}): void {
    if (!scope) {
        cache.clear();
        notify();
        return;
    }
    if (scope.orgScope?.trim()) {
        const prefix = `${scope.orgScope.trim()}:`;
        for (const key of cache.keys()) if (key.startsWith(prefix)) cache.delete(key);
        notify();
        return;
    }
    if (scope.opportunityId?.trim()) {
        const needle = `:opp:${scope.opportunityId.trim()}:`;
        for (const key of cache.keys()) if (key.includes(needle)) cache.delete(key);
        notify();
    }
}

async function fetchAndStore(
    params: OpportunityStageWorkParams,
): Promise<OpportunityStageWorkSlice | null> {
    const qs = buildFetchQuery(params);
    const opp = params.opportunityId?.trim();
    if (!qs || !opp) return null;
    try {
        const res = await fetch(
            `/api/admin/view-models/drawer/opportunity/${encodeURIComponent(opp)}/stage-work?${qs}`,
            { credentials: "include" },
        );
        if (!res.ok) return getOpportunityStageWorkWarm(params);
        const slice = (await res.json().catch(() => null)) as OpportunityStageWorkSlice | null;
        if (!slice || typeof slice !== "object") return getOpportunityStageWorkWarm(params);
        const key = opportunityStageWorkCacheKey(params);
        if (key) {
            cache.set(key, { slice, fetchedAt: Date.now() });
            notify();
        }
        return slice;
    } catch {
        return getOpportunityStageWorkWarm(params);
    }
}

/**
 * Resolve the stage-work slice. Coalesces in-flight requests per key; `force` bypasses warm
 * freshness (post-mutation revalidate) but NOT in-flight dedup, so concurrent consumers share one
 * network request.
 */
export function prefetchOpportunityStageWork(
    params: OpportunityStageWorkParams,
    opts?: { force?: boolean },
): Promise<OpportunityStageWorkSlice | null> {
    const key = opportunityStageWorkCacheKey(params);
    if (!key) return Promise.resolve(null);

    const warm = !opts?.force ? getOpportunityStageWorkWarm(params) : null;
    if (warm) return Promise.resolve(warm);

    const existing = inflight.get(key);
    if (existing) return existing;

    const promise = fetchAndStore(params).finally(() => {
        inflight.delete(key);
    });
    inflight.set(key, promise);
    return promise;
}

/** Test-only reset. */
export function resetOpportunityStageWorkCacheForTests(): void {
    cache.clear();
    inflight.clear();
    listeners.clear();
}

/**
 * SEED a server-composed stage-work slice into this cache (Runtime V1 Realization — CP-2, D-001 pattern).
 *
 * The Provisioning Answer already carries `focusPanelStageWork` for the committed subject; seeding it here
 * — under the SAME (org/opp/dept/stage) key the drawer VM's `resolveStageWorkSliceForVm` builds — lets the
 * client's warm-cache check (`getOpportunityStageWorkWarm`) consume it, removing the duplicate `/stage-work`
 * fetch on the cold reveal. Idempotent: it never clobbers a still-fresh entry (a real fetch, or a prior
 * seed, wins), and it is keyed identically to the fetch path so a key drift simply misses (falls back to
 * the fetch — no wrong data). Returns whether it seeded (for the parity test).
 */
export function seedOpportunityStageWork(
    params: OpportunityStageWorkParams,
    slice: OpportunityStageWorkSlice,
): boolean {
    const key = opportunityStageWorkCacheKey(params);
    if (!key) return false;
    const existing = cache.get(key);
    if (existing && Date.now() - existing.fetchedAt <= CACHE_TTL_MS) return false; // don't clobber a fresh entry
    cache.set(key, { slice, fetchedAt: Date.now() });
    notify();
    return true;
}

/** Test-only warm seed. */
export function seedOpportunityStageWorkCacheForTests(
    params: OpportunityStageWorkParams,
    slice: OpportunityStageWorkSlice,
): void {
    const key = opportunityStageWorkCacheKey(params);
    if (!key) return;
    cache.set(key, { slice, fetchedAt: Date.now() });
    notify();
}
