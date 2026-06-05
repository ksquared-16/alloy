"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import type { OpportunityDrawerQueuePreviewSeed } from "@/lib/admin/opportunityDrawerQueuePreviewSeed";
import type { PersonDrawerOpenSeed } from "@/lib/admin/drawer/personDrawerOpenSeed";
import type { OpportunityDrawerOpenPreload } from "@/lib/admin/opportunityDrawerOpenCoordinator";
import {
    loadOpportunityDrawerComposedOpen,
    shouldDeferOpportunityDrawerOpen,
} from "@/lib/admin/opportunityDrawerOpenCoordinator";
import { peekDrawerEntitySnapshot } from "@/lib/admin/drawerEntitySnapshotCache";
import { entityDataMatchesDrawer } from "@/lib/admin/drawer/entityDataMatchesDrawer";
import { logOpportunityQueueNav } from "@/lib/admin/drawer/opportunityDrawerQueueNavPerf";
import { prefetchAdjacentOpportunityDrawers } from "@/lib/admin/opportunityDrawerAdjacentPrefetch";
import { prefetchOpportunityDrawerOnRowIntent } from "@/lib/admin/opportunityDrawerIntentPrefetch";
import {
    isDrawerModelSwapEligible,
    prepareDrawerViewModel,
    prepareDrawerViewModelDeduped,
    type DrawerViewModelPreload,
} from "@/lib/adminV2/viewModel/drawer/drawerModelSwapNavigation";
import { logDrawerVmRuntimeDiagnostic } from "@/lib/adminV2/viewModel/drawer/drawerVmRuntimeDiagnostics";
import {
    DRAWER_LINK_OPEN_FAILED_MESSAGE,
    drawerLinkPendingKeyFromOpenParams,
} from "@/lib/adminV2/viewModel/drawer/vmRuntime/drawerLinkPending";
import {
    beginDrawerLinkPendingIfCold,
    logDrawerTargetCachePeek,
} from "@/lib/adminV2/viewModel/drawer/vmRuntime/drawerTargetCache";
import { findBackToLeadOpportunityInStack } from "@/lib/adminV2/viewModel/drawer/vmRuntime/resolveBackToLeadOpportunity";
import {
    buildRestoredOpportunityDrawerState,
    scheduleOpportunityDrawerGraphRewarmAfterRestore,
} from "@/lib/adminV2/viewModel/drawer/vmRuntime/restoreOpportunityDrawerSession";
import {
    buildPrepareParamsFromOpenDrawer,
    peekDrawerViewModelPreloadSync,
    resolveModelSwapOpportunityContext,
} from "@/lib/adminV2/viewModel/drawer/drawerShellPinnedModelSwap";
import {
    drawerRuntimePhaseForIdle,
    drawerRuntimePhaseForOpeningCold,
    drawerRuntimePhaseForShowing,
    drawerRuntimePhaseForSwapFallbackFetch,
    drawerRuntimePhaseForSwapStart,
    drawerRuntimeTransitionTargetKey,
    INITIAL_DRAWER_RUNTIME_PHASE_STATE,
    isSameDrawerRuntimeTransitionTarget,
    type DrawerRuntimePhaseState,
} from "@/lib/adminV2/viewModel/drawer/drawerRuntimePhase";
import type { PersonDrawerOpenPreload } from "@/lib/adminV2/viewModel/drawer/person/buildPersonDrawerOpenPreloadFromViewModel";
import type { ChildDrawerOpenPreload } from "@/lib/adminV2/viewModel/drawer/child/buildChildDrawerOpenPreloadFromViewModel";
import { opportunityDrawerHardCutoverEnabled } from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerHardCutoverGate";
import { resolveDrawerVmRenderDrawer } from "@/lib/adminV2/viewModel/drawer/vmRuntime/vmDrawerTransitionCoordinator";
import {
    previewSeedForQueueNavigatorRecord,
    resolveOpportunityQueueNavigateTargetId,
    type OpportunityDrawerQueueNavigator,
} from "@/lib/admin/opportunityDrawerQueueNavigator";
import { isOpportunityDrawerBootstrapWarm } from "@/lib/admin/opportunityDrawerBootstrapClient";
import { isOpportunityDrawerPrimaryWarm } from "@/lib/admin/opportunityDrawerPrimaryPrefetch";
import { markDrawerOpenStart } from "@/lib/perf/adminV2DrawerPerf";
import {
    confirmDiscardPersonDrawerUnsaved,
    setPersonDrawerUnsavedPromptOpener,
} from "@/lib/admin/person/personDrawerUnsavedGuard";
import PersonDrawerUnsavedChangesModal from "@/components/admin/entity/PersonDrawerUnsavedChangesModal";
import { GLOBAL_SEARCH_DRAWER_OPEN_SOURCE } from "@/lib/adminV2/globalRecordSearchOpen";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";
import type { OperationalVisualContext } from "@/lib/visualContext";

/** Entity kinds that can open in the admin stack drawer (must match API + presentation registry usage). */
export type AdminDrawerEntityType =
    | "jobs"
    | "schedules"
    | "opportunities"
    | "contacts"
    | "customers"
    | "customer_members"
    | "persons"
    | "locations"
    | "documents"
    | "vendors"
    | "discount_redemptions"
    | "workflows"
    | "subscriptions"
    | "payments"
    | "service_offerings"
    | "service_plan_templates"
    | "addons";

export type SchedulePrefill = {
    job_id: string;
    customer_id?: string | null;
    location_id?: string | null;
    assigned_vendor_id?: string | null;
    /** Preferred: canonical key from status_definitions (entity_type=schedules); server resolves schedule_status_id. */
    status_key?: string | null;
    /** Legacy: FK only; prefer status_key. Still accepted by POST. */
    schedule_status_id?: string | null;
};

/** When opening jobs with id "new", prefill opportunity_id, customer_id, primary_contact_id. */
export type JobPrefill = {
    opportunity_id?: string | null;
    customer_id?: string | null;
    primary_contact_id?: string | null;
};

/** Resolver surface for job entity GET (`?surface=`). Only applied when type === "jobs". */
export type JobRecordSurfaceParam = "drawer" | "overview" | "full";

/** When opening an opportunity from the AdminV2 queue, lane scope primes `record_header` actions in parallel with `drawer_initial`. */
export type OpportunityWorkspaceContext = { work_unit_id: string; department_id: string };

/** Dev/diagnostic — model-swap navigation between VM-backed drawer entities (shell stays mounted). */
export const DRAWER_MODEL_SWAP_OPEN_SOURCE = "drawer_model_swap";

/** Person/Child → Opportunity stack restore — uses pinned VM session cache when warm. */
export const DRAWER_BACK_TO_LEAD_OPEN_SOURCE = "drawer_back_to_lead";

