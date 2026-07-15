"use client";

/**
 * Presentation Runtime V2 — WS.SURFACE resolution.
 *
 * Resolves the WorkspaceSurfaceModel from the existing data layer, reused verbatim:
 *   - header                     — published Workspace Header (title/subtitle/KPIs) via
 *                                  entity_layouts `workspace_header` + Operational Calculations
 *   - process tiles              — operator lifecycle landing cards (peek → load refine)
 *   - work-view counts           — canonical-location totals (`useWorkViewTotals`): each
 *                                  view's count is the rows-API exact total at its host
 *                                  work unit + base lane — the SAME source the Work Unit
 *                                  pill counts and rendered rows read
 *
 * Presentation components receive this model and never fetch
 * (docs/platform/experience/presentation-runtime-v2.md).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
    useWorkViewTotalsState,
    workViewTotalKey,
    type WorkViewTotalTarget,
} from "./useWorkViewTotals";
import { useOperationalAnswers } from "./useOperationalAnswers";
import { useWorkspaceProcessSurfaceConfigState } from "./useWorkspaceProcessSurfaceConfig";
import { useWorkspaceHeaderSurfaceConfigState } from "./useWorkspaceHeaderSurfaceConfig";
import { resolveProcessCardConfig, resolveWorkViewIcon } from "./workspaceProcessSurfaceConfig";
import {
    buildWorkspaceHeaderPresentation,
    workspaceHeaderKpiSourceKeys,
    type WorkspaceHeaderPresentationModel,
} from "./workspaceHeaderSurfaceConfig";
import {
    selectWorkspaceProcessTileSnapshot,
    type WorkspaceProcessTileSnapshot,
} from "./workspaceProcessSurfaceAssembly";
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
import {
    peekWorkspaceSurface,
    putWorkspaceSurface,
    workspaceSurfaceCacheContextReady,
    type RetainedWorkspaceSurface,
    type WorkspaceSurfaceCacheContext,
} from "./workspaceSurfaceSessionCache";

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
    const { orgId, orgName, principalUserId, accessScopeFingerprint } = useWorkspaceOrg();
    const siteFilter = useWorkspaceSiteFilter();
    const selectedSiteId = siteFilter?.selectedSiteId ?? null;

    // ── RETAINED-TRUTH §4: synchronous retained-surface seed ────────────────────────────
    // Read the last committed workspace composition once at mount (before any effect) so a return
    // to /workspace renders the retained tiles/header/counts immediately instead of the skeleton.
    // Isolation is enforced by the cache key (org + user + scope + site).
    const cacheContext = useMemo<WorkspaceSurfaceCacheContext>(
        () => ({ orgId, userId: principalUserId, scopeFingerprint: accessScopeFingerprint, selectedSiteId }),
        [orgId, principalUserId, accessScopeFingerprint, selectedSiteId],
    );
    const retainedSeedRef = useRef<RetainedWorkspaceSurface | null | undefined>(undefined);
    if (retainedSeedRef.current === undefined) {
        retainedSeedRef.current = peekWorkspaceSurface(cacheContext)?.surface ?? null;
    }
    const retainedSeed = retainedSeedRef.current;
    const openedFromRetained = retainedSeed != null;
    // Totals cache context reuses the existing per-view totals store cross-mount (org/user/scope
    // keyed; the population key already distinguishes the workspace target set).
    const totalsCacheContext = useMemo(
        () => ({ orgId, userId: principalUserId, scopeFingerprint: accessScopeFingerprint }),
        [orgId, principalUserId, accessScopeFingerprint],
    );

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
    const [rightRailActions, setRightRailActions] = useState<ResolvedActionForClient[]>(
        () => retainedSeed?.rightRailActions ?? [],
    );
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
    const workViewTotalsState = useWorkViewTotalsState({
        targets: workViewTotalTargets,
        selectedSiteId,
        enabled: orgId != null,
        refreshToken: refreshNonce,
        cacheContext: totalsCacheContext,
    });

    // ── Primary Signal: the ONE configured Operational Calculation per process ──────────
    // Surface Builder chooses WHICH signal (config.primarySignalByProcess, keyed by business
    // process); the runtime falls back to the registry default for the process. No hardcoded
    // health metric. The selected calculations are resolved through the canonical answer path.
    const { config: processConfig, loaded: processConfigLoaded } = useWorkspaceProcessSurfaceConfigState();
    const { config: headerConfig, loaded: headerConfigLoaded } = useWorkspaceHeaderSurfaceConfigState();
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
    const headerKpiKeys = useMemo(() => workspaceHeaderKpiSourceKeys(headerConfig), [headerConfig]);
    const signalKeys = useMemo<OipMetricKey[]>(() => {
        const seen = new Set<string>();
        const out: OipMetricKey[] = [];
        for (const key of headerKpiKeys) {
            if (!seen.has(key)) {
                seen.add(key);
                out.push(key);
            }
        }
        for (const card of cards) {
            for (const key of [signalKeyForCard(card), supportingSignalKeyForCard(card)]) {
                if (key && isKnownCalculationKey(key) && !seen.has(key)) {
                    seen.add(key);
                    out.push(key);
                }
            }
        }
        return out;
    }, [cards, headerKpiKeys, signalKeyForCard, supportingSignalKeyForCard]);
    const { resolved: signalsResolved, settled: signalsSettled } = useOperationalAnswers({
        siteId: selectedSiteId,
        keys: signalKeys,
    });

    const headerFallbackTitle = orgName ?? routeVm.context.orgName;
    const lastCompleteHeader = useRef<WorkspaceHeaderPresentationModel | null>(
        retainedSeed?.headerPresentation ?? null,
    );
    const headerPresentation = useMemo(() => {
        if (!headerConfigLoaded || !signalsSettled) {
            return lastCompleteHeader.current;
        }
        const next = buildWorkspaceHeaderPresentation(headerConfig, {
            fallbackTitle: headerFallbackTitle,
            resolved: signalsResolved,
        });
        lastCompleteHeader.current = next;
        return next;
    }, [headerConfig, headerConfigLoaded, headerFallbackTitle, signalsResolved, signalsSettled]);

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
                        return workViewTotalsState.totals.get(workViewTotalKey(workUnitId, viewId)) ?? null;
                    },
                    iconForWorkView: (entry) =>
                        resolveWorkViewIcon(processConfig, {
                            workViewId: entry.work_view_id,
                            platformKey: entry.platformKey,
                        }),
                    primarySignal,
                    supportingSignal,
                });
            }),
        [
            cards,
            workViewTotalsState.totals,
            signalKeyForCard,
            supportingSignalKeyForCard,
            signalsResolved,
            processConfig,
        ],
    );

    const lastCompleteProcessSnapshot = useRef<WorkspaceProcessTileSnapshot | null>(
        retainedSeed?.processSnapshot ?? null,
    );
    const processSnapshotSelection = useMemo(
        () =>
            selectWorkspaceProcessTileSnapshot({
                previous: lastCompleteProcessSnapshot.current,
                next: { processes, config: processConfig },
                readiness: {
                    cardsSettled,
                    configLoaded: processConfigLoaded,
                    signalsSettled,
                    totalsSettled: workViewTotalsState.settled,
                },
            }),
        [
            cardsSettled,
            processConfig,
            processConfigLoaded,
            processes,
            signalsSettled,
            workViewTotalsState.settled,
        ],
    );
    if (processSnapshotSelection.ready && processSnapshotSelection.snapshot) {
        lastCompleteProcessSnapshot.current = processSnapshotSelection.snapshot;
    }
    const visibleProcessSnapshot = processSnapshotSelection.snapshot;

    // ── RETAINED-TRUTH §4: commit the fully-settled composition back to the retained cache ──
    // Persist ONLY a first-useful composition where every input has settled (never the retained
    // passthrough shown during a refresh) so a return renders truth, not a half-loaded frame.
    const fullyCommitted =
        cardsSettled &&
        processConfigLoaded &&
        signalsSettled &&
        workViewTotalsState.settled &&
        headerConfigLoaded &&
        Boolean(headerPresentation) &&
        Boolean(visibleProcessSnapshot) &&
        processSnapshotSelection.ready;
    useEffect(() => {
        if (!fullyCommitted) return;
        if (!workspaceSurfaceCacheContextReady(cacheContext)) return;
        if (!visibleProcessSnapshot || !headerPresentation) return;
        putWorkspaceSurface(
            {
                processSnapshot: visibleProcessSnapshot,
                headerPresentation,
                rightRailActions,
                defaultDepartmentId,
            },
            cacheContext,
        );
    }, [
        fullyCommitted,
        cacheContext,
        visibleProcessSnapshot,
        headerPresentation,
        rightRailActions,
        defaultDepartmentId,
    ]);

    // A retained return is composition-ready the instant the seed paints: the retained snapshot +
    // header are already complete, so we never re-show the skeleton while the background SWR runs.
    const retainedReady = openedFromRetained && Boolean(visibleProcessSnapshot) && Boolean(headerPresentation);

    return useMemo<WorkspaceSurfaceModel>(
        () => ({
            header: headerPresentation ?? buildWorkspaceHeaderPresentation(headerConfig, {
                fallbackTitle: headerFallbackTitle,
                resolved: null,
            }),
            processes: visibleProcessSnapshot?.processes ?? [],
            processConfig: visibleProcessSnapshot?.config ?? processConfig,
            rightRailActions,
            defaultDepartmentId,
            // Header + process tiles commit only when config + metrics + counts have settled,
            // or from the previous complete snapshot during refresh. Prevents default-header
            // flash and partial KPI morphs. A retained return is ready immediately from its seed
            // (RETAINED-TRUTH §4) so navigating back never re-shows the skeleton.
            ready:
                (processSnapshotSelection.ready &&
                    Boolean(visibleProcessSnapshot) &&
                    headerConfigLoaded &&
                    Boolean(headerPresentation)) ||
                retainedReady,
        }),
        [
            headerPresentation,
            headerConfig,
            headerFallbackTitle,
            headerConfigLoaded,
            visibleProcessSnapshot,
            processConfig,
            rightRailActions,
            defaultDepartmentId,
            processSnapshotSelection.ready,
            retainedReady,
        ],
    );
}
