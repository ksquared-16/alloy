"use client";

import { createContext, useCallback, useContext, useState, ReactNode } from "react";

export type AdminDrawerEntityType = "jobs" | "opportunities" | "contacts" | "customers" | "schedules" | "discount_redemptions" | "workflows" | "vendors" | "subscriptions" | "locations";

interface AdminDrawerState {
    type: AdminDrawerEntityType | null;
    id: string | null;
    /** When opening workflows with id "new", default the entity_type field to this (e.g. "opportunity"). */
    defaultWorkflowEntityType?: string;
}

interface AdminDrawerContextValue {
    drawer: AdminDrawerState;
    openDrawer: (params: { type: AdminDrawerEntityType; id: string; defaultWorkflowEntityType?: string }) => void;
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

    const openDrawer = useCallback((params: { type: AdminDrawerEntityType; id: string; defaultWorkflowEntityType?: string }) => {
        setDrawer({
            type: params.type,
            id: params.id,
            defaultWorkflowEntityType: params.defaultWorkflowEntityType,
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