export interface AdminDrawerState {
    type: AdminDrawerEntityType | null;
    id: string | null;
    /** When opening a job from V2 workspace, use "drawer" so `_rrs` matches triage; default entity behavior uses "full". */
    jobRecordSurface?: JobRecordSurfaceParam;
    /** When opening workflows with id "new", default the entity_type field to this (e.g. "opportunity"). */
    defaultWorkflowEntityType?: string;
    /** When opening customer_members or contacts or locations with id "new", prefill customer_id. */
    defaultCustomerId?: string;
    /** When opening contacts with id "new", prefill vendor_id. */
    defaultVendorId?: string;
    /** When opening schedules with id "new", prefill job_id, customer_id, location_id, assigned_vendor_id, status_key. */
    defaultSchedulePrefill?: SchedulePrefill;
    /** When opening jobs with id "new", prefill opportunity_id, customer_id, primary_contact_id. */
    defaultJobPrefill?: JobPrefill;
    /** Optional workspace / lane identity for shared record modal + shell visual context. */
    operationalVisualContext?: OperationalVisualContext;
    /** Optional opportunity workflow surface hint (e.g. open quote intake). */
    defaultOpportunitySurface?: "quote_intake";
    /** Optional queue/work-unit scope for opportunity drawer header actions (see `OpportunityWorkspaceContext`). */
    opportunityWorkspaceContext?: OpportunityWorkspaceContext | null;
    /** Queue row preview for immediate drawer header before entity GET returns. */
    opportunityQueuePreviewSeed?: OpportunityDrawerQueuePreviewSeed | null;
    /** Loaded WU queue slice for in-drawer prev/next (pipeline opportunities). */
    opportunityQueueNavigator?: OpportunityDrawerQueueNavigator | null;
    /** Dev/diagnostic — how this drawer was opened (e.g. opportunity_primary_contact). */
    openSource?: string | null;
    /** Display-only person labels from opportunity contact card — first paint before GET. */
    personDrawerOpenSeed?: PersonDrawerOpenSeed | null;
}

export type OpenDrawerParams = {
    type: AdminDrawerEntityType;
    id: string;
    defaultWorkflowEntityType?: string;
    defaultCustomerId?: string;
    defaultVendorId?: string;
    defaultSchedulePrefill?: SchedulePrefill;
    defaultJobPrefill?: JobPrefill;
    jobRecordSurface?: JobRecordSurfaceParam;
    operationalVisualContext?: OperationalVisualContext;
    defaultOpportunitySurface?: "quote_intake";
    opportunityWorkspaceContext?: OpportunityWorkspaceContext | null;
    opportunityQueuePreviewSeed?: OpportunityDrawerQueuePreviewSeed | null;
    opportunityQueueNavigator?: OpportunityDrawerQueueNavigator | null;
    /** Dev/diagnostic — caller surface (e.g. opportunity_primary_contact). */
    source?: string;
    /** Parent record for stack back navigation when opening a linked drawer. */
    parent?: { type: AdminDrawerEntityType; id: string };
    /** Display-only person labels from opportunity host — first paint before GET. */
    personDrawerOpenSeed?: PersonDrawerOpenSeed | null;
};

/** Params held while bootstrap + drawer_primary load outside the modal. */
export type OpportunityDrawerOpeningParams = {
    id: string;
    defaultOpportunitySurface?: "quote_intake";
    operationalVisualContext?: OperationalVisualContext;
    opportunityWorkspaceContext?: OpportunityWorkspaceContext | null;
    opportunityQueuePreviewSeed?: OpportunityDrawerQueuePreviewSeed | null;
    opportunityQueueNavigator?: OpportunityDrawerQueueNavigator | null;
};

export type DrawerStackItem = {
    type: AdminDrawerEntityType;
    id: string;
    defaultWorkflowEntityType?: string;
    defaultCustomerId?: string;
    defaultVendorId?: string;
    defaultSchedulePrefill?: SchedulePrefill;
    defaultJobPrefill?: JobPrefill;
    jobRecordSurface?: JobRecordSurfaceParam;
    operationalVisualContext?: OperationalVisualContext;
    defaultOpportunitySurface?: "quote_intake";
    opportunityWorkspaceContext?: OpportunityWorkspaceContext | null;
    opportunityQueuePreviewSeed?: OpportunityDrawerQueuePreviewSeed | null;
    opportunityQueueNavigator?: OpportunityDrawerQueueNavigator | null;
    openSource?: string | null;
    personDrawerOpenSeed?: PersonDrawerOpenSeed | null;
};

interface AdminDrawerContextValue {
    drawer: AdminDrawerState;
    /** External gate: bootstrap + drawer_primary + header actions in flight; modal stays unmounted (full is background). */
    openingOpportunity: OpportunityDrawerOpeningParams | null;
    isOpportunityDrawerOpening: boolean;
    /** In-drawer queue nav: target id while composed open loads (drawer stays mounted). */
    opportunityQueueNavTargetId: string | null;
    isOpportunityQueueNavPending: boolean;
    /** When opening a linked record from inside a drawer, the previous drawer is pushed here. */
    stack: DrawerStackItem[];
    canGoBack: boolean;
    /** Top of stack (the drawer we would return to on Back). */
    previousDrawer: DrawerStackItem | null;
    /** Visible record during VM drawer-to-drawer transitions (source until target VM is ready). */
    drawerVmRender: AdminDrawerState;
    openDrawer: (params: OpenDrawerParams) => void;
    /** Prev/next within the loaded work-unit queue — drawer stays open. */
    navigateOpportunityInQueue: (direction: "prev" | "next") => void;
    goBack: () => void;
    /** Restore pinned opportunity from stack/seed (skips intermediate person frames). */
    goBackToLead: () => void;
    closeDrawer: () => void;
    /** One-shot handoff after pre-open fetch (AdminEntityDrawer layout effect). */
    consumeOpportunityDrawerPreload: (opportunityId: string) => OpportunityDrawerOpenPreload | null;
    /** Bumps when async opportunity preload lands after drawer id is already mounted. */
    opportunityPreloadGeneration: number;
    /** Bumps when a drawer-to-drawer swap starts; resets to 0 when phase returns to showing/idle. */
    drawerTransitionId: number;
    /** Authoritative drawer shell runtime phase. */
    drawerRuntimePhase: DrawerRuntimePhaseState;
    /** Called by AdminEntityDrawer after VM preload apply completes. */
    completeDrawerRuntimeTransition: () => void;
    /** One-shot: entity layer must hydrate after swap missed VM cache. */
    consumeDrawerSwapFallbackFetch: () => boolean;
    /** One-shot person/child VM preload for model-swap opens. */
    consumePersonDrawerPreload: (
        personId: string,
        options?: { expectedSurface?: "person" | "child" }
    ) => PersonDrawerOpenPreload | ChildDrawerOpenPreload | null;
    /** Warm VM cache for drawer-to-drawer navigation. */
    prepareDrawerViewModel: (
        params: OpenDrawerParams & { context?: { orgId?: string | null; departmentId?: string | null; workUnitId?: string | null } }
    ) => Promise<DrawerViewModelPreload | null>;
    /** Open linked drawer via VM model-swap when a drawer is already open. */
    openDrawerModelSwap: (params: OpenDrawerParams) => void;
    cancelOpportunityDrawerOpen: () => void;
    commitOpportunityDrawerOpen: (
        opening: OpportunityDrawerOpeningParams,
        preload: OpportunityDrawerOpenPreload
    ) => void;
    /** Inline related-link pending key (VM cache key) while target VM prepares. */
    drawerLinkPendingKey: string | null;
    drawerLinkPendingError: { key: string; message: string } | null;
    clearDrawerLinkPendingError: () => void;
    drawerLinkPending: {
        begin: (pendingKey: string) => void;
        fail: (pendingKey: string, message?: string) => void;
        isPending: (pendingKey: string) => boolean;
        errorForKey: (pendingKey: string) => string | null;
    };
}

