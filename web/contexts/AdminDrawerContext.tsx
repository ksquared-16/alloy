"use client";

import { createContext, useCallback, useContext, useState, ReactNode } from "react";

export type AdminDrawerEntityType = "jobs" | "opportunities" | "contacts" | "customers" | "customer_members" | "schedules" | "discount_redemptions" | "workflows" | "vendors" | "subscriptions" | "locations" | "payments" | "service_offerings" | "service_plan_templates" | "addons";

export type SchedulePrefill = {
    job_id: string;
    customer_id?: string | null;
    location_id?: string | null;
    assigned_vendor_id?: string | null;
    status_key?: string | null;
};

/** When opening jobs with id "new", prefill opportunity_id, customer_id, primary_contact_id. */
export type JobPrefill = {
    opportunity_id?: string | null;
    customer_id?: string | null;
    primary_contact_id?: string | null;
};

interface AdminDrawerState {
    type: AdminDrawerEntityType | null;
    id: string | null;
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
}

export type DrawerStackItem = { type: AdminDrawerEntityType; id: string };

interface AdminDrawerContextValue {
    drawer: AdminDrawerState;
    /** When opening a linked record from inside a drawer, the previous drawer is pushed here. */
    stack: DrawerStackItem[];
    canGoBack: boolean;
    /** Top of stack (the drawer we would return to on Back). */
    previousDrawer: DrawerStackItem | null;
    openDrawer: (params: { type: AdminDrawerEntityType; id: string; defaultWorkflowEntityType?: string; defaultCustomerId?: string; defaultVendorId?: string; defaultSchedulePrefill?: SchedulePrefill; defaultJobPrefill?: JobPrefill }) => void;
    goBack: () => void;
    closeDrawer: () => void;
}

const AdminDrawerContext = createContext<AdminDrawerContextValue | null>(null);

export function useAdminDrawer() {
    const ctx = useContext(AdminDrawerContext);
    if (!ctx) throw new Error("useAdminDrawer must be used within AdminDrawerProvider");
    return ctx;
}

export function AdminDrawerProvider({ children }: { children: ReactNode }) {
    const [drawer, setDrawer] = useState<AdminDrawerState>({ type: null, id: null });
    const [stack, setStack] = useState<DrawerStackItem[]>([]);

    const openDrawer = useCallback((params: { type: AdminDrawerEntityType; id: string; defaultWorkflowEntityType?: string; defaultCustomerId?: string; defaultVendorId?: string; defaultSchedulePrefill?: SchedulePrefill; defaultJobPrefill?: JobPrefill }) => {
        setDrawer((prev) => {
            const prevType = prev.type;
            const prevId = prev.id;
            if (prevType != null && prevId != null) {
                setStack((s) => [...s, { type: prevType, id: prevId }]);
            }
            return {
                type: params.type,
                id: params.id,
                defaultWorkflowEntityType: params.defaultWorkflowEntityType,
                defaultCustomerId: params.defaultCustomerId,
                defaultVendorId: params.defaultVendorId,
                defaultSchedulePrefill: params.defaultSchedulePrefill,
                defaultJobPrefill: params.defaultJobPrefill,
            };
        });
    }, []);

    const goBack = useCallback(() => {
        setStack((s) => {
            const next = [...s];
            const item = next.pop();
            if (item) setDrawer({ type: item.type, id: item.id });
            return next;
        });
    }, []);

    const closeDrawer = useCallback(() => {
        setDrawer({ type: null, id: null });
        setStack([]);
    }, []);

    const previousDrawer = stack.length > 0 ? stack[stack.length - 1] : null;

    return (
        <AdminDrawerContext.Provider value={{ drawer, stack, canGoBack: stack.length > 0, previousDrawer, openDrawer, goBack, closeDrawer }}>
            {children}
        </AdminDrawerContext.Provider>
    );
}
