"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from "react";
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
    previewSeedForQueueNavigatorRecord,
    resolveOpportunityQueueNavigateTargetId,
    type OpportunityDrawerQueueNavigator,
} from "@/lib/admin/opportunityDrawerQueueNavigator";
import { isOpportunityDrawerBootstrapWarm } from "@/lib/admin/opportunityDrawerBootstrapClient";
import { isOpportunityDrawerPrimaryWarm } from "@/lib/admin/opportunityDrawerPrimaryPrefetch";
import { markDrawerOpenStart } from "@/lib/perf/adminV2DrawerPerf";
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

interface AdminDrawerState {
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
    openDrawer: (params: OpenDrawerParams) => void;
    /** Prev/next within the loaded work-unit queue — drawer stays open. */
    navigateOpportunityInQueue: (direction: "prev" | "next") => void;
    goBack: () => void;
    closeDrawer: () => void;
    /** One-shot handoff after pre-open fetch (AdminEntityDrawer layout effect). */
    consumeOpportunityDrawerPreload: (opportunityId: string) => OpportunityDrawerOpenPreload | null;
    cancelOpportunityDrawerOpen: () => void;
    commitOpportunityDrawerOpen: (
        opening: OpportunityDrawerOpeningParams,
        preload: OpportunityDrawerOpenPreload
    ) => void;
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
    const queueNavRunRef = useRef(0);

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
                },
            ]);
        }
    }, []);

    const commitOpportunityDrawerOpen = useCallback(
        (opening: OpportunityDrawerOpeningParams, preload: OpportunityDrawerOpenPreload) => {
            opportunityDrawerPreloadRef.current = preload;
            setOpeningOpportunity(null);
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
        []
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

            if (preloadReady || snapshotWarm) {
                logNav(preloadReady ? "preload_hit" : "snapshot_hit", false);
                return;
            }

            if (primaryWarm && bootstrapWarm) {
                logNav("warm_composed", false);
                void loadOpportunityDrawerComposedOpen(targetId, workspace, workspaceDataFetchInit())
                    .then(({ preload }) => {
                        if (run !== queueNavRunRef.current) return;
                        opportunityDrawerPreloadRef.current = preload;
                    })
                    .catch(() => {
                        /* drawer shows queue seed until refetch */
                    });
                return;
            }

            setOpportunityQueueNavTargetId(targetId);
            logNav("cold_composed", true);
            void loadOpportunityDrawerComposedOpen(targetId, workspace, workspaceDataFetchInit())
                .then(({ preload }) => {
                    if (run !== queueNavRunRef.current) return;
                    opportunityDrawerPreloadRef.current = preload;
                    setOpportunityQueueNavTargetId(null);
                })
                .catch(() => {
                    if (run !== queueNavRunRef.current) return;
                    setOpportunityQueueNavTargetId(null);
                });
        },
        [applyOpportunityQueueNavigation, drawer.id, drawer.opportunityQueueNavigator, drawer.opportunityWorkspaceContext, drawer.type]
    );

    const consumeOpportunityDrawerPreload = useCallback((opportunityId: string): OpportunityDrawerOpenPreload | null => {
        const p = opportunityDrawerPreloadRef.current;
        if (!p || p.opportunityId !== opportunityId.trim()) return null;
        opportunityDrawerPreloadRef.current = null;
        return p;
    }, []);

    const openDrawer = useCallback(
        (params: OpenDrawerParams) => {
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

            setDrawer((prev) => {
                const parent = params.parent;
                const prevMatchesParent =
                    parent != null &&
                    prev.type === parent.type &&
                    String(prev.id ?? "") === String(parent.id);
                if (parent != null && !prevMatchesParent && parent.type && parent.id) {
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
                        params.type === "opportunities" ? params.opportunityWorkspaceContext ?? null : null,
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
        },
        [pathname, pushDrawerToStack]
    );

    const goBack = useCallback(() => {
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
            }
            return next;
        });
    }, []);

    const closeDrawer = useCallback(() => {
        queueNavRunRef.current += 1;
        setOpportunityQueueNavTargetId(null);
        setOpeningOpportunity(null);
        opportunityDrawerPreloadRef.current = null;
        setDrawer({ type: null, id: null });
        setStack([]);
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
                openDrawer,
                navigateOpportunityInQueue,
                goBack,
                closeDrawer,
                consumeOpportunityDrawerPreload,
                cancelOpportunityDrawerOpen,
                commitOpportunityDrawerOpen,
            }}
        >
            {children}
        </AdminDrawerContext.Provider>
    );
}