const AdminDrawerContext = createContext<AdminDrawerContextValue | null>(null);

export function useAdminDrawer() {
    const ctx = useContext(AdminDrawerContext);
    if (!ctx) throw new Error("useAdminDrawer must be used within AdminDrawerProvider");
    return ctx;
}

/** Same as {@link useAdminDrawer} but returns null outside a provider (e.g. isolated tests / SSR snippets). */
export function useAdminDrawerOptional() {
    return useContext(AdminDrawerContext);
}

export function AdminDrawerProvider({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const [drawer, setDrawer] = useState<AdminDrawerState>({ type: null, id: null });
    const [stack, setStack] = useState<DrawerStackItem[]>([]);
    const [openingOpportunity, setOpeningOpportunity] = useState<OpportunityDrawerOpeningParams | null>(null);
    const [opportunityQueueNavTargetId, setOpportunityQueueNavTargetId] = useState<string | null>(null);
    const opportunityDrawerPreloadRef = useRef<OpportunityDrawerOpenPreload | null>(null);
    const personDrawerPreloadRef = useRef<PersonDrawerOpenPreload | ChildDrawerOpenPreload | null>(null);
    const [opportunityPreloadGeneration, setOpportunityPreloadGeneration] = useState(0);
    const [drawerRuntimePhase, setDrawerRuntimePhase] = useState<DrawerRuntimePhaseState>(
        INITIAL_DRAWER_RUNTIME_PHASE_STATE
    );
    const queueNavRunRef = useRef(0);
    /** Synchronous one-shot for entity-open effect (React state alone is not readable in the same tick). */
    const swapFallbackFetchPendingRef = useRef(false);
    const lastAttachedSwapPreloadKeyRef = useRef<string | null>(null);
    const swapFallbackFetchInFlightKeyRef = useRef<string | null>(null);
    const pendingModelSwapParamsRef = useRef<OpenDrawerParams | null>(null);
    const [drawerLinkPendingKey, setDrawerLinkPendingKey] = useState<string | null>(null);
    const [drawerLinkPendingError, setDrawerLinkPendingError] = useState<{
        key: string;
        message: string;
    } | null>(null);

    const beginDrawerLinkPending = useCallback((pendingKey: string) => {
        setDrawerLinkPendingKey((current) => (current === pendingKey ? current : pendingKey));
        setDrawerLinkPendingError(null);
    }, []);

    const failDrawerLinkPending = useCallback((pendingKey: string, message?: string) => {
        setDrawerLinkPendingKey((current) => (current === pendingKey ? null : current));
        setDrawerLinkPendingError({
            key: pendingKey,
            message: message ?? DRAWER_LINK_OPEN_FAILED_MESSAGE,
        });
    }, []);

    const clearDrawerLinkPendingError = useCallback(() => {
        setDrawerLinkPendingError(null);
    }, []);

    const drawerLinkPendingApi = useMemo(
        () => ({
            begin: beginDrawerLinkPending,
            fail: failDrawerLinkPending,
            isPending: (pendingKey: string) =>
                drawerLinkPendingKey != null && drawerLinkPendingKey === pendingKey,
            errorForKey: (pendingKey: string) =>
                drawerLinkPendingError?.key === pendingKey ? drawerLinkPendingError.message : null,
        }),
        [beginDrawerLinkPending, failDrawerLinkPending, drawerLinkPendingError, drawerLinkPendingKey]
    );

    const completeDrawerRuntimeTransition = useCallback(() => {
        swapFallbackFetchPendingRef.current = false;
        lastAttachedSwapPreloadKeyRef.current = null;
        swapFallbackFetchInFlightKeyRef.current = null;
        pendingModelSwapParamsRef.current = null;
        setDrawerRuntimePhase((prev) => drawerRuntimePhaseForShowing(prev));
    }, []);

    const consumeDrawerSwapFallbackFetch = useCallback(() => {
        if (!swapFallbackFetchPendingRef.current) return false;
        swapFallbackFetchPendingRef.current = false;
        setDrawerRuntimePhase((prev) =>
            prev.swapFallbackFetch ? { ...prev, swapFallbackFetch: false } : prev
        );
        return true;
    }, []);

    const markOpportunityPreloadReady = useCallback(() => {
        setOpportunityPreloadGeneration((n) => n + 1);
    }, []);

    const pushDrawerToStack = useCallback((prev: AdminDrawerState) => {
        const prevType = prev.type;
        const prevId = prev.id;
        if (prevType != null && prevId != null) {
            setStack((s) => [
                ...s,
                {
                    type: prevType,
                    id: prevId,
                    defaultWorkflowEntityType: prev.defaultWorkflowEntityType,
                    defaultCustomerId: prev.defaultCustomerId,
                    defaultVendorId: prev.defaultVendorId,
                    defaultSchedulePrefill: prev.defaultSchedulePrefill,
                    defaultJobPrefill: prev.defaultJobPrefill,
                    jobRecordSurface: prev.jobRecordSurface,
                    operationalVisualContext: prev.operationalVisualContext,
                    defaultOpportunitySurface: prev.defaultOpportunitySurface,
                    opportunityWorkspaceContext: prev.opportunityWorkspaceContext,
                    opportunityQueuePreviewSeed: prev.opportunityQueuePreviewSeed,
                    opportunityQueueNavigator: prev.opportunityQueueNavigator,
                    openSource: prev.openSource ?? null,
                    personDrawerOpenSeed: prev.personDrawerOpenSeed ?? null,
                },
            ]);
        }
    }, []);

    const commitOpportunityDrawerOpen = useCallback(
        (opening: OpportunityDrawerOpeningParams, preload: OpportunityDrawerOpenPreload) => {
            opportunityDrawerPreloadRef.current = preload;
            markOpportunityPreloadReady();
            setOpeningOpportunity(null);
            setDrawerRuntimePhase((prev) => drawerRuntimePhaseForShowing(prev));
            setDrawer({
                type: "opportunities",
                id: opening.id,
                operationalVisualContext: opening.operationalVisualContext,
                defaultOpportunitySurface: opening.defaultOpportunitySurface,
                opportunityWorkspaceContext: opening.opportunityWorkspaceContext ?? null,
                opportunityQueuePreviewSeed: opening.opportunityQueuePreviewSeed ?? null,
                opportunityQueueNavigator: opening.opportunityQueueNavigator ?? null,
            });
            const nav = opening.opportunityQueueNavigator;
            const ws = opening.opportunityWorkspaceContext;
            if (nav && ws) {
                prefetchAdjacentOpportunityDrawers({
                    navigator: nav,
                    currentRecordId: opening.id,
                    workspaceContext: ws,
                });
            }
        },
        [markOpportunityPreloadReady]
    );

    const cancelOpportunityDrawerOpen = useCallback(() => {
        setOpeningOpportunity(null);
        opportunityDrawerPreloadRef.current = null;
        setStack((s) => {
            const next = [...s];
            const item = next.pop();
            if (item) {
                setDrawer({
                    type: item.type,
                    id: item.id,
                    defaultWorkflowEntityType: item.defaultWorkflowEntityType,
                    defaultCustomerId: item.defaultCustomerId,
                    defaultVendorId: item.defaultVendorId,
                    defaultSchedulePrefill: item.defaultSchedulePrefill,
                    defaultJobPrefill: item.defaultJobPrefill,
                    jobRecordSurface: item.jobRecordSurface,
                    operationalVisualContext: item.operationalVisualContext,
                    defaultOpportunitySurface: item.defaultOpportunitySurface,
                    opportunityWorkspaceContext: item.opportunityWorkspaceContext,
                    opportunityQueuePreviewSeed: item.opportunityQueuePreviewSeed,
                    opportunityQueueNavigator: item.opportunityQueueNavigator,
                });
            } else {
                setDrawer({ type: null, id: null });
            }
            return next;
        });
    }, []);

    const applyOpportunityQueueNavigation = useCallback(
        (
            targetId: string,
            navigator: OpportunityDrawerQueueNavigator,
            workspace: OpportunityWorkspaceContext | null | undefined
        ) => {
            const seed = previewSeedForQueueNavigatorRecord(navigator, targetId) ?? null;
            const navContext: OpportunityDrawerQueueNavigator = {
                ...navigator,
                drawer_nav_generation: (navigator.drawer_nav_generation ?? 0) + 1,
            };
            const ws =
                workspace ??
                ({
                    work_unit_id: navigator.work_unit_id,
                    department_id: navigator.department_id,
                } satisfies OpportunityWorkspaceContext);

            prefetchOpportunityDrawerOnRowIntent(targetId, ws, seed ?? null);

            setDrawer((prev) => ({
                ...prev,
                type: "opportunities",
                id: targetId,
                opportunityWorkspaceContext: workspace ?? prev.opportunityWorkspaceContext ?? null,
                opportunityQueuePreviewSeed: seed,
                opportunityQueueNavigator: navContext,
            }));

            prefetchAdjacentOpportunityDrawers({
                navigator: navContext,
                currentRecordId: targetId,
                workspaceContext: ws,
            });
        },
        []
    );

    const navigateOpportunityInQueue = useCallback(
        (direction: "prev" | "next") => {
            if (drawer.type !== "opportunities" || !drawer.id || drawer.id === "new") return;
            const navigator = drawer.opportunityQueueNavigator;
            if (!navigator) return;
            const targetId = resolveOpportunityQueueNavigateTargetId(direction, drawer.id, navigator);
            if (!targetId) return;

            const workspace = drawer.opportunityWorkspaceContext ?? {
                work_unit_id: navigator.work_unit_id,
                department_id: navigator.department_id,
            };
            const seed = previewSeedForQueueNavigatorRecord(navigator, targetId) ?? null;

            const run = ++queueNavRunRef.current;
            const navT0 = typeof performance !== "undefined" ? performance.now() : 0;
            const primaryWarm = isOpportunityDrawerPrimaryWarm(targetId);
            const bootstrapWarm = isOpportunityDrawerBootstrapWarm(targetId);
            const preloadReady =
                opportunityDrawerPreloadRef.current?.opportunityId === targetId.trim();
            const snapshotCached = peekDrawerEntitySnapshot("opportunities", targetId);
            const snapshotWarm =
                snapshotCached != null &&
                entityDataMatchesDrawer(snapshotCached, targetId, "opportunities");

            applyOpportunityQueueNavigation(targetId, navigator, workspace);

            const logNav = (path: import("@/lib/admin/drawer/opportunityDrawerQueueNavPerf").OpportunityQueueNavPath, overlay: boolean) => {
                logOpportunityQueueNav({
                    nav_source: direction === "prev" ? "queue_prev" : "queue_next",
                    target_id: targetId,
                    path,
                    overlay_shown: overlay,
                    bootstrap_warm: bootstrapWarm,
                    primary_warm: primaryWarm,
                    snapshot_warm: snapshotWarm,
                    prefetch_hit: preloadReady,
                    time_to_decision_ms:
                        typeof performance !== "undefined" ? Math.round(performance.now() - navT0) : undefined,
                });
            };

            if (opportunityDrawerHardCutoverEnabled()) {
                if (preloadReady) {
                    logNav("preload_hit", false);
                    return;
                }
                const vmPrepareParams = buildPrepareParamsFromOpenDrawer({
                    type: "opportunities",
                    id: targetId,
                    opportunityWorkspaceContext: workspace,
                    source: DRAWER_MODEL_SWAP_OPEN_SOURCE,
                });
                const vmSync = peekDrawerViewModelPreloadSync(vmPrepareParams);
                if (vmSync?.entityType === "opportunities") {
                    opportunityDrawerPreloadRef.current = vmSync.preload;
                    markOpportunityPreloadReady();
                    logNav("preload_hit", false);
                    return;
                }
                logNav("warm_composed", false);
                void prepareDrawerViewModel(vmPrepareParams)
                    .then((preload) => {
                        if (run !== queueNavRunRef.current) return;
                        if (preload?.entityType === "opportunities") {
                            opportunityDrawerPreloadRef.current = preload.preload;
                            markOpportunityPreloadReady();
                        }
                    })
                    .catch(() => {
                        /* drawer holds current VM until refetch */
                    });
                return;
            }

            const logNavLegacy = logNav;

            if (preloadReady || snapshotWarm) {
                logNavLegacy(preloadReady ? "preload_hit" : "snapshot_hit", false);
                return;
            }

            if (primaryWarm && bootstrapWarm) {
                logNavLegacy("warm_composed", false);
                void loadOpportunityDrawerComposedOpen(targetId, workspace, workspaceDataFetchInit(), {
                    queuePreviewSeed: seed,
                })
                    .then(({ preload }) => {
                        if (run !== queueNavRunRef.current) return;
                        opportunityDrawerPreloadRef.current = preload;
                        markOpportunityPreloadReady();
                    })
                    .catch(() => {
                        /* drawer shows queue seed until refetch */
                    });
                return;
            }

            setOpportunityQueueNavTargetId(targetId);
            logNavLegacy("cold_composed", true);
            void loadOpportunityDrawerComposedOpen(targetId, workspace, workspaceDataFetchInit(), {
                queuePreviewSeed: seed,
            })
                .then(({ preload }) => {
                    if (run !== queueNavRunRef.current) return;
                    opportunityDrawerPreloadRef.current = preload;
                    markOpportunityPreloadReady();
                    setOpportunityQueueNavTargetId(null);
                })
                .catch(() => {
                    if (run !== queueNavRunRef.current) return;
                    setOpportunityQueueNavTargetId(null);
                });
        },
        [applyOpportunityQueueNavigation, drawer.id, drawer.opportunityQueueNavigator, drawer.opportunityWorkspaceContext, drawer.type, markOpportunityPreloadReady]
    );

    const [personUnsavedPromptOpen, setPersonUnsavedPromptOpen] = useState(false);
    const personUnsavedProceedRef = useRef<(() => void) | null>(null);

    useEffect(() => {
        setPersonDrawerUnsavedPromptOpener((request) => {
            personUnsavedProceedRef.current = request.onDiscard;
            setPersonUnsavedPromptOpen(true);
        });
        return () => setPersonDrawerUnsavedPromptOpener(null);
    }, []);

    const consumeOpportunityDrawerPreload = useCallback((opportunityId: string): OpportunityDrawerOpenPreload | null => {
        const p = opportunityDrawerPreloadRef.current;
        if (!p || p.opportunityId !== opportunityId.trim()) return null;
        opportunityDrawerPreloadRef.current = null;
        return p;
    }, []);

    const consumePersonDrawerPreload = useCallback(
        (
            personId: string,
            options?: { expectedSurface?: "person" | "child" }
        ): PersonDrawerOpenPreload | ChildDrawerOpenPreload | null => {
            const p = personDrawerPreloadRef.current;
            if (!p || p.personId !== personId.trim()) return null;
            const isChildPreload = p.viewModel?.surface === "child";
            if (options?.expectedSurface === "child" && !isChildPreload) return null;
            if (options?.expectedSurface === "person" && isChildPreload) return null;
            personDrawerPreloadRef.current = null;
            return p;
        },
        []
    );

    const prepareDrawerViewModelForOpen = useCallback(
        async (
            params: OpenDrawerParams & {
                context?: { orgId?: string | null; departmentId?: string | null; workUnitId?: string | null };
            }
        ) => {
            if (params.type !== "opportunities" && params.type !== "persons") return null;
            return prepareDrawerViewModelDeduped(buildPrepareParamsFromOpenDrawer(params));
        },
        []
    );

    const applyDrawerTargetNavigation = useCallback(
        (params: OpenDrawerParams, options?: { skipStackPush?: boolean }) => {
            setDrawer((prev) => {
                const oppCtx = resolveModelSwapOpportunityContext(params, prev);
                if (!options?.skipStackPush) {
                    pushDrawerToStack(prev);
                }
                return {
                    type: params.type,
                    id: params.id,
                    defaultWorkflowEntityType: params.defaultWorkflowEntityType,
                    defaultCustomerId: params.defaultCustomerId,
                    defaultVendorId: params.defaultVendorId,
                    defaultSchedulePrefill: params.defaultSchedulePrefill,
                    defaultJobPrefill: params.defaultJobPrefill,
                    jobRecordSurface: params.type === "jobs" ? params.jobRecordSurface : undefined,
                    operationalVisualContext:
                        params.operationalVisualContext ?? prev.operationalVisualContext,
                    defaultOpportunitySurface: params.defaultOpportunitySurface,
                    opportunityWorkspaceContext: oppCtx.opportunityWorkspaceContext,
                    opportunityQueuePreviewSeed: oppCtx.opportunityQueuePreviewSeed,
                    opportunityQueueNavigator: oppCtx.opportunityQueueNavigator,
                    openSource: params.source ?? DRAWER_MODEL_SWAP_OPEN_SOURCE,
                    personDrawerOpenSeed:
                        params.type === "persons" ? params.personDrawerOpenSeed ?? null : null,
                };
            });
        },
        [pushDrawerToStack]
    );

    const failDrawerModelSwap = useCallback(
        (params: OpenDrawerParams, message: string) => {
            const swapParams: OpenDrawerParams = {
                ...params,
                opportunityWorkspaceContext:
                    params.opportunityWorkspaceContext ?? drawer.opportunityWorkspaceContext ?? null,
            };
            const pendingKey = drawerLinkPendingKeyFromOpenParams(swapParams);
            failDrawerLinkPending(pendingKey, message);
            pendingModelSwapParamsRef.current = null;
            swapFallbackFetchPendingRef.current = false;
            lastAttachedSwapPreloadKeyRef.current = null;
            swapFallbackFetchInFlightKeyRef.current = null;
            setDrawerRuntimePhase((prev) => drawerRuntimePhaseForShowing(prev));
            logDrawerVmRuntimeDiagnostic("model_swap_prepare_error", {
                entity_type: params.type,
                entity_id: params.id,
                open_source: params.source ?? DRAWER_MODEL_SWAP_OPEN_SOURCE,
                message,
            });
        },
        [drawer.opportunityWorkspaceContext, failDrawerLinkPending]
    );

    const commitDrawerModelSwap = useCallback(
        (params: OpenDrawerParams, preload: DrawerViewModelPreload | null) => {
            const target = { entityType: params.type, entityId: params.id.trim() };
            const commitKey = `${target.entityType}:${target.entityId}:${preload ? "ready" : "miss"}`;
            const pendingKey = drawerLinkPendingKeyFromOpenParams({
                ...params,
                opportunityWorkspaceContext:
                    params.opportunityWorkspaceContext ?? drawer.opportunityWorkspaceContext ?? null,
            });

            logDrawerVmRuntimeDiagnostic("drawer_vm_model_swap_apply", {
                entity_type: params.type,
                entity_id: params.id,
                preload_ready: Boolean(preload),
                open_source: params.source ?? DRAWER_MODEL_SWAP_OPEN_SOURCE,
            });

            if (!preload) {
                swapFallbackFetchPendingRef.current = true;
                if (lastAttachedSwapPreloadKeyRef.current !== commitKey) {
                    lastAttachedSwapPreloadKeyRef.current = commitKey;
                    setDrawerRuntimePhase((prev) => drawerRuntimePhaseForSwapFallbackFetch(prev, target));
                }
                return;
            }

            if (preload.entityType === "opportunities") {
                opportunityDrawerPreloadRef.current = preload.preload;
                markOpportunityPreloadReady();
            } else if (preload.entityType === "persons") {
                personDrawerPreloadRef.current = preload.preload;
            }

            swapFallbackFetchPendingRef.current = false;
            if (lastAttachedSwapPreloadKeyRef.current === commitKey) {
                setDrawerLinkPendingKey((current) => (current === pendingKey ? null : current));
                return;
            }
            lastAttachedSwapPreloadKeyRef.current = commitKey;
            pendingModelSwapParamsRef.current = null;

            setDrawerLinkPendingKey((current) => (current === pendingKey ? null : current));

            applyDrawerTargetNavigation(
                {
                    ...params,
                    source: params.source ?? DRAWER_MODEL_SWAP_OPEN_SOURCE,
                },
                { skipStackPush: true }
            );
            logDrawerVmRuntimeDiagnostic("model_swap_commit", {
                entity_type: params.type,
                entity_id: params.id,
                open_source: params.source ?? DRAWER_MODEL_SWAP_OPEN_SOURCE,
                runtime:
                    params.type === "opportunities" ? "opportunity-vm"
                    : params.personDrawerOpenSeed?.presentation_emphasis === "child_lifecycle" ||
                        params.source === "opportunity_inquiry_child" ?
                        "child-vm"
                    :   "person-vm",
            });
            setDrawerRuntimePhase((prev) => drawerRuntimePhaseForShowing(prev));
        },
        [applyDrawerTargetNavigation, drawer.opportunityWorkspaceContext, markOpportunityPreloadReady]
    );

    const openDrawerModelSwap = useCallback(
        (params: OpenDrawerParams) => {
            const proceedSwap = () => {
                const target = {
                    entityType: params.type,
                    entityId: params.id.trim(),
                };
                lastAttachedSwapPreloadKeyRef.current = null;
                pushDrawerToStack(drawer);
                const swapParams: OpenDrawerParams = {
                    ...params,
                    source: params.source ?? DRAWER_MODEL_SWAP_OPEN_SOURCE,
                    opportunityWorkspaceContext:
                        params.opportunityWorkspaceContext ??
                        drawer.opportunityWorkspaceContext ??
                        null,
                };
                pendingModelSwapParamsRef.current = swapParams;
                const pendingKey = drawerLinkPendingKeyFromOpenParams(swapParams);
                logDrawerTargetCachePeek(swapParams, "model_swap");
                beginDrawerLinkPendingIfCold(
                    {
                        begin: beginDrawerLinkPending,
                        fail: failDrawerLinkPending,
                        isPending: (key) =>
                            drawerLinkPendingKey != null && drawerLinkPendingKey === key,
                    },
                    pendingKey,
                    swapParams
                );
                setDrawerRuntimePhase((prev) => drawerRuntimePhaseForSwapStart(prev, target));

                const prepareParams = buildPrepareParamsFromOpenDrawer(swapParams);
                const syncPreload = peekDrawerViewModelPreloadSync(prepareParams);
                if (syncPreload) {
                    logDrawerVmRuntimeDiagnostic("model_swap_cache_hit", {
                        entity_type: swapParams.type,
                        entity_id: swapParams.id,
                        open_source: swapParams.source ?? null,
                    });
                    commitDrawerModelSwap(swapParams, syncPreload);
                    return;
                }
                logDrawerVmRuntimeDiagnostic("model_swap_cache_miss", {
                    entity_type: swapParams.type,
                    entity_id: swapParams.id,
                    open_source: swapParams.source ?? null,
                });
                void prepareDrawerViewModelForOpen(swapParams)
                    .then((preload) => {
                        commitDrawerModelSwap(swapParams, preload);
                    })
                    .catch(() => {
                        failDrawerModelSwap(swapParams, DRAWER_LINK_OPEN_FAILED_MESSAGE);
                    });
            };
            if (drawer.type === "persons" && drawer.id) {
                confirmDiscardPersonDrawerUnsaved(proceedSwap);
                return;
            }
            proceedSwap();
        },
        [
            beginDrawerLinkPending,
            commitDrawerModelSwap,
            drawer,
            drawerLinkPendingKey,
            failDrawerLinkPending,
            failDrawerModelSwap,
            prepareDrawerViewModelForOpen,
            pushDrawerToStack,
        ]
    );

    const openDrawer = useCallback(
        (params: OpenDrawerParams) => {
            const proceedOpen = () => {
            if (
                drawer.type &&
                drawer.id &&
                isDrawerModelSwapEligible(drawer.type, drawer.id, params.type, params.id) &&
                (params.type === "opportunities" || params.type === "persons")
            ) {
                openDrawerModelSwap(params);
                return;
            }
            if (
                params.type === "opportunities" &&
                shouldDeferOpportunityDrawerOpen(pathname, params.id)
            ) {
                setDrawer((prev) => {
                    pushDrawerToStack(prev);
                    return { type: null, id: null };
                });
                markDrawerOpenStart();
                setOpeningOpportunity({
                    id: params.id,
                    defaultOpportunitySurface: params.defaultOpportunitySurface,
                    operationalVisualContext: params.operationalVisualContext,
                    opportunityWorkspaceContext: params.opportunityWorkspaceContext ?? null,
                    opportunityQueuePreviewSeed: params.opportunityQueuePreviewSeed ?? null,
                    opportunityQueueNavigator: params.opportunityQueueNavigator ?? null,
                });
                return;
            }

            const coldVmOpen =
                (params.type === "opportunities" || params.type === "persons") &&
                (!drawer.type || !drawer.id);
            if (coldVmOpen) {
                setDrawerRuntimePhase((prev) =>
                    drawerRuntimePhaseForOpeningCold(prev, {
                        entityType: params.type,
                        entityId: params.id.trim(),
                    })
                );
            } else if (drawer.type && drawer.id) {
                setDrawerRuntimePhase((prev) => drawerRuntimePhaseForShowing(prev));
            }

            setDrawer((prev) => {
                const parent = params.parent;
                const prevMatchesParent =
                    parent != null &&
                    prev.type === parent.type &&
                    String(prev.id ?? "") === String(parent.id);
                const swapInPlace = params.source === GLOBAL_SEARCH_DRAWER_OPEN_SOURCE;
                if (swapInPlace) {
                    /* Global search replaces the open record — no stack push, no close/reopen flicker. */
                } else if (parent != null && !prevMatchesParent && parent.type && parent.id) {
                    setStack((s) => [
                        ...s,
                        {
                            type: parent.type,
                            id: parent.id,
                        },
                    ]);
                } else {
                    pushDrawerToStack(prev);
                }
                const next: AdminDrawerState = {
                    type: params.type,
                    id: params.id,
                    defaultWorkflowEntityType: params.defaultWorkflowEntityType,
                    defaultCustomerId: params.defaultCustomerId,
                    defaultVendorId: params.defaultVendorId,
                    defaultSchedulePrefill: params.defaultSchedulePrefill,
                    defaultJobPrefill: params.defaultJobPrefill,
                    jobRecordSurface: params.type === "jobs" ? params.jobRecordSurface : undefined,
                    operationalVisualContext:
                        params.operationalVisualContext ?? prev.operationalVisualContext,
                    defaultOpportunitySurface: params.defaultOpportunitySurface,
                    opportunityWorkspaceContext:
                        params.opportunityWorkspaceContext ??
                        (params.type === "opportunities" ? null : prev.opportunityWorkspaceContext) ??
                        null,
                    opportunityQueuePreviewSeed:
                        params.type === "opportunities" ? params.opportunityQueuePreviewSeed ?? null : null,
                    opportunityQueueNavigator:
                        params.type === "opportunities" ? params.opportunityQueueNavigator ?? null : null,
                    openSource: params.source ?? null,
                    personDrawerOpenSeed:
                        params.type === "persons" ? params.personDrawerOpenSeed ?? null : null,
                };
                if (
                    params.type === "opportunities" &&
                    params.opportunityQueueNavigator &&
                    params.opportunityWorkspaceContext
                ) {
                    prefetchAdjacentOpportunityDrawers({
                        navigator: params.opportunityQueueNavigator,
                        currentRecordId: params.id,
                        workspaceContext: params.opportunityWorkspaceContext,
                    });
                }
                return next;
            });
            };
            if (drawer.type === "persons" && drawer.id) {
                confirmDiscardPersonDrawerUnsaved(proceedOpen);
                return;
            }
            proceedOpen();
        },
        [drawer.id, drawer.type, openDrawerModelSwap, pathname, pushDrawerToStack]
    );

    const restoreVmPreloadFromStackItem = useCallback(
        (item: DrawerStackItem) => {
            if (!item.type || !item.id) return;
            const sync = peekDrawerViewModelPreloadSync(
                buildPrepareParamsFromOpenDrawer({
                    type: item.type,
                    id: item.id,
                    source: item.openSource ?? undefined,
                    personDrawerOpenSeed: item.personDrawerOpenSeed ?? null,
                    opportunityWorkspaceContext: item.opportunityWorkspaceContext ?? null,
                })
            );
            if (!sync) return;
            if (sync.entityType === "opportunities") {
                opportunityDrawerPreloadRef.current = sync.preload;
                markOpportunityPreloadReady();
            } else if (sync.entityType === "persons") {
                personDrawerPreloadRef.current = sync.preload;
            }
        },
        [markOpportunityPreloadReady]
    );

    const goBack = useCallback(() => {
        const proceedBack = () => {
        setStack((s) => {
            const next = [...s];
            const item = next.pop();
            if (item) {
                swapFallbackFetchPendingRef.current = false;
                lastAttachedSwapPreloadKeyRef.current = null;
                swapFallbackFetchInFlightKeyRef.current = null;
                pendingModelSwapParamsRef.current = null;
                setDrawerLinkPendingKey(null);
                const backParams = buildPrepareParamsFromOpenDrawer({
                    type: item.type,
                    id: item.id,
                    source: DRAWER_BACK_TO_LEAD_OPEN_SOURCE,
                    personDrawerOpenSeed: item.personDrawerOpenSeed ?? null,
                    opportunityWorkspaceContext:
                        item.opportunityWorkspaceContext ?? drawer.opportunityWorkspaceContext ?? null,
                });
                const syncBack = peekDrawerViewModelPreloadSync(backParams);
                logDrawerVmRuntimeDiagnostic(
                    syncBack ? "back_to_lead_cache_hit" : "back_to_lead_cache_miss",
                    {
                        entity_type: item.type,
                        entity_id: item.id,
                        open_source: DRAWER_BACK_TO_LEAD_OPEN_SOURCE,
                    }
                );
                if (syncBack) {
                    logDrawerVmRuntimeDiagnostic("model_swap_cache_hit", {
                        entity_type: item.type,
                        entity_id: item.id,
                        open_source: DRAWER_BACK_TO_LEAD_OPEN_SOURCE,
                    });
                }
                restoreVmPreloadFromStackItem(item);
                setDrawerRuntimePhase((prev) => drawerRuntimePhaseForShowing(prev));
                setDrawer({
                    type: item.type,
                    id: item.id,
                    defaultWorkflowEntityType: item.defaultWorkflowEntityType,
                    defaultCustomerId: item.defaultCustomerId,
                    defaultVendorId: item.defaultVendorId,
                    defaultSchedulePrefill: item.defaultSchedulePrefill,
                    defaultJobPrefill: item.defaultJobPrefill,
                    jobRecordSurface: item.jobRecordSurface,
                    operationalVisualContext: item.operationalVisualContext,
                    defaultOpportunitySurface: item.defaultOpportunitySurface,
                    opportunityWorkspaceContext: item.opportunityWorkspaceContext,
                    opportunityQueuePreviewSeed: item.opportunityQueuePreviewSeed,
                    opportunityQueueNavigator: item.opportunityQueueNavigator,
                    personDrawerOpenSeed: item.personDrawerOpenSeed ?? null,
                    openSource: item.openSource ?? null,
                });
            }
            return next;
        });
        };
        confirmDiscardPersonDrawerUnsaved(proceedBack);
    }, [drawer.opportunityWorkspaceContext, restoreVmPreloadFromStackItem]);

    const goBackToLead = useCallback(() => {
        const proceedBackFromStackPop = () => {
            setStack((s) => {
                const next = [...s];
                const item = next.pop();
                if (item) {
                    swapFallbackFetchPendingRef.current = false;
                    lastAttachedSwapPreloadKeyRef.current = null;
                    swapFallbackFetchInFlightKeyRef.current = null;
                    pendingModelSwapParamsRef.current = null;
                    setDrawerLinkPendingKey(null);
                    restoreVmPreloadFromStackItem(item);
                    setDrawerRuntimePhase((prev) => drawerRuntimePhaseForShowing(prev));
                    setDrawer({
                        type: item.type,
                        id: item.id,
                        defaultWorkflowEntityType: item.defaultWorkflowEntityType,
                        defaultCustomerId: item.defaultCustomerId,
                        defaultVendorId: item.defaultVendorId,
                        defaultSchedulePrefill: item.defaultSchedulePrefill,
                        defaultJobPrefill: item.defaultJobPrefill,
                        jobRecordSurface: item.jobRecordSurface,
                        operationalVisualContext: item.operationalVisualContext,
                        defaultOpportunitySurface: item.defaultOpportunitySurface,
                        opportunityWorkspaceContext: item.opportunityWorkspaceContext,
                        opportunityQueuePreviewSeed: item.opportunityQueuePreviewSeed,
                        opportunityQueueNavigator: item.opportunityQueueNavigator,
                        personDrawerOpenSeed: item.personDrawerOpenSeed ?? null,
                        openSource: item.openSource ?? null,
                    });
                }
                return next;
            });
        };

        const proceedBackToLead = () => {
            const lead = findBackToLeadOpportunityInStack(stack, drawer);
            if (!lead?.id) {
                proceedBackFromStackPop();
                return;
            }
            swapFallbackFetchPendingRef.current = false;
            lastAttachedSwapPreloadKeyRef.current = null;
            swapFallbackFetchInFlightKeyRef.current = null;
            pendingModelSwapParamsRef.current = null;
            setDrawerLinkPendingKey(null);
            setDrawerLinkPendingError(null);

            const backParams = buildPrepareParamsFromOpenDrawer({
                type: "opportunities",
                id: lead.id,
                source: DRAWER_BACK_TO_LEAD_OPEN_SOURCE,
                opportunityWorkspaceContext:
                    lead.opportunityWorkspaceContext ?? drawer.opportunityWorkspaceContext ?? null,
                opportunityQueuePreviewSeed: lead.opportunityQueuePreviewSeed ?? null,
                opportunityQueueNavigator: lead.opportunityQueueNavigator ?? null,
            });
            const syncBack = peekDrawerViewModelPreloadSync(backParams);
            logDrawerVmRuntimeDiagnostic(
                syncBack ? "back_to_lead_cache_hit" : "back_to_lead_cache_miss",
                {
                    entity_type: "opportunities",
                    entity_id: lead.id,
                    open_source: DRAWER_BACK_TO_LEAD_OPEN_SOURCE,
                }
            );
            if (syncBack?.entityType === "opportunities") {
                opportunityDrawerPreloadRef.current = syncBack.preload;
                markOpportunityPreloadReady();
            } else {
                restoreVmPreloadFromStackItem(lead);
            }

            const nextStack = (() => {
                const leadIndex = stack.findLastIndex(
                    (item) => item.type === "opportunities" && String(item.id) === String(lead.id)
                );
                return leadIndex >= 0 ? stack.slice(0, leadIndex) : stack;
            })();

            const restoredDrawer = buildRestoredOpportunityDrawerState(
                lead,
                drawer.opportunityWorkspaceContext ?? null
            );

            setStack(nextStack);
            setDrawerRuntimePhase((prev) => drawerRuntimePhaseForShowing(prev));
            setDrawer(restoredDrawer);
            scheduleOpportunityDrawerGraphRewarmAfterRestore({
                drawer: restoredDrawer,
                preload:
                    syncBack?.entityType === "opportunities" ?
                        syncBack.preload
                    :   opportunityDrawerPreloadRef.current,
                stack: nextStack,
            });
        };

        confirmDiscardPersonDrawerUnsaved(proceedBackToLead);
    }, [drawer, markOpportunityPreloadReady, restoreVmPreloadFromStackItem, stack]);

    const closeDrawer = useCallback(() => {
        const proceedClose = () => {
        queueNavRunRef.current += 1;
        setOpportunityQueueNavTargetId(null);
        setOpeningOpportunity(null);
        opportunityDrawerPreloadRef.current = null;
        personDrawerPreloadRef.current = null;
        swapFallbackFetchPendingRef.current = false;
        lastAttachedSwapPreloadKeyRef.current = null;
        swapFallbackFetchInFlightKeyRef.current = null;
        pendingModelSwapParamsRef.current = null;
        setDrawerRuntimePhase(drawerRuntimePhaseForIdle());
        setDrawer({ type: null, id: null });
        setStack([]);
        };
        confirmDiscardPersonDrawerUnsaved(proceedClose);
    }, []);

    /**
     * Close drawer only when the pathname segment changes — not on provider mount,
     * and not on shallow `history.replaceState` queue tabs (pathname unchanged).
     */
    const pathnameRef = useRef(pathname);
    const drawerCloseMountedRef = useRef(false);
    useEffect(() => {
        if (!drawerCloseMountedRef.current) {
            drawerCloseMountedRef.current = true;
            pathnameRef.current = pathname;
            return;
        }
        if (pathnameRef.current === pathname) return;
        pathnameRef.current = pathname;
        closeDrawer();
    }, [pathname, closeDrawer]);

    const previousDrawer = stack.length > 0 ? stack[stack.length - 1] : null;

    const drawerVmRender = useMemo(
        () => resolveDrawerVmRenderDrawer(drawer, drawerRuntimePhase),
        [drawer, drawerRuntimePhase]
    );

    const swapFallbackTargetKey = useMemo(() => {
        if (!drawerRuntimePhase.swapFallbackFetch || !drawerRuntimePhase.target) return null;
        return drawerRuntimeTransitionTargetKey(drawerRuntimePhase.target);
    }, [
        drawerRuntimePhase.swapFallbackFetch,
        drawerRuntimePhase.target?.entityType,
        drawerRuntimePhase.target?.entityId,
    ]);

    useEffect(() => {
        if (!swapFallbackTargetKey || !drawerRuntimePhase.target) return;
        const target = drawerRuntimePhase.target;
        if (target.entityType !== "opportunities" && target.entityType !== "persons") return;
        const pendingParams = pendingModelSwapParamsRef.current;
        if (!pendingParams || pendingParams.type !== target.entityType || pendingParams.id.trim() !== target.entityId) {
            return;
        }

        const inFlightKey = `${drawerRuntimePhase.transitionId}:${swapFallbackTargetKey}`;
        if (swapFallbackFetchInFlightKeyRef.current === inFlightKey) return;
        swapFallbackFetchInFlightKeyRef.current = inFlightKey;

        const prepareParams = buildPrepareParamsFromOpenDrawer({
            ...pendingParams,
            source: pendingParams.source ?? DRAWER_MODEL_SWAP_OPEN_SOURCE,
        });

        let cancelled = false;
        void prepareDrawerViewModelDeduped(prepareParams)
            .then((preload) => {
                if (cancelled) return;
                if (!preload) {
                    failDrawerModelSwap(pendingParams, DRAWER_LINK_OPEN_FAILED_MESSAGE);
                    return;
                }
                commitDrawerModelSwap(pendingParams, preload);
            })
            .catch(() => {
                if (cancelled) return;
                failDrawerModelSwap(pendingParams, DRAWER_LINK_OPEN_FAILED_MESSAGE);
            });
        return () => {
            cancelled = true;
        };
    }, [
        swapFallbackTargetKey,
        drawerRuntimePhase.transitionId,
        drawerRuntimePhase.target,
        commitDrawerModelSwap,
        failDrawerModelSwap,
    ]);

    return (
        <AdminDrawerContext.Provider
            value={{
                drawer,
                openingOpportunity,
                isOpportunityDrawerOpening: openingOpportunity != null,
                opportunityQueueNavTargetId,
                isOpportunityQueueNavPending: opportunityQueueNavTargetId != null,
                stack,
                canGoBack: stack.length > 0,
                previousDrawer,
                drawerVmRender,
                openDrawer,
                navigateOpportunityInQueue,
                goBack,
                goBackToLead,
                closeDrawer,
                consumeOpportunityDrawerPreload,
                opportunityPreloadGeneration,
                drawerTransitionId: drawerRuntimePhase.transitionId,
                drawerRuntimePhase,
                completeDrawerRuntimeTransition,
                consumeDrawerSwapFallbackFetch,
                consumePersonDrawerPreload,
                prepareDrawerViewModel: prepareDrawerViewModelForOpen,
                openDrawerModelSwap,
                cancelOpportunityDrawerOpen,
                commitOpportunityDrawerOpen,
                drawerLinkPendingKey,
                drawerLinkPendingError,
                clearDrawerLinkPendingError,
                drawerLinkPending: drawerLinkPendingApi,
            }}
        >
            {children}
            <PersonDrawerUnsavedChangesModal
                isOpen={personUnsavedPromptOpen}
                onContinueEditing={() => {
                    personUnsavedProceedRef.current = null;
                    setPersonUnsavedPromptOpen(false);
                }}
                onDiscard={() => {
                    setPersonUnsavedPromptOpen(false);
                    const proceed = personUnsavedProceedRef.current;
                    personUnsavedProceedRef.current = null;
                    proceed?.();
                }}
            />
        </AdminDrawerContext.Provider>
    );
}
