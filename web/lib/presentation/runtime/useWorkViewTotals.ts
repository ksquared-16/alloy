"use client";

/**
 * Presentation Runtime V2 — shared Work View totals.
 *
 * ONE count source for every Work View badge: the queue rows API with the view's
 * `work_view_id` (limit=1, count_mode=exact) against the view's CANONICAL location
 * (host work unit + base lane — see `resolveWorkViewCanonicalLocation`). The Workspace
 * tile list and the Work Unit pill strip both resolve their counts here, and navigating
 * to the view renders it on that same location — so tile count, pill count, and rendered
 * row count agree by construction. Lane summaries are NEVER a displayed count (they
 * evaluate lanes, not view predicates).
 *
 * Same-population refresh retains the last settled count while a replacement fetch is
 * in flight; population identity changes clear retention for removed/changed targets.
 *
 * Grain: opportunity/case (queue row). Process participant metrics may use a different grain.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { appendWorkspaceSiteToUrl } from "@/lib/adminV2/workspaceSiteFilterClient";
import { dedupeAdminFetch } from "@/lib/workspace/workspaceAdminFetchDedupe";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import { mapWithConcurrencyLimit } from "@/lib/workspace/mapWithConcurrencyLimit";

/** Max canonical-total count requests in flight at once (bounds the pill fan-out). */
export const WORK_VIEW_TOTALS_FETCH_CONCURRENCY = 4;
import {
    peekWorkUnitSurfaceTotalsCache,
    putWorkUnitSurfaceTotalsCache,
    type WorkUnitViewModelCacheContext,
} from "@/lib/adminV2/viewModel/workUnit/workUnitViewModelSessionCache";
import type { QueueItemsResult } from "@/lib/queues/types";
import { queueTotalCountFromQueueItemsResult } from "./types";
import {
    applyWorkViewTotalsFetchResult,
    buildWorkViewPopulationKey,
    buildWorkViewTotalsScopeKey,
    mergeWorkViewTotalsForDisplay,
    parseWorkViewTotalTargetsFromKey,
    pruneWorkViewSettledTotalsStore,
    type WorkViewSettledTotalsStore,
} from "./workViewTotalsRetention";

/** One Work View count target — the view evaluated at its canonical location. */
export type WorkViewTotalTarget = {
    viewId: string;
    workUnitId: string;
    baseQueueKey: string;
};

/**
 * Totals map key — host-scoped so the same view id in two departments cannot collide
 * (view ids are only unique within a department's config).
 */
export function workViewTotalKey(workUnitId: string, viewId: string): string {
    return `${workUnitId}::${viewId}`;
}

/** Rows-API route for a Work View count/rows fetch — the ONE evaluation path for queue numbers. */
export function queueRowsRouteForView(args: {
    workUnitId: string;
    baseQueueKey: string;
    workViewId: string | null;
    limit: number;
    selectedSiteId: string | null;
}): string {
    const qs = new URLSearchParams({
        limit: String(args.limit),
        offset: "0",
        count_mode: "exact",
    });
    if (args.workViewId) qs.set("work_view_id", args.workViewId);
    return appendWorkspaceSiteToUrl(
        `/api/admin/queues/${encodeURIComponent(args.workUnitId)}/${encodeURIComponent(args.baseQueueKey)}?${qs.toString()}`,
        args.selectedSiteId,
    );
}

export type WorkViewTotalsState = {
    totals: Map<string, number | null>;
    /** True when this scope has no targets, is disabled, or the exact-total fetch has settled. */
    settled: boolean;
};

