"use client";

import { createContext, useCallback, useContext, useState, ReactNode } from "react";

export type AdminDrawerEntityType = "jobs" | "opportunities" | "contacts" | "customers" | "customer_members" | "schedules" | "discount_redemptions" | "workflows" | "vendors" | "subscriptions" | "locations";

export type SchedulePrefill = {
    job_id: string;
    customer_id?: string | null;
    location_id?: string | null;
    assigned_vendor_id?: string | null;
    status_key?: string | null;
};

interface AdminDrawerState {
    type: AdminDrawerEntityType | null;
    id: string | null;
    /** When opening workflows with id "new", default the entity_type field to this (e.g. "opportunity"). */
    defaultWorkflowEntityType?: string;
    /** When opening customer_members with id "new", prefill customer_id. */
    defaultCustomerId?: string;
    /** When opening schedules with id "new", prefill job_id, customer_id, location_id, assigned_vendor_id, status_key. */
    defaultSchedulePrefill?: SchedulePrefill;
}

interface AdminDrawerContextValue {
    drawer: AdminDrawerState;
    openDrawer: (params: { type: AdminDrawerEntityType; id: string; defaultWorkflowEntityType?: string; defaultCustomerId?: string; defaultSchedulePrefill?: SchedulePrefill }) => void;
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

    const openDrawer = useCallback((params: { type: AdminDrawerEntityType; id: string; defaultWorkflowEntityType?: string; defaultCustomerId?: string; defaultSchedulePrefill?: SchedulePrefill }) => {
        setDrawer({
            type: params.type,
            id: params.id,
            defaultWorkflowEntityType: params.defaultWorkflowEntityType,
            defaultCustomerId: params.defaultCustomerId,
            defaultSchedulePrefill: params.defaultSchedulePrefill,
        });
    }, []);

    const closeDrawer = useCallback(() => {
        setDrawer({ type: null, id: null });
    }, []);

    return (
        <AdminDrawerContext.Provider value={{ drawer, openDrawer, closeDrawer }}>
            {children}
        </AdminDrawerContext.Provider>
    );
}
