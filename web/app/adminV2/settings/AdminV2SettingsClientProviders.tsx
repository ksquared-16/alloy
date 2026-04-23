"use client";

import { AdminAuthProvider } from "@/contexts/AdminAuthContext";
import { EntityLabelsProvider, type EntityLabelsMap } from "@/contexts/EntityLabelsContext";
import type { EntityLabelsBootstrapMap } from "@/lib/admin/entityLabelsServer";
import type { ReactNode } from "react";
import SettingsHierarchyBreadcrumb from "./SettingsHierarchyBreadcrumb";

interface AdminV2SettingsClientProvidersProps {
    children: ReactNode;
    userEmail: string;
    role: string;
    initialEntityLabels?: EntityLabelsBootstrapMap;
}

/**
 * Minimal client providers for Settings (control plane).
 * Matches workspace auth/labels bootstrap so reused /admin/system/* clients work unchanged.
 */
export default function AdminV2SettingsClientProviders({
    children,
    userEmail,
    role,
    initialEntityLabels,
}: AdminV2SettingsClientProvidersProps) {
    const safeEmail = typeof userEmail === "string" && userEmail.length > 0 ? userEmail : "Unknown";
    const safeRole = typeof role === "string" ? role : "";

    const labels: EntityLabelsMap | undefined = initialEntityLabels
        ? (initialEntityLabels as EntityLabelsMap)
        : undefined;

    return (
        <AdminAuthProvider userEmail={safeEmail} role={safeRole}>
            <EntityLabelsProvider initialLabels={labels}>
                <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                    <div
                        className="shrink-0 border-b border-admin-border px-6 py-2.5"
                        style={{ backgroundColor: "rgba(255,255,255,0.55)" }}
                    >
                        <SettingsHierarchyBreadcrumb />
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto p-6">{children}</div>
                </div>
            </EntityLabelsProvider>
        </AdminAuthProvider>
    );
}
