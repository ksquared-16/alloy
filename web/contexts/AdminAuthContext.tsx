"use client";

import { createContext, useContext, ReactNode } from "react";

export interface AdminAuthContextValue {
    userEmail: string;
    role: string;
    /** True only for admin; ops is read-only. */
    canMutate: boolean;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function useAdminAuth() {
    const ctx = useContext(AdminAuthContext);
    if (!ctx) throw new Error("useAdminAuth must be used within AdminAuthProvider");
    return ctx;
}

export function AdminAuthProvider({
    userEmail,
    role,
    children,
}: {
    userEmail: string;
    role: string;
    children: ReactNode;
}) {
    const canMutate = role === "admin";
    const value: AdminAuthContextValue = { userEmail, role, canMutate };
    return (
        <AdminAuthContext.Provider value={value}>
            {children}
        </AdminAuthContext.Provider>
    );
}
