"use client";

/**
 * Presentation Runtime V2 — WS.SURFACE resolution.
 *
 * Resolves the WorkspaceSurfaceModel from the existing data layer, reused verbatim:
 *   - header / first-paint tiles — server-composed workspace Route VM
 *   - header calculations        — the PUBLISHED "Workspace Header" surface cards, seeded
 *                                  from the Route VM (values server-resolved); code-owned
 *                                  fallback keys when no surface is published; values
 *                                  refined in place from the OIP warm cache (site-aware)
 *   - process tiles              — operator lifecycle landing cards (peek → load refine)
 *   - work-view counts           — canonical-location totals (`useWorkViewTotals`): each
 *                                  view's count is the rows-API exact total at its host
 *                                  work unit + base lane — the SAME source the Work Unit
 *                                  pill counts and rendered rows read
 *
 * Presentation components receive this model and never fetch
 * (docs/platform/experience/presentation-runtime-v2.md).
 */

import { useEffect, useMemo, useState } from "react";
import { useWorkspaceOrg } from "@/contexts/WorkspaceOrgContext";
import { useWorkspaceSiteFilter } from "@/contexts/WorkspaceSiteFilterContext";
import { useWorkspaceRouteVm } from "@/lib/adminV2/runtime/surface/workspaceRouteVmContext";
import type { OperatorLifecycleLandingCard } from "@/lib/admin/buildOperatorLifecycleLanding";
import {
    loadOperatorLifecycleLandingCards,
    peekOperatorLifecycleLandingCards,
} from "@/lib/admin/loadOperatorLifecycleLandingClient";
import { useOperationalAnswers } from "./useOperationalAnswers";
import {
    refineWorkspaceHeaderCardVms,
    seedWorkspaceHeaderCalculations,
    workspaceHeaderCalculationKeys,
    type WorkspaceHeaderCalculationCardVm,
} from "./workspaceHeaderCards";
import {
    useWorkViewTotals,
    workViewTotalKey,
    type WorkViewTotalTarget,
} from "./useWorkViewTotals";
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

    // ── Header calculations: the published Workspace Header surface ────────────────────
    // Server seed (Route VM, values resolved) or the code-owned fallback strip — the card
    // SET is fixed at first commit; the warm cache only refines value/status in place
    // (derived, not stateful: seed + latest resolved map → refined cards).
    const [seededCalculations] = useState<WorkspaceHeaderCalculationCardVm[]>(() =>
        seedWorkspaceHeaderCalculations(routeVm.firstPaint.headerCalculations),
    );
    const calculationKeys = useMemo(
        () => workspaceHeaderCalculationKeys(seededCalculations),
        [seededCalculations],
    );
    const { resolved: calculationsResolved } = useOperationalAnswers({
        siteId: selectedSiteId,
        keys: calculationKeys,
    });
    const calculations = useMemo(
        () =>
            calculationsResolved ?
                refineWorkspaceHeaderCardVms(seededCalculations, calculationsResolved)
            :   seededCalculations,
        [seededCalculations, calculationsResolved],
    );

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

    const processes = useMemo(
        () =>
            cards.map((card) =>
                processTileModelFromLandingCard(card, {
                    countForWorkView: (entry) => {
                        const viewId = entry.work_view_id?.trim();
                        const workUnitId = entry.host_work_unit_id?.trim();
                        if (!viewId || !workUnitId) return null;
                        return workViewTotals.get(workViewTotalKey(workUnitId, viewId)) ?? null;
                    },
                }),
            ),
        [cards, workViewTotals],
    );

    return useMemo<WorkspaceSurfaceModel>(
        () => ({
            header: { orgName: orgName ?? routeVm.context.orgName, calculations },
            processes,
            // Tiles present (warm seed) or the load settled — calculation values patch quietly after.
            ready: processes.length > 0 || cardsSettled,
        }),
        [orgName, routeVm.context.orgName, calculations, processes, cardsSettled],
    );
}
