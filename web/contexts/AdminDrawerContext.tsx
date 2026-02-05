"use client";

import { createContext, useCallback, useContext, useState, ReactNode } from "react";

export type AdminDrawerEntityType = "jobs" | "opportunities" | "contacts" | "customers" | "schedules";

interface AdminDrawerState {
    type: AdminDrawerEntityType | null;
    id: string | null;
}

interface AdminDrawerContextValue {
    drawer: AdminDrawerState;
    openDrawer: (params: { type: AdminDrawerEntityType; id: string }) => void;
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

    const openDrawer = useCallback((params: { type: AdminDrawerEntityType; id: string }) => {
        setDrawer({ type: params.type, id: params.id });
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
