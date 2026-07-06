"use client";

/**
 * Presentation Runtime V2 — shared operational-answers resolution.
 *
 * One operational answer model for both surfaces: the Workspace and Work Unit hooks call
 * this with their scope (site, optional work unit) and key set. Resolution is the existing
 * OIP warm cache verbatim — warm snapshot when present, subscribe for cross-surface warms,
 * prefetch (stale-while-revalidate) — no new fetch path, no new cache layer.
 */

import { useEffect, useMemo, useState } from "react";
import type { OipMetricKey } from "@/lib/metrics/types";
import type { ResolvedMetricMap } from "@/lib/metrics/fetchResolvedMetrics";
import {
    buildOipWarmScopeKey,
    getOipWarmSnapshot,
    prefetchOipMetricsWarm,
    subscribeOipWarmCache,
} from "@/lib/metrics/oipWorkspaceWarmCache";
import {
    OPPORTUNITY_QUEUE_UPDATED_EVENT,
    isQueueMembershipMutationActionKey,
    parseOpportunityQueueUpdatedDetail,
} from "@/lib/admin/opportunityQueueRefreshEvent";
import { operationalAnswerModelsFromResolvedMetrics, type OperationalAnswerModel } from "./types";

export type OperationalAnswersScope = {
    siteId: string | null;
    /** Present on the Work Unit surface — scopes metric resolution to the work unit. */
    workUnitId?: string | null;
    /** Caller-memoized key set (identity feeds the effect scope key). */
    keys: readonly OipMetricKey[];
};

export type OperationalAnswersResult = {
    answers: OperationalAnswerModel[];
    /**
     * The raw resolved map for the scope (null until a snapshot/prefetch lands). Card-style
     * consumers (WS.HEADER_CALCULATIONS) patch values/status in place from this — unlike
     * `answers`, it keeps no-data entries so cards never appear/disappear.
     */
    resolved: ResolvedMetricMap | null;
    /** True once a warm snapshot or the prefetch has settled (answers patch quietly after). */
    settled: boolean;
};

export function useOperationalAnswers(scope: OperationalAnswersScope): OperationalAnswersResult {
    const { siteId, workUnitId = null, keys } = scope;

    const scopeKey = useMemo(
        () => buildOipWarmScopeKey({ siteId, workUnitId, keys }),
        [siteId, workUnitId, keys],
    );

    const [resolved, setResolved] = useState<ResolvedMetricMap | null>(() => getOipWarmSnapshot(scopeKey));
    const [settled, setSettled] = useState<boolean>(() => getOipWarmSnapshot(scopeKey) != null);

    useEffect(() => {
        if (!keys.length) {
            setResolved({});
            setSettled(true);
            return;
        }
        let cancelled = false;

        // Warm snapshot first paint, then live updates from any surface warming this scope.
        const snapshot = getOipWarmSnapshot(scopeKey);
        if (snapshot) {
            setResolved(snapshot);
            setSettled(true);
        }
        const unsubscribe = subscribeOipWarmCache(() => {
            const next = getOipWarmSnapshot(scopeKey);
            if (next && !cancelled) {
                setResolved(next);
                setSettled(true);
            }
        });
        void prefetchOipMetricsWarm({ siteId, workUnitId, keys })
            .then((data) => {
                if (!cancelled) setResolved(data);
            })
            .finally(() => {
                if (!cancelled) setSettled(true);
            });
        return () => {
            cancelled = true;
            unsubscribe();
        };
        // scopeKey is derived from siteId/workUnitId/keys — the one effective dependency.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scopeKey]);

    useEffect(() => {
        if (typeof window === "undefined" || !keys.length) return;
        let cancelled = false;
        const onQueueUpdated = (ev: Event) => {
            const detail = parseOpportunityQueueUpdatedDetail(ev);
            if (!isQueueMembershipMutationActionKey(detail?.action_key)) return;
            void prefetchOipMetricsWarm({ siteId, workUnitId, keys }, { force: true }).then((data) => {
                if (!cancelled) setResolved(data);
            });
        };
        window.addEventListener(OPPORTUNITY_QUEUE_UPDATED_EVENT, onQueueUpdated);
        return () => {
            cancelled = true;
            window.removeEventListener(OPPORTUNITY_QUEUE_UPDATED_EVENT, onQueueUpdated);
        };
    }, [scopeKey, siteId, workUnitId, keys]);

    const answers = useMemo(
        () => (resolved ? operationalAnswerModelsFromResolvedMetrics(keys, resolved) : []),
        [keys, resolved],
    );

    return { answers, resolved, settled };
}
