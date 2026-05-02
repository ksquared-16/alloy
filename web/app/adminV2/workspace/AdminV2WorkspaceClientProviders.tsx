"use client";

import { AdminAuthProvider } from "@/contexts/AdminAuthContext";
import { AdminDrawerProvider } from "@/contexts/AdminDrawerContext";
import { AdminVerticalProvider } from "@/contexts/AdminVerticalContext";
import { EntityLabelsProvider, type EntityLabelsMap } from "@/contexts/EntityLabelsContext";
import AdminEntityDrawer from "@/components/admin/AdminEntityDrawer";
import type { EntityLabelsBootstrapMap } from "@/lib/admin/entityLabelsServer";
import { AdminViewerTimezoneProvider, type AdminViewerTimezoneValue } from "@/contexts/AdminViewerTimezoneContext";
import { WorkspaceOrgProvider } from "@/contexts/WorkspaceOrgContext";
import type { CSSProperties, ReactNode } from "react";

interface AdminV2WorkspaceClientProvidersProps {
  children: ReactNode;
  userEmail: string;
  role: string;
  /** Same server bootstrap as `/admin` — shape matches `EntityLabelsMap`. */
  initialEntityLabels?: EntityLabelsBootstrapMap;
  /** Display name from `orgs.name` (server-loaded). */
  orgName?: string | null;
  /** Server-resolved user → org → UTC display timezone. */
  initialViewerTimezone?: AdminViewerTimezoneValue;
}

export default function AdminV2WorkspaceClientProviders({
  children,
  userEmail,
  role,
  initialEntityLabels,
  orgName = null,
  initialViewerTimezone,
}: AdminV2WorkspaceClientProvidersProps) {
  const safeEmail = typeof userEmail === "string" && userEmail.length > 0 ? userEmail : "Unknown";
  const safeRole = typeof role === "string" ? role : "";
  const tzValue: AdminViewerTimezoneValue = initialViewerTimezone ?? {
    iana: "UTC",
    source: "utc_fallback",
  };

  const labels: EntityLabelsMap | undefined = initialEntityLabels
    ? (initialEntityLabels as EntityLabelsMap)
    : undefined;

  const workspaceScrollStyle = {
    "--ws-rail-sticky-top": "10px",
    "--ws-shell-bottom-safe": "120px",
  } as CSSProperties;

  return (
    <AdminAuthProvider userEmail={safeEmail} role={safeRole}>
      <AdminVerticalProvider>
        <EntityLabelsProvider initialLabels={labels}>
          <AdminViewerTimezoneProvider value={tzValue}>
            <WorkspaceOrgProvider orgName={orgName}>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <AdminDrawerProvider>
                <div
                    className="adminv2-workspace-scroll-surface min-h-0 flex-1 overflow-auto px-4 py-3 sm:px-5"
                    style={workspaceScrollStyle}
                >
                  {children}
                </div>
                <AdminEntityDrawer />
              </AdminDrawerProvider>
            </div>
          </WorkspaceOrgProvider>
          </AdminViewerTimezoneProvider>
        </EntityLabelsProvider>
      </AdminVerticalProvider>
    </AdminAuthProvider>
  );
}
