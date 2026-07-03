"use client";

/**
 * Presentation Runtime V2 — WS.SURFACE resolution.
 *
 * Resolves the WorkspaceSurfaceModel from the existing data layer, reused verbatim:
 *   - header                     — org identity only (title); the retired Workspace Header
 *                                  metric strip is gone — the Workspace Process Surface
 *                                  (process cards) is the entire workspace body
 *   - process tiles              — operator lifecycle landing cards (peek → load refine)
 *   - work-view counts           — canonical-location totals (`useWorkViewTotals`): each
 *                                  view's count is the rows-API exact total at its host
 *                                  work unit + base lane — the SAME source the Work Unit
 *                                  pill counts and rendered rows read
 *
 * Presentation components receive this model and never fetch
 * (docs/platform/experience/presentation-runtime-v2.md).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useWorkspaceOrg } from "@/contexts/WorkspaceOrgContext";
import { useWorkspaceSiteFilter } from "@/contexts/WorkspaceSiteFilterContext";
import { useWorkspaceRouteVm } from "@/lib/adminV2/runtime/surface/workspaceRouteVmContext";
import type { OperatorLifecycleLandingCard } from "@/lib/admin/buildOperatorLifecycleLanding";
import {
    loadOperatorLifecycleLandingCards,
    peekOperatorLifecycleLandingCards,
} from "@/lib/admin/loadOperatorLifecycleLandingClient";
import {
    useWorkViewTotals,
    workViewTotalKey,
    type WorkViewTotalTarget,
} from "./useWorkViewTotals";
import { useOperationalAnswers } from "./useOperationalAnswers";
import { useWorkspaceProcessSurfaceConfig } from "./useWorkspaceProcessSurfaceConfig";
import {
    businessProcessForProcessKey,
    defaultSignalKeyForProcess,
    resolvePrimarySignal,
} from "./workspaceProcessSignal";
import { isKnownCalculationKey } from "@/lib/analytics/calculations/registry";
import type { OipMetricKey } from "@/lib/metrics/types";
import { processTileModelFromLandingCard, type WorkspaceSurfaceModel } from "./types";

/** Warmest available first paint: session peek, else the server-composed Route VM seed. */
function seedLifecycleCards(
    routeVmCards: readonly OperatorLifecycleLandingCard[],
): OperatorLifecycleLandingCard[] {
    const peeked = typeof window === "undefined" ? null : peekOperatorLifecycleLandingCards();
    if (peeked?.length) return peeked;
    return routeVmCards.length ? [...routeVmCards] : [];
}

export function useWorkspaceSurfaceRuntime(): WorkspaceSurfaceModel {
    const routeVm = useWorkspaceRouteVm();
    const { orgId, orgName } = useWorkspaceOrg();
    const siteFilter = useWorkspaceSiteFilter();
    const selectedSiteId = siteFilter?.selectedSiteId ?? null;

    const [cards, setCards] = useState<OperatorLifecycleLandingCard[]>(() =>
        seedLifecycleCards(routeVm.firstPaint.lifecycleCards),
    );
    const [cardsSettled, setCardsSettled] = useState(false);

    // Authoritative load (rollups included) refines the seeded tiles in place.
    useEffect(() => {
        let cancelled = false;
        void loadOperatorLifecycleLandingCards()
            .then((next) => {
                if (!cancelled && next.length) setCards(next);
            })
            .finally(() => {
                if (!cancelled) setCardsSettled(true);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    // ── Work View counts: canonical-location totals (ONE count source) ─────────────────
    // Each configured view's nav entry carries its canonical location (host work unit +
    // base lane); the count is the rows-API exact total there — the same number the Work
    // Unit pill shows and the same total the rendered rows report after navigating.
    const workViewTotalTargets = useMemo<WorkViewTotalTarget[]>(() => {
        const seen = new Set<string>();
        const out: WorkViewTotalTarget[] = [];
        for (const card of cards) {
            for (const entry of card.workQueues) {
                const viewId = entry.work_view_id?.trim();
                const workUnitId = entry.host_work_unit_id?.trim();
                const baseQueueKey = entry.base_queue_key?.trim();
                if (!viewId || !workUnitId || !baseQueueKey) continue;
                const key = workViewTotalKey(workUnitId, viewId);
                if (seen.has(key)) continue;
                seen.add(key);
                out.push({ viewId, workUnitId, baseQueueKey });
            }
        }
        return out;
    }, [cards]);

    // Gate on org readiness — a totals request racing org-context bootstrap 404s transiently.
    const workViewTotals = useWorkViewTotals({
        targets: workViewTotalTargets,
        selectedSiteId,
        enabled: orgId != null,
    });

    // ── Primary Signal: the ONE configured Operational Calculation per process ──────────
    // Surface Builder chooses WHICH signal (config.primarySignalByProcess, keyed by business
    // process); the runtime falls back to the registry default for the process. No hardcoded
    // health metric. The selected calculations are resolved through the canonical answer path.
    const processConfig = useWorkspaceProcessSurfaceConfig();
    const signalKeyForCard = useCallback(
        (card: OperatorLifecycleLandingCard): string | null => {
            const bp = businessProcessForProcessKey(card.processKey);
            const configured = bp ? processConfig.primarySignalByProcess[bp] : undefined;
            return configured ?? defaultSignalKeyForProcess(card.processKey);
        },
        [processConfig],
    );
    const signalKeys = useMemo<OipMetricKey[]>(() => {
        const seen = new Set<string>();
        const out: OipMetricKey[] = [];
        for (const card of cards) {
            const key = signalKeyForCard(card);
            if (key && isKnownCalculationKey(key) && !seen.has(key)) {
                seen.add(key);
                out.push(key);
            }
        }
        return out;
    }, [cards, signalKeyForCard]);
    const { resolved: signalsResolved } = useOperationalAnswers({
        siteId: selectedSiteId,
        keys: signalKeys,
    });

    const processes = useMemo(
        () =>
            cards.map((card) => {
                const signalKey = signalKeyForCard(card);
                const primarySignal =
                    signalKey && isKnownCalculationKey(signalKey)
                        ? resolvePrimarySignal(signalKey, signalsResolved?.[signalKey])
                        : null;
                return processTileModelFromLandingCard(card, {
                    countForWorkView: (entry) => {
                        const viewId = entry.work_view_id?.trim();
                        const workUnitId = entry.host_work_unit_id?.trim();
                        if (!viewId || !workUnitId) return null;
                        return workViewTotals.get(workViewTotalKey(workUnitId, viewId)) ?? null;
                    },
                    primarySignal,
                });
            }),
        [cards, workViewTotals, signalKeyForCard, signalsResolved],
    );

    return useMemo<WorkspaceSurfaceModel>(
        () => ({
            header: { orgName: orgName ?? routeVm.context.orgName },
            processes,
            // Tiles present (warm seed) or the load settled.
            ready: processes.length > 0 || cardsSettled,
        }),
        [orgName, routeVm.context.orgName, processes, cardsSettled],
    );
}
