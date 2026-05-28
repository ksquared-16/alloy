"use client";

import { AdminAuthProvider } from "@/contexts/AdminAuthContext";
import { AdminDrawerProvider } from "@/contexts/AdminDrawerContext";
import { EntityLabelsProvider, type EntityLabelsMap } from "@/contexts/EntityLabelsContext";
import AdminEntityDrawer from "@/components/admin/AdminEntityDrawer";
import type { EntityLabelsBootstrapMap } from "@/lib/admin/entityLabelsServer";
import type { ReactNode } from "react";
import SettingsHierarchyBreadcrumb from "./SettingsHierarchyBreadcrumb";

interface AdminV2SettingsClientProvidersProps {
    children: ReactNode;
    userEmail: string;
    userId: string;
    orgId: string;
    role: string;
    /** Same `user_roles.role` keys as admin APIs — drives `canMutate` authoritatively. */
    roleKeys: string[];
    initialEntityLabels?: EntityLabelsBootstrapMap;
}

/**
 * Minimal client providers for Settings (control plane).
 * Matches workspace auth/labels bootstrap so reused /admin/system/* clients work unchanged.
 */
export default function AdminV2SettingsClientProviders({
    children,
    userEmail,
    userId,
    orgId,
    role,
    roleKeys,
    initialEntityLabels,
}: AdminV2SettingsClientProvidersProps) {
    const safeEmail = typeof userEmail === "string" && userEmail.length > 0 ? userEmail : "Unknown";
    const safeUserId = typeof userId === "string" ? userId : "";
    const safeOrgId = typeof orgId === "string" ? orgId : "";
    const safeRole = typeof role === "string" ? role : "";
    const safeRoleKeys = Array.isArray(roleKeys) ? roleKeys : [];

    const labels: EntityLabelsMap | undefined = initialEntityLabels
        ? (initialEntityLabels as EntityLabelsMap)
        : undefined;

    return (
        <AdminAuthProvider userEmail={safeEmail} userId={safeUserId} orgId={safeOrgId} role={safeRole} roleKeys={safeRoleKeys}>
            <EntityLabelsProvider initialLabels={labels}>
                <AdminDrawerProvider>
                    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                        <div className="shrink-0 border-b border-alloy-forge/10 bg-white/25 px-4 py-2 backdrop-blur-sm sm:px-5">
                            <SettingsHierarchyBreadcrumb />
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-3 sm:px-5">{children}</div>
                    </div>
                    <AdminEntityDrawer />
                </AdminDrawerProvider>
            </EntityLabelsProvider>
        </AdminAuthProvider>
    );
}
