/**
 * Work View pill-count retention — pure helpers for canonical population identity and
 * merging in-flight fetches with last settled totals. Owned by `useWorkViewTotals`; no
 * parallel cache or alternate count source.
 */

import type { WorkViewTotalTarget } from "./useWorkViewTotals";
import { workViewTotalKey } from "./useWorkViewTotals";

/** Canonical population identity — unchanged across same-population refresh. */
export function workViewPopulationIdentityKey(
    selectedSiteId: string | null,
    workUnitId: string,
    viewId: string,
    baseQueueKey: string,
): string {
    return `${selectedSiteId ?? ""}|${workUnitId}|${viewId}|${baseQueueKey}`;
}

export function populationKeyFromTarget(
    selectedSiteId: string | null,
    target: Pick<WorkViewTotalTarget, "workUnitId" | "viewId" | "baseQueueKey">,
): string {
    return workViewPopulationIdentityKey(
        selectedSiteId,
        target.workUnitId,
        target.viewId,
        target.baseQueueKey,
    );
}

/** Population scope (no refresh token) — site + canonical targets. */
export function buildWorkViewPopulationKey(args: {
    enabled: boolean;
    selectedSiteId: string | null;
    targetsKey: string;
}): string {
    return `${args.enabled ? "1" : "0"}\n${args.selectedSiteId ?? ""}\n${args.targetsKey}`;
}

export function buildWorkViewTotalsScopeKey(args: {
    populationKey: string;
    refreshToken: string | number | undefined;
}): string {
    return `${args.populationKey}\n${args.refreshToken ?? ""}`;
}

export function parseWorkViewTotalTargetsFromKey(targetsKey: string): WorkViewTotalTarget[] {
    const out: WorkViewTotalTarget[] = [];
    for (const line of targetsKey.split("\n")) {
        if (!line.trim()) continue;
        const [workUnitId, viewId, baseQueueKey] = line.split("|");
        if (!workUnitId || !viewId || !baseQueueKey) continue;
        out.push({ workUnitId, viewId, baseQueueKey });
    }
    return out;
}

export type WorkViewSettledTotalsStore = Map<string, number>;

/**
 * Merge freshly fetched totals with last settled values for display.
 * - Fresh non-null values replace retained (including legitimate zero).
 * - Fresh null during same-population refresh retains prior settled value.
 * - No prior settled → null (unresolved).
 */
export function mergeWorkViewTotalsForDisplay(args: {
    targets: readonly WorkViewTotalTarget[];
    selectedSiteId: string | null;
    freshTotals: Map<string, number | null> | null;
    settledStore: WorkViewSettledTotalsStore;
    fetchSettled: boolean;
}): Map<string, number | null> {
    const { targets, selectedSiteId, freshTotals, settledStore, fetchSettled } = args;
    const display = new Map<string, number | null>();

    for (const target of targets) {
        const totalKey = workViewTotalKey(target.workUnitId, target.viewId);
        const popKey = populationKeyFromTarget(selectedSiteId, target);
        const fresh = freshTotals?.get(totalKey) ?? null;

        if (fetchSettled && fresh !== null) {
            display.set(totalKey, fresh);
            continue;
        }

        if (fetchSettled && fresh === null) {
            const retained = settledStore.get(popKey);
            display.set(totalKey, retained ?? null);
            continue;
        }

        // In-flight: retain last settled for same population if available.
        const retained = settledStore.get(popKey);
        display.set(totalKey, retained ?? null);
    }

    return display;
}

/** Apply a settled fetch result to the retention store. */
export function applyWorkViewTotalsFetchResult(args: {
    targets: readonly WorkViewTotalTarget[];
    selectedSiteId: string | null;
    freshTotals: Map<string, number | null>;
    settledStore: WorkViewSettledTotalsStore;
}): WorkViewSettledTotalsStore {
    const next = new Map(args.settledStore);
    for (const target of args.targets) {
        const totalKey = workViewTotalKey(target.workUnitId, target.viewId);
        const popKey = populationKeyFromTarget(args.selectedSiteId, target);
        const fresh = args.freshTotals.get(totalKey) ?? null;
        if (fresh !== null) {
            next.set(popKey, fresh);
        }
    }
    return next;
}

/** Drop settled entries whose population identity is no longer in the target set. */
export function pruneWorkViewSettledTotalsStore(args: {
    targets: readonly WorkViewTotalTarget[];
    selectedSiteId: string | null;
    settledStore: WorkViewSettledTotalsStore;
}): WorkViewSettledTotalsStore {
    const valid = new Set(
        args.targets.map((t) => populationKeyFromTarget(args.selectedSiteId, t)),
    );
    const next = new Map<string, number>();
    for (const [key, value] of args.settledStore) {
        if (valid.has(key)) next.set(key, value);
    }
    return next;
}
