"use client";

/**
 * Presentation Runtime V2 — WS.SURFACE resolution.
 *
 * Resolves the WorkspaceSurfaceModel from the existing data layer, reused verbatim:
 *   - header / first-paint tiles — server-composed workspace Route VM
 *   - process tiles              — operator lifecycle landing cards (peek → load refine)
 *   - operational answers        — OIP warm cache (shared `useOperationalAnswers`)
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
import { resolveWorkspaceOipMetricKeys } from "@/lib/kpi/workspaceOipExposure";
import { useOperationalAnswers } from "./useOperationalAnswers";
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
    const { orgName } = useWorkspaceOrg();
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

    // Operational answers — OIP warm cache. No placement rows at this layer: code-owned
    // defaults + pack keys (same fallback the legacy workspace strip resolves to).
    const answerKeys = useMemo(() => resolveWorkspaceOipMetricKeys(undefined, false), []);
    const { answers } = useOperationalAnswers({ siteId: selectedSiteId, keys: answerKeys });

    const processes = useMemo(() => cards.map(processTileModelFromLandingCard), [cards]);

    return useMemo<WorkspaceSurfaceModel>(
        () => ({
            header: { orgName: orgName ?? routeVm.context.orgName },
            answers,
            processes,
            // Tiles present (warm seed) or the load settled — answers patch quietly after.
            ready: processes.length > 0 || cardsSettled,
        }),
        [orgName, routeVm.context.orgName, answers, processes, cardsSettled],
    );
}
