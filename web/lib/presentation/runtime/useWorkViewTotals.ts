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
 */

import { useEffect, useMemo, useState } from "react";
import { appendWorkspaceSiteToUrl } from "@/lib/adminV2/workspaceSiteFilterClient";
import { dedupeAdminFetch } from "@/lib/workspace/workspaceAdminFetchDedupe";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import type { QueueItemsResult } from "@/lib/queues/types";
import { queueTotalCountFromQueueItemsResult } from "./types";

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

/**
 * Resolve exact totals for a set of Work View targets. Returns a map keyed by
 * `workViewTotalKey(workUnitId, viewId)` → total; a missing/`null` entry means
 * unresolved (loading or failed) and renders as NO badge — never a wrong badge.
 */
const EMPTY_TOTALS: Map<string, number | null> = new Map();

export function useWorkViewTotals(args: {
    targets: readonly WorkViewTotalTarget[];
    selectedSiteId: string | null;
    /** Gate (org/config readiness) — while false nothing fetches and all counts stay null. */
    enabled?: boolean;
    /**
     * Bump to force a fresh refetch (e.g. after Create Lead adds a New Leads row). Folds into
     * the scope key so the totals re-resolve from the rows API — the counts are never cached
     * across this token, so a mutation's new count lands immediately.
     */
    refreshToken?: string | number;
}): Map<string, number | null> {
    const { targets, selectedSiteId, enabled = true, refreshToken } = args;

    // Content-derived scope key: refetch on real target changes, not array identity churn.
    // The effect reconstructs the targets FROM this key, so the key is its only target
    // dependency (ids and queue keys never contain the separators).
    const targetsKey = useMemo(
        () =>
            targets
                .filter((t) => t.viewId && t.workUnitId && t.baseQueueKey)
                .map((t) => `${t.workUnitId}|${t.viewId}|${t.baseQueueKey}`)
                .join("\n"),
        [targets],
    );
    const scopeKey = `${enabled ? "1" : "0"}\n${selectedSiteId ?? ""}\n${refreshToken ?? ""}\n${targetsKey}`;

    // Resolved totals are KEYED to the scope they were fetched for: on any scope change the
    // stored map derives away to empty (no badge) with no clear-effect — stale counts can
    // never linger and nothing setStates synchronously during render or effect.
    const [resolved, setResolved] = useState<{
        scopeKey: string;
        totals: Map<string, number | null>;
    } | null>(null);

    useEffect(() => {
        if (!enabled || !targetsKey) return;

        const byKey = new Map<string, WorkViewTotalTarget>();
        for (const line of targetsKey.split("\n")) {
            const [workUnitId, viewId, baseQueueKey] = line.split("|");
            if (!workUnitId || !viewId || !baseQueueKey) continue;
            byKey.set(workViewTotalKey(workUnitId, viewId), { viewId, workUnitId, baseQueueKey });
        }
        if (!byKey.size) return;

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

        void Promise.all(
            [...byKey.entries()].map(([key, target]) => fetchTotal(key, target)),
        ).then((entries) => {
            // Stale-response guard: a superseded scope's cleanup ran — drop its payload.
            if (cancelled) return;
            setResolved({ scopeKey, totals: new Map(entries) });
        });
        return () => {
            cancelled = true;
        };
        // scopeKey is derived from enabled/selectedSiteId/targetsKey — the one effective dep.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scopeKey]);

    return resolved && resolved.scopeKey === scopeKey ? resolved.totals : EMPTY_TOTALS;
}
