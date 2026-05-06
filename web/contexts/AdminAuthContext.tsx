"use client";

import { createContext, useContext, ReactNode } from "react";
import { hasPortalAdminMutateAccess } from "@/lib/admin/adminPortalRolePick";

export interface AdminAuthContextValue {
    userEmail: string;
    role: string;
    /** Membership role keys for the resolved org when the shell supplied them (Admin V2 / auth layout). */
    roleKeys: string[];
    /** True only when membership includes portal `admin` (same bar as `ctx.role === "admin"` on APIs). */
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
    roleKeys,
    children,
}: {
    userEmail: string;
    role: string;
    /** When provided (non-empty), mutate access follows membership keys — matches admin API gates. */
    roleKeys?: string[];
    children: ReactNode;
}) {
    const safeEmail = typeof userEmail === "string" ? userEmail : "Unknown";
    const safeRole = typeof role === "string" ? role : "";
    const keys = Array.isArray(roleKeys) ? roleKeys.map((k) => String(k).trim()).filter(Boolean) : [];
    const normalizedCompatRole = safeRole.trim().toLowerCase();
    const canMutate = keys.length > 0 ? hasPortalAdminMutateAccess(keys) : normalizedCompatRole === "admin";
    const value: AdminAuthContextValue = {
        userEmail: safeEmail,
        role: safeRole,
        roleKeys: keys,
        canMutate,
    };
    return (
        <AdminAuthContext.Provider value={value}>
            {children}
        </AdminAuthContext.Provider>
    );
}
