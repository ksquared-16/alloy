"use client";

import type { ReactNode } from "react";

import { AdminAuthProvider } from "@/contexts/AdminAuthContext";

type AdminV2RootAuthProviderProps = {
    userEmail: string;
    userId: string;
    orgId: string;
    role: string;
    roleKeys: string[];
    /** Resolved grants for the org, so shell chrome can decide what to OFFER. Never an authorization. */
    permissionKeys: string[];
    children: ReactNode;
};

/** Shell-level auth for TopNavBar (Tasks modal) and other chrome outside nested route providers. */
export default function AdminV2RootAuthProvider({
    userEmail,
    userId,
    orgId,
    role,
    roleKeys,
    permissionKeys,
    children,
}: AdminV2RootAuthProviderProps) {
    return (
        <AdminAuthProvider
            userEmail={userEmail}
            userId={userId}
            orgId={orgId}
            role={role}
            roleKeys={roleKeys}
            permissionKeys={permissionKeys}
        >
            {children}
        </AdminAuthProvider>
    );
}
