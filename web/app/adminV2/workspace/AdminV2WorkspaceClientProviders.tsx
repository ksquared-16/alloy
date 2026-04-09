"use client";

import { AdminAuthProvider } from "@/contexts/AdminAuthContext";
import { AdminDrawerProvider } from "@/contexts/AdminDrawerContext";
import { AdminVerticalProvider } from "@/contexts/AdminVerticalContext";
import { EntityLabelsProvider, type EntityLabelsMap } from "@/contexts/EntityLabelsContext";
import AdminEntityDrawer from "@/components/admin/AdminEntityDrawer";
import type { EntityLabelsBootstrapMap } from "@/lib/admin/entityLabelsServer";
import { WorkspaceOrgProvider } from "@/contexts/WorkspaceOrgContext";
import type { ReactNode } from "react";

interface AdminV2WorkspaceClientProvidersProps {
  children: ReactNode;
  userEmail: string;
  role: string;
  /** Same server bootstrap as `/admin` — shape matches `EntityLabelsMap`. */
  initialEntityLabels?: EntityLabelsBootstrapMap;
  /** Display name from `orgs.name` (server-loaded). */
  orgName?: string | null;
}

export default function AdminV2WorkspaceClientProviders({
  children,
  userEmail,
  role,
  initialEntityLabels,
  orgName = null,
}: AdminV2WorkspaceClientProvidersProps) {
  const safeEmail = typeof userEmail === "string" && userEmail.length > 0 ? userEmail : "Unknown";
  const safeRole = typeof role === "string" ? role : "";

  const labels: EntityLabelsMap | undefined = initialEntityLabels
    ? (initialEntityLabels as EntityLabelsMap)
    : undefined;

  return (
    <AdminAuthProvider userEmail={safeEmail} role={safeRole}>
      <AdminVerticalProvider>
        <EntityLabelsProvider initialLabels={labels}>
          <WorkspaceOrgProvider orgName={orgName}>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <AdminDrawerProvider>
                <div className="min-h-0 flex-1 overflow-auto p-6">{children}</div>
                <AdminEntityDrawer />
              </AdminDrawerProvider>
            </div>
          </WorkspaceOrgProvider>
        </EntityLabelsProvider>
      </AdminVerticalProvider>
    </AdminAuthProvider>
  );
}
