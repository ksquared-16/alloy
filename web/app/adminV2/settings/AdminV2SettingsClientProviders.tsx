"use client";

import { AdminAuthProvider } from "@/contexts/AdminAuthContext";
import { EntityLabelsProvider, type EntityLabelsMap } from "@/contexts/EntityLabelsContext";
import type { EntityLabelsBootstrapMap } from "@/lib/admin/entityLabelsServer";
import { isExperienceBuilderStudioActive } from "@/lib/layout/experienceBuilderStudioMode";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useMemo, type ReactNode } from "react";
import "./configurationRuntime.css";
import SettingsHierarchyBreadcrumb from "./SettingsHierarchyBreadcrumb";
import { ConfigurationContinuityProvider } from "@/components/adminV2/settings/configurationRuntime/ConfigurationContinuityProvider";
import { normalizeToCanonicalAdminPath } from "@/lib/admin/canonicalAdminRoutes";

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
function AdminV2SettingsClientProvidersInner({
    children,
    userEmail,
    userId,
    orgId,
    role,
    roleKeys,
    initialEntityLabels,
}: AdminV2SettingsClientProvidersProps) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const studioMode = isExperienceBuilderStudioActive(pathname, searchParams);
    const isProcessesSurface = useMemo(() => {
        const path = normalizeToCanonicalAdminPath(pathname ?? "");
        return (
            path === "/organization/processes"
            || path.startsWith("/organization/processes/")
            || path === "/settings/processes"
            || path.startsWith("/settings/processes/")
            || path === "/settings/business-processes"
            || path.startsWith("/settings/business-processes/")
            || path === "/settings/organization/processes"
            || path.startsWith("/settings/organization/processes/")
        );
    }, [pathname]);
    const safeEmail = typeof userEmail === "string" && userEmail.length > 0 ? userEmail : "Unknown";
    const safeUserId = typeof userId === "string" ? userId : "";
    const safeOrgId = typeof orgId === "string" ? orgId : "";
    const safeRole = typeof role === "string" ? role : "";
    const safeRoleKeys = Array.isArray(roleKeys) ? roleKeys : [];

    const labels: EntityLabelsMap | undefined = initialEntityLabels
        ? (initialEntityLabels as EntityLabelsMap)
        : undefined;

    if (studioMode) {
        return (
            <AdminAuthProvider userEmail={safeEmail} userId={safeUserId} orgId={safeOrgId} role={safeRole} roleKeys={safeRoleKeys}>
                <EntityLabelsProvider initialLabels={labels}>
                    <ConfigurationContinuityProvider orgId={safeOrgId}>
                        <div
                            className="fixed inset-0 z-[120] flex min-h-0 min-w-0 flex-col overflow-hidden bg-white"
                            data-testid="experience-builder-studio-shell"
                            data-experience-builder-studio="true"
                        >
                            {children}
                        </div>
                    </ConfigurationContinuityProvider>
                </EntityLabelsProvider>
            </AdminAuthProvider>
        );
    }

    return (
        <AdminAuthProvider userEmail={safeEmail} userId={safeUserId} orgId={safeOrgId} role={safeRole} roleKeys={safeRoleKeys}>
            <EntityLabelsProvider initialLabels={labels}>
                <ConfigurationContinuityProvider orgId={safeOrgId}>
                    <div
                        className="config-runtime-shell flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white"
                        data-organization-shell="true"
                        data-testid="organization-configuration-shell"
                    >
                        <div className="shrink-0 border-b border-alloy-stone/40 bg-white px-4 py-1.5 sm:px-5">
                            <SettingsHierarchyBreadcrumb />
                        </div>
                        <div className="flex min-h-0 flex-1 overflow-hidden">
                            <div
                                className={`min-h-0 min-w-0 flex-1 ${isProcessesSurface ? "flex flex-col overflow-hidden px-4 pb-4 pt-2 sm:px-5" : "overflow-y-auto px-4 pb-6 pt-2 sm:px-5"}`}
                            >
                                {children}
                            </div>
                        </div>
                    </div>
                </ConfigurationContinuityProvider>
            </EntityLabelsProvider>
        </AdminAuthProvider>
    );
}

export default function AdminV2SettingsClientProviders(props: AdminV2SettingsClientProvidersProps) {
    return (
        <Suspense fallback={<div className="flex min-h-0 flex-1 items-center justify-center text-sm text-alloy-midnight/55">Loading settings…</div>}>
            <AdminV2SettingsClientProvidersInner {...props} />
        </Suspense>
    );
}
