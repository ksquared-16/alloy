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
    invalidateOperatorLifecycleLandingCache,
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
import { resolveProcessCardConfig } from "./workspaceProcessSurfaceConfig";
import {
    businessProcessForProcessKey,
    defaultSignalKeyForProcess,
    resolvePrimarySignal,
} from "./workspaceProcessSignal";
import { isKnownCalculationKey } from "@/lib/analytics/calculations/registry";
import type { OipMetricKey } from "@/lib/metrics/types";
import { processTileModelFromLandingCard, type WorkspaceSurfaceModel } from "./types";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import { fetchWorkspaceRootResolvedActions } from "@/lib/workspace/fetchWorkspaceRootResolvedActions";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import {
    OPPORTUNITY_QUEUE_UPDATED_EVENT,
    isQueueMembershipMutationActionKey,
    parseOpportunityQueueUpdatedDetail,
} from "@/lib/admin/opportunityQueueRefreshEvent";
import { bustOperatorRuntimeReadCaches } from "@/lib/admin/operatorRuntimeReadCacheBust";

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

    // ── Live refresh: a queue-membership mutation (Create Lead, etc.) must update the process
    // card counts immediately. Bumping this nonce re-runs the authoritative card load AND folds
    // into useWorkViewTotals' scope key so the per-view totals re-resolve — the workspace no
    // longer waits for a full page reload to reflect a new lead.
    const [refreshNonce, setRefreshNonce] = useState(0);
    useEffect(() => {
        if (typeof window === "undefined") return;
        const onQueueUpdated = (ev: Event) => {
            const detail = parseOpportunityQueueUpdatedDetail(ev);
            if (isQueueMembershipMutationActionKey(detail?.action_key)) {
                bustOperatorRuntimeReadCaches();
                invalidateOperatorLifecycleLandingCache();
                setRefreshNonce((n) => n + 1);
            }
        };
        window.addEventListener(OPPORTUNITY_QUEUE_UPDATED_EVENT, onQueueUpdated);
        return () => window.removeEventListener(OPPORTUNITY_QUEUE_UPDATED_EVENT, onQueueUpdated);
    }, []);

    // Authoritative load (rollups included) refines the seeded tiles in place; re-runs on refresh.
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
    }, [refreshNonce]);

    // ── Right Rail actions: the configured Workspace actions for the persistent command rail ─
    // Org-scoped (surface=workspace + shared right_rail); registered into the same shell command
    // rail the Work Unit uses. Deduped + TTL. Never invents actions.
    const [rightRailActions, setRightRailActions] = useState<ResolvedActionForClient[]>([]);
    useEffect(() => {
        if (orgId == null) return;
        let cancelled = false;
        void fetchWorkspaceRootResolvedActions({ fetchInit: workspaceDataFetchInit() ?? {} })
            .then((list) => {
                if (!cancelled) setRightRailActions(list);
            })
            .catch(() => {
                if (!cancelled) setRightRailActions([]);
            });
        return () => {
            cancelled = true;
        };
    }, [orgId]);

    // Default department for org-level workspace actions (Create Lead) — the first process's dept.
    const defaultDepartmentId = cards[0]?.departmentId ?? null;

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
        refreshToken: refreshNonce,
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
    // The optional SECOND signal an operator configured for this process's card (text-only line).
    const supportingSignalKeyForCard = useCallback(
        (card: OperatorLifecycleLandingCard): string | null => {
            const bp = businessProcessForProcessKey(card.processKey);
            return bp ? resolveProcessCardConfig(processConfig, bp).supportingSignalKey : null;
        },
        [processConfig],
    );
    const signalKeys = useMemo<OipMetricKey[]>(() => {
        const seen = new Set<string>();
        const out: OipMetricKey[] = [];
        for (const card of cards) {
            for (const key of [signalKeyForCard(card), supportingSignalKeyForCard(card)]) {
                if (key && isKnownCalculationKey(key) && !seen.has(key)) {
                    seen.add(key);
                    out.push(key);
                }
            }
        }
        return out;
    }, [cards, signalKeyForCard, supportingSignalKeyForCard]);
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
                const supportingKey = supportingSignalKeyForCard(card);
                const supportingSignal =
                    supportingKey && isKnownCalculationKey(supportingKey)
                        ? resolvePrimarySignal(supportingKey, signalsResolved?.[supportingKey])
                        : null;
                return processTileModelFromLandingCard(card, {
                    countForWorkView: (entry) => {
                        const viewId = entry.work_view_id?.trim();
                        const workUnitId = entry.host_work_unit_id?.trim();
                        if (!viewId || !workUnitId) return null;
                        return workViewTotals.get(workViewTotalKey(workUnitId, viewId)) ?? null;
                    },
                    primarySignal,
                    supportingSignal,
                });
            }),
        [cards, workViewTotals, signalKeyForCard, supportingSignalKeyForCard, signalsResolved],
    );

    return useMemo<WorkspaceSurfaceModel>(
        () => ({
            header: { orgName: orgName ?? routeVm.context.orgName },
            processes,
            rightRailActions,
            defaultDepartmentId,
            // Tiles present (warm seed) or the load settled.
            ready: processes.length > 0 || cardsSettled,
        }),
        [
            orgName,
            routeVm.context.orgName,
            processes,
            rightRailActions,
            defaultDepartmentId,
            cardsSettled,
        ],
    );
}
