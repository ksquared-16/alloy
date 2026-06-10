"use client";

import { AdminAuthProvider } from "@/contexts/AdminAuthContext";
import { AdminDrawerProvider } from "@/contexts/AdminDrawerContext";
import { DrawerCommandRailActionsProvider } from "@/contexts/DrawerCommandRailActionsContext";
import { AdminVerticalProvider } from "@/contexts/AdminVerticalContext";
import { EntityLabelsProvider, type EntityLabelsMap } from "@/contexts/EntityLabelsContext";
import AdminEntityDrawer from "@/components/admin/AdminEntityDrawer";
import OpportunityDrawerOpenCoordinator from "@/components/admin/OpportunityDrawerOpenCoordinator";
import ContextualRecordOpenListener from "@/components/adminV2/ContextualRecordOpenListener";
import GlobalRecordSearchOpenListener from "@/components/adminV2/GlobalRecordSearchOpenListener";
import AdminV2ClickDebugInstaller from "@/app/adminV2/components/AdminV2ClickDebugInstaller";
import PlatformSurfacePerfDebugInstaller from "@/app/adminV2/components/PlatformSurfacePerfDebugInstaller";
import type { EntityLabelsBootstrapMap } from "@/lib/admin/entityLabelsServer";
import { AdminOrgOperationalTimezoneProvider } from "@/contexts/AdminOrgOperationalTimezoneContext";
import { AdminViewerTimezoneProvider, type AdminViewerTimezoneValue } from "@/contexts/AdminViewerTimezoneContext";
import { WorkspaceOrgProvider } from "@/contexts/WorkspaceOrgContext";
import WorkspaceSiteFilterPersistenceScopeBridge from "@/app/adminV2/workspace/WorkspaceSiteFilterPersistenceScopeBridge";
import type { CSSProperties, ReactNode } from "react";
import { isBosRightRailCopilotEnabledClient } from "@/lib/bos/bosRightRailCopilotFlag";

interface AdminV2WorkspaceClientProvidersProps {
  children: ReactNode;
  userEmail: string;
  /** Supabase auth user id — scopes workspace sessionStorage cache per principal. */
  principalUserId: string;
  role: string;
  roleKeys: string[];
  /** Same server bootstrap as `/admin` — shape matches `EntityLabelsMap`. */
  initialEntityLabels?: EntityLabelsBootstrapMap;
  /** Display name from `orgs.name` (server-loaded). */
  orgName?: string | null;
  /** Server-resolved organization id for admin session cache scope. */
  orgId?: string | null;
  /** Dept/site scope fingerprint — isolates sessionStorage snapshots when access narrows. */
  accessScopeFingerprint: string;
  /** Server-resolved user → org → UTC display timezone. */
  initialViewerTimezone?: AdminViewerTimezoneValue;
  /** Org operational IANA for schedule defaults. */
  initialOperationalTimezoneIana?: string;
}

export default function AdminV2WorkspaceClientProviders({
  children,
  userEmail,
  principalUserId,
  role,
  roleKeys,
  initialEntityLabels,
  orgName = null,
  orgId = null,
  accessScopeFingerprint,
  initialViewerTimezone,
  initialOperationalTimezoneIana,
}: AdminV2WorkspaceClientProvidersProps) {
  const safeEmail = typeof userEmail === "string" && userEmail.length > 0 ? userEmail : "Unknown";
  const safeRole = typeof role === "string" ? role : "";
  const safeRoleKeys = Array.isArray(roleKeys) ? roleKeys : [];
  const tzValue: AdminViewerTimezoneValue = initialViewerTimezone ?? {
    iana: "UTC",
    source: "utc_fallback",
  };
  const operationalTz =
    typeof initialOperationalTimezoneIana === "string" && initialOperationalTimezoneIana.trim()
      ? initialOperationalTimezoneIana.trim()
      : "UTC";

  const labels: EntityLabelsMap | undefined = initialEntityLabels
    ? (initialEntityLabels as EntityLabelsMap)
    : undefined;

  const bosRailCopilot = isBosRightRailCopilotEnabledClient();
  const workspaceScrollStyle = {
    "--ws-rail-sticky-top": "10px",
    "--ws-shell-bottom-safe": bosRailCopilot ? "16px" : "120px",
    ...(bosRailCopilot ? { "--adminv2-workspace-scroll-pad-y": "24px" } : {}),
  } as CSSProperties;

  return (
    <AdminAuthProvider
      userEmail={safeEmail}
      userId={principalUserId}
      orgId={typeof orgId === "string" ? orgId : ""}
      role={safeRole}
      roleKeys={safeRoleKeys}
    >
      <AdminVerticalProvider>
        <EntityLabelsProvider initialLabels={labels}>
          <AdminOrgOperationalTimezoneProvider iana={operationalTz}>
            <AdminViewerTimezoneProvider value={tzValue}>
              <WorkspaceOrgProvider
                orgName={orgName}
                orgId={orgId}
                principalUserId={principalUserId}
                accessScopeFingerprint={accessScopeFingerprint}
              >
                <WorkspaceSiteFilterPersistenceScopeBridge />
                <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                  <AdminDrawerProvider>
                    <DrawerCommandRailActionsProvider>
                      <AdminV2ClickDebugInstaller />
                      <PlatformSurfacePerfDebugInstaller />
                      <div
                        className="adminv2-workspace-scroll-surface relative z-0 min-h-0 flex-1 px-4 py-3 sm:px-5"
                        style={workspaceScrollStyle}
                      >
                        {children}
                      </div>
                      <OpportunityDrawerOpenCoordinator />
                      <ContextualRecordOpenListener />
                      <GlobalRecordSearchOpenListener />
                      <AdminEntityDrawer />
                    </DrawerCommandRailActionsProvider>
                  </AdminDrawerProvider>
                </div>
              </WorkspaceOrgProvider>
            </AdminViewerTimezoneProvider>
          </AdminOrgOperationalTimezoneProvider>
        </EntityLabelsProvider>
      </AdminVerticalProvider>
    </AdminAuthProvider>
  );
}
