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

    const answers = useMemo(
        () => (resolved ? operationalAnswerModelsFromResolvedMetrics(keys, resolved) : []),
        [keys, resolved],
    );

    return { answers, settled };
}
