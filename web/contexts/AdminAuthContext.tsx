"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

type AdminAuthContextValue = {
    role: string;
    canMutate: boolean;
};

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({
    role,
    children,
}: {
    role: string;
    children: ReactNode;
}) {
    const value = useMemo(
        () => ({
            role,
            canMutate: role === "admin",
        }),
        [role]
    );
    return (
        <AdminAuthContext.Provider value={value}>
            {children}
        </AdminAuthContext.Provider>
    );
}

export function useAdminAuth(): AdminAuthContextValue {
    const ctx = useContext(AdminAuthContext);
    if (!ctx) {
        return { role: "", canMutate: false };
    }
    return ctx;
}