export function useWorkViewTotalsState(args: {
    targets: readonly WorkViewTotalTarget[];
    selectedSiteId: string | null;
    /** Gate (org/config readiness) — while false nothing fetches and all counts stay null. */
    enabled?: boolean;
    /**
     * Bump to force a fresh refetch (e.g. after Create Lead adds a New Leads row). Folds into
     * the fetch scope key but NOT population identity — last settled counts remain visible
     * during the refresh when the canonical population is unchanged.
     */
    refreshToken?: string | number;
    /**
     * Session-cache scope (Trust Closure). When provided, the totals map is cached per host +
     * population fingerprint so a return navigation resolves every badge from memory: a fresh cache
     * seeds the display AND skips the fan-out; a stale cache seeds then revalidates (SWR).
     */
    cacheContext?: WorkUnitViewModelCacheContext | null;
}): WorkViewTotalsState {
    const { targets, selectedSiteId, enabled = true, refreshToken, cacheContext } = args;

    const targetsKey = useMemo(
        () =>
            targets
                .filter((t) => t.viewId && t.workUnitId && t.baseQueueKey)
                .map((t) => `${t.workUnitId}|${t.viewId}|${t.baseQueueKey}`)
                .join("\n"),
        [targets],
    );

    const populationKey = useMemo(
        () => buildWorkViewPopulationKey({ enabled, selectedSiteId, targetsKey }),
        [enabled, selectedSiteId, targetsKey],
    );

    const scopeKey = useMemo(
        () => buildWorkViewTotalsScopeKey({ populationKey, refreshToken }),
        [populationKey, refreshToken],
    );

    const parsedTargets = useMemo(
        () => parseWorkViewTotalTargetsFromKey(targetsKey),
        [targetsKey],
    );

    const settledStoreRef = useRef<WorkViewSettledTotalsStore>(new Map());

    // Mount seed from the session cache — computed once so a return renders every badge instantly.
    const totalsSeedRef = useRef<{ totals: Map<string, number | null>; fresh: boolean } | null | undefined>(
        undefined,
    );
    if (totalsSeedRef.current === undefined) {
        const read = cacheContext ? peekWorkUnitSurfaceTotalsCache({ context: cacheContext, populationKey }) : null;
        totalsSeedRef.current = read ? { totals: new Map(read.entry.totals), fresh: read.fresh } : null;
    }
    // A fresh seed also skips the count fan-out on this navigation (no duplicate requests).
    const skipFreshFetchRef = useRef(totalsSeedRef.current?.fresh === true);

    const [resolved, setResolved] = useState<{
        scopeKey: string;
        totals: Map<string, number | null>;
    } | null>(() => (totalsSeedRef.current ? { scopeKey, totals: totalsSeedRef.current.totals } : null));

    // Population identity change: prune retention for removed/changed canonical locations.
    useEffect(() => {
        settledStoreRef.current = pruneWorkViewSettledTotalsStore({
            targets: parsedTargets,
            selectedSiteId,
            settledStore: settledStoreRef.current,
        });
    }, [populationKey, parsedTargets, selectedSiteId]);

    useEffect(() => {
        if (!enabled || !targetsKey) return;

        const byKey = new Map<string, WorkViewTotalTarget>();
        for (const target of parsedTargets) {
            byKey.set(workViewTotalKey(target.workUnitId, target.viewId), target);
        }
        if (!byKey.size) return;

        // Fresh cached totals seeded this navigation — do not re-issue the fan-out. (Stale/absent
        // seeds fall through and revalidate.) One-shot: later scope changes always refetch.
        if (skipFreshFetchRef.current) {
            skipFreshFetchRef.current = false;
            return;
        }

        let cancelled = false;
        const fetchTotal = async (
            key: string,
            target: WorkViewTotalTarget,
        ): Promise<readonly [string, number | null]> => {
            const route = queueRowsRouteForView({
                workUnitId: target.workUnitId,
                baseQueueKey: target.baseQueueKey,
                workViewId: target.viewId,
                limit: 1,
                selectedSiteId,
            });
            try {
                const res = await dedupeAdminFetch(route, workspaceDataFetchInit());
                if (!res.ok) return [key, null] as const;
                const json = (await res.json().catch(() => null)) as QueueItemsResult | null;
                return [key, queueTotalCountFromQueueItemsResult(json)] as const;
            } catch {
                return [key, null] as const;
            }
        };

        // Bounded fan-out: at most WORK_VIEW_TOTALS_FETCH_CONCURRENCY count requests in flight, so a
        // work unit with many pills never bursts an unbounded set of requests competing with the
        // active queue. The request COUNT stays bounded by the number of inactive views (not rows).
        void mapWithConcurrencyLimit(
            [...byKey.entries()],
            WORK_VIEW_TOTALS_FETCH_CONCURRENCY,
            ([key, target]) => fetchTotal(key, target),
        ).then((entries) => {
            if (cancelled) return;
            const freshTotals = new Map(entries);
            settledStoreRef.current = applyWorkViewTotalsFetchResult({
                targets: parsedTargets,
                selectedSiteId,
                freshTotals,
                settledStore: settledStoreRef.current,
            });
            setResolved({ scopeKey, totals: freshTotals });
            // Write-back so a return navigation resolves these badges from the session cache.
            if (cacheContext) putWorkUnitSurfaceTotalsCache(freshTotals, populationKey, cacheContext);
        });
        return () => {
            cancelled = true;
        };
        // scopeKey is derived from enabled/selectedSiteId/targetsKey/refreshToken.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scopeKey]);

    const fetchSettled = !enabled || !targetsKey || resolved?.scopeKey === scopeKey;

    const totals = useMemo(
        () =>
            mergeWorkViewTotalsForDisplay({
                targets: parsedTargets,
                selectedSiteId,
                freshTotals: resolved?.scopeKey === scopeKey ? resolved.totals : null,
                settledStore: settledStoreRef.current,
                fetchSettled,
            }),
        [parsedTargets, selectedSiteId, resolved, scopeKey, fetchSettled],
    );

    return {
        totals,
        settled: fetchSettled,
    };
}

export function useWorkViewTotals(args: Parameters<typeof useWorkViewTotalsState>[0]): Map<string, number | null> {
    return useWorkViewTotalsState(args).totals;
}
