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
import { fetchQueueViewTotalsBatched } from "./fetchQueueViewTotalsBatched";

/** Max canonical-total count requests in flight at once (bounds the per-view FALLBACK fan-out). */
export const WORK_VIEW_TOTALS_FETCH_CONCURRENCY = 4;
import {
    peekWorkUnitSurfaceTotalsCache,
    putWorkUnitSurfaceTotalsCache,
    type WorkUnitViewModelCacheContext,
} from "@/lib/adminV2/viewModel/workUnit/workUnitViewModelSessionCache";
import type { QueueItemsResult } from "@/lib/queues/types";
import { queueTotalCountFromQueueItemsResult } from "./types";
import { matchWorkViewTotalsSeed } from "./matchWorkViewTotalsSeed";
import type { WorkViewTotalsSeed } from "@/lib/runtime/provisioning/workViewTotalsSeedContract";
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
    /**
     * Compact projection for the canonical Work Unit surface (rows + prewarm). `reveal` sends
     * `row_mode=reveal` so the server returns the SAME `queue_reveal` projection the operational
     * bootstrap uses for primary-lane rows — no drawer-grade context, no optional enrichment.
     * Omitted for count-only totals fetches (mode is irrelevant to a count).
     */
    rowMode?: "reveal" | "preview";
    /** Caller surface for server instrumentation (requested_mode/resolved_mode/caller_surface). */
    callerSurface?: string;
}): string {
    const qs = new URLSearchParams({
        limit: String(args.limit),
        offset: "0",
        count_mode: "exact",
    });
    if (args.workViewId) qs.set("work_view_id", args.workViewId);
    if (args.rowMode) qs.set("row_mode", args.rowMode);
    if (args.callerSurface) qs.set("caller_surface", args.callerSurface);
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
    /**
     * THE DOCUMENT SEED — the configured Work View counts already resolved server-side.
     *
     * WU-03's counts are the product's completion owner: measured deployed, this hook's request
     * starts ~57ms AFTER the document lands, costs ~1.6s, and WU-03 paints ~11ms later. The
     * document now computes the same counts from truth it already holds, so a MATCHING seed means
     * this hook issues no request at all.
     *
     * It is consumed only at mount, through the same one-shot path the session cache already uses,
     * which is what makes "a stale seed may never overwrite a fresher live answer" structural
     * rather than a rule to remember: any later scope change refetches, and nothing re-reads the
     * seed afterwards.
     */
    /**
     * WHICH RUNTIME MOUNTED THIS HOOK.
     *
     * A minified production stack names React's commit internals and nothing else, so the
     * previous attempt to identify the fetching instance from `new Error().stack` returned
     * `ih`/`uf`/`uc` and no component. The call site is the only thing that reliably knows who it
     * is, so it says so. An instance reporting "unlabelled" is a caller nobody has accounted for,
     * which is itself the finding.
     */
    ownerLabel?: string;
    documentSeed?: WorkViewTotalsSeed | null;
    /** Org identity the seed must match. */
    seedOrgId?: string | null;
    /** Surface work unit the seed must match. */
    seedHostWorkUnitId?: string | null;
}): WorkViewTotalsState {
    const {
        targets,
        selectedSiteId,
        enabled = true,
        refreshToken,
        cacheContext,
        documentSeed,
        seedOrgId,
        seedHostWorkUnitId,
        ownerLabel = "unlabelled",
    } = args;

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
    /**
     * The document seed outranks the session cache: it was computed for THIS request, by the
     * server, from authoritative truth, whereas the cache is a previous navigation's answer. It is
     * only used when its identity matches exactly — org, host work unit, site scope and the
     * configured view signature — and a rejection simply falls through to the existing behaviour.
     */
    /*
     * TWO INSTANCES OF THIS HOOK ARE MOUNTED — Settlement and the workspace surface runtime — and
     * a single overwritten global cannot say which one issued the request. The deployed matcher
     * reported ok:true while a request still went out, which is only readable per instance.
     */
    const instanceIdRef = useRef<string>(Math.random().toString(36).slice(2, 8));
    const seededAdoptRef = useRef(false);
    const seedMatchRef = useRef<ReturnType<typeof matchWorkViewTotalsSeed> | null>(null);
    /*
     * THE SEED IS MATCHED WHEN THE QUESTION EXISTS, NOT AT THE FIRST RENDER.
     *
     * Deployed measurement caught this: the seed reached the browser with a correct identity and
     * the client fetched anyway. `targets` are derived from the committed snapshot's Settlement
     * locators, so on the FIRST render they are empty — the signature compared "" against seven
     * configured views, rejected, and the one-shot ref was already spent. The seed was structurally
     * unusable, and every unit gate passed because each one supplies targets up front.
     *
     * So the match is deferred until `targetsKey` is non-empty. It is still one-shot: once decided,
     * `seedMatchRef` is set and this never runs again, which is what keeps a stale seed from
     * overwriting a fresher live answer.
     */
    if (totalsSeedRef.current === undefined && targetsKey) {
        const match = matchWorkViewTotalsSeed({
            seed: documentSeed,
            orgId: seedOrgId,
            hostWorkUnitId: seedHostWorkUnitId,
            selectedSiteId,
            viewIds: parsedTargets.map((t) => t.viewId),
        });
        seedMatchRef.current = match;
        /*
         * WHY THE SEED WAS OR WAS NOT USED — published for the deployed probe.
         *
         * Two deploys have now shown the seed resolving server-side, reaching the browser intact,
         * and the client fetching anyway. The first repair (defer until targets exist) was a
         * reasoned guess and did not bind it. Guessing a second time would be worse than the
         * defect: the rejection already knows its own reason, so it is published rather than
         * re-derived from the outside.
         *
         * Diagnostic only — read by the probe, never by the product, and it carries no counts.
         */
        try {
            const w = window as unknown as { __alloyWorkViewSeed?: unknown[] };
            if (!Array.isArray(w.__alloyWorkViewSeed)) w.__alloyWorkViewSeed = [];
            w.__alloyWorkViewSeed.push({
                instance: instanceIdRef.current,
                owner: ownerLabel,
                phase: "match",
                targetCount: parsedTargets.length,
                ok: match.ok,
                reason: match.ok ? null : match.reason,
                clientViewIds: parsedTargets.map((t) => t.viewId),
                clientOrgId: seedOrgId ?? null,
                clientHostWorkUnitId: seedHostWorkUnitId ?? null,
                clientSelectedSiteId: selectedSiteId ?? null,
                seedPresent: !!documentSeed,
                seedStatus: documentSeed?.status ?? null,
                seedIdentity:
                    documentSeed && documentSeed.status === "resolved" ? documentSeed.identity : null,
            });
        } catch {
            /* a diagnostic may never cost the surface its counts */
        }
        if (match.ok) {
            // `fresh` here means "authoritative for this navigation", which is exactly what makes
            // the fan-out unnecessary — the same one-shot skip the fresh cache path uses.
            totalsSeedRef.current = { totals: match.totals, fresh: true };
        } else {
            const read = cacheContext
                ? peekWorkUnitSurfaceTotalsCache({ context: cacheContext, populationKey })
                : null;
            totalsSeedRef.current = read ? { totals: new Map(read.entry.totals), fresh: read.fresh } : null;
        }
    }
    // A fresh seed also skips the count fan-out on this navigation (no duplicate requests).
    /*
     * Set when the seed decision is actually made, which may be a later render than the first.
     * Initialising from the first render would read `undefined` and lose the skip entirely.
     */
    const skipFreshFetchRef = useRef(false);
    const seedAppliedRef = useRef(false);
    if (!seedAppliedRef.current && totalsSeedRef.current !== undefined) {
        seedAppliedRef.current = true;
        skipFreshFetchRef.current = totalsSeedRef.current?.fresh === true;
    }

    const [resolved, setResolved] = useState<{
        scopeKey: string;
        totals: Map<string, number | null>;
    } | null>(() => (totalsSeedRef.current ? { scopeKey, totals: totalsSeedRef.current.totals } : null));
    /*
     * When the decision was deferred, the state initialiser above already ran with nothing. Adopt
     * the seeded totals on the render that resolved them — guarded by scopeKey so this cannot
     * clobber a live answer that has already arrived for the same scope.
     */
    if (
        seededAdoptRef.current === false &&
        totalsSeedRef.current &&
        (resolved === null || resolved.scopeKey !== scopeKey)
    ) {
        seededAdoptRef.current = true;
        setResolved({ scopeKey, totals: totalsSeedRef.current.totals });
    }

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
        const noteFetchDecision = (decision: string) => {
            try {
                const w = window as unknown as { __alloyWorkViewSeed?: unknown[] };
                if (!Array.isArray(w.__alloyWorkViewSeed)) w.__alloyWorkViewSeed = [];
                w.__alloyWorkViewSeed.push({
                    instance: instanceIdRef.current,
                    phase: "fetch",
                    decision,
                    owner: ownerLabel,
                    scopeKey,
                    targetCount: parsedTargets.length,
                    seedPresent: !!documentSeed,
                });
            } catch {
                /* diagnostics are never load-bearing */
            }
        };
        if (skipFreshFetchRef.current) {
            skipFreshFetchRef.current = false;
            noteFetchDecision("skipped_seeded");
            return;
        }
        noteFetchDecision("fetching");

        let cancelled = false;

        const applyFreshTotals = (freshTotals: Map<string, number | null>) => {
            if (cancelled) return;
            settledStoreRef.current = applyWorkViewTotalsFetchResult({
                targets: parsedTargets,
                selectedSiteId,
                freshTotals,
                settledStore: settledStoreRef.current,
            });
            setResolved({ scopeKey, totals: freshTotals });
            // Write-back so a return navigation resolves these badges from the session cache.
            if (cacheContext) putWorkUnitSurfaceTotalsCache(freshTotals, populationKey, cacheContext);
        };

        // Per-view fallback (legacy path): used only if the grouped request fails.
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

        void (async () => {
            // Batched: ONE request resolves every pill's count (see /api/admin/queue-view-totals),
            // so the browser issues a single request regardless of how many views the unit has.
            try {
                const targetsList = [...byKey.values()].map((t) => ({
                    workUnitId: t.workUnitId,
                    queueKey: t.baseQueueKey,
                    workViewId: t.viewId,
                }));
                const batched = await fetchQueueViewTotalsBatched({ targets: targetsList, selectedSiteId });
                if (cancelled) return;
                const freshTotals = new Map<string, number | null>();
                for (const key of byKey.keys()) freshTotals.set(key, batched.has(key) ? batched.get(key)! : null);
                applyFreshTotals(freshTotals);
                return;
            } catch {
                // Grouped endpoint unavailable — fall back to the bounded per-view fan-out so counts
                // are never lost. Request count still bounded by inactive-view count, not rows.
            }
            const entries = await mapWithConcurrencyLimit(
                [...byKey.entries()],
                WORK_VIEW_TOTALS_FETCH_CONCURRENCY,
                ([key, target]) => fetchTotal(key, target),
            );
            applyFreshTotals(new Map(entries));
        })();

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
