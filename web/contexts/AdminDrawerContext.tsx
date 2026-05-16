"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { OpportunityDrawerQueuePreviewSeed } from "@/lib/admin/opportunityDrawerQueuePreviewSeed";
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
}

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
};

interface AdminDrawerContextValue {
    drawer: AdminDrawerState;
    /** When opening a linked record from inside a drawer, the previous drawer is pushed here. */
    stack: DrawerStackItem[];
    canGoBack: boolean;
    /** Top of stack (the drawer we would return to on Back). */
    previousDrawer: DrawerStackItem | null;
    openDrawer: (params: {
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
    }) => void;
    goBack: () => void;
    closeDrawer: () => void;
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

    const openDrawer = useCallback(
        (params: {
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
        }) => {
            setDrawer((prev) => {
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
                        },
                    ]);
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
                    operationalVisualContext: params.operationalVisualContext,
                    defaultOpportunitySurface: params.defaultOpportunitySurface,
                    opportunityWorkspaceContext:
                        params.type === "opportunities" ? params.opportunityWorkspaceContext ?? null : null,
                    opportunityQueuePreviewSeed:
                        params.type === "opportunities" ? params.opportunityQueuePreviewSeed ?? null : null,
                };
            });
        },
        []
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
                });
            }
            return next;
        });
    }, []);

    const closeDrawer = useCallback(() => {
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
        <AdminDrawerContext.Provider value={{ drawer, stack, canGoBack: stack.length > 0, previousDrawer, openDrawer, goBack, closeDrawer }}>
            {children}
        </AdminDrawerContext.Provider>
    );
}
