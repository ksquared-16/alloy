"use client";

import { AdminAuthProvider } from "@/contexts/AdminAuthContext";
import { AdminVerticalProvider } from "@/contexts/AdminVerticalContext";
import { EntityLabelsProvider, type EntityLabelsMap } from "@/contexts/EntityLabelsContext";
import AdminEntityDrawer from "@/components/admin/AdminEntityDrawer";
import AdminV2ClickDebugInstaller from "@/app/adminV2/components/AdminV2ClickDebugInstaller";
import PlatformSurfacePerfDebugInstaller from "@/app/adminV2/components/PlatformSurfacePerfDebugInstaller";
import type { EntityLabelsBootstrapMap } from "@/lib/admin/entityLabelsServer";
import { AdminOrgOperationalTimezoneProvider } from "@/contexts/AdminOrgOperationalTimezoneContext";
import { AdminViewerTimezoneProvider, type AdminViewerTimezoneValue } from "@/contexts/AdminViewerTimezoneContext";
import { WorkspaceOrgProvider } from "@/contexts/WorkspaceOrgContext";
import WorkspaceSiteFilterPersistenceScopeBridge from "@/app/adminV2/workspace/WorkspaceSiteFilterPersistenceScopeBridge";
import { OperationalModeEntryProvider } from "@/lib/adminV2/runtime/operationalSubject/OperationalModeEntryContext";
import { WorkspaceRouteVmProvider } from "@/lib/adminV2/runtime/surface/workspaceRouteVmContext";
import { EMPTY_WORKSPACE_ROUTE_VM, type WorkspaceRouteVm } from "@/lib/adminV2/runtime/surface/workspaceRouteVm";
import { SurfaceHostProvider } from "@/lib/experience/surfaceHost/SurfaceHostContext";
import { RuntimeKernelProvider } from "@/lib/runtime/kernel/RuntimeKernelContext";
import SearchAttentionListener from "@/components/adminV2/SearchAttentionListener";
import type { CSSProperties, ReactNode } from "react";

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
  /**
   * Canonical server-composed workspace Route VM (the single first-paint payload). Optional because
   * this providers shell is also reused by non-index surfaces (e.g. `/adminV2/forms`) that have no
   * workspace Route VM — they get the neutral empty VM.
   */
  workspaceRouteVm?: WorkspaceRouteVm;
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
  workspaceRouteVm = EMPTY_WORKSPACE_ROUTE_VM,
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

  const workspaceScrollStyle = {
    "--ws-rail-sticky-top": "10px",
    "--ws-shell-bottom-safe": "16px",
    "--adminv2-workspace-scroll-pad-y": "24px",
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
                <OperationalModeEntryProvider>
                <WorkspaceSiteFilterPersistenceScopeBridge />
                <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                  <AdminV2ClickDebugInstaller />
                  <PlatformSurfacePerfDebugInstaller />
                  <div
                    className="adminv2-workspace-scroll-surface relative z-0 flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-3 sm:px-5"
                    style={workspaceScrollStyle}
                  >
                    <WorkspaceRouteVmProvider value={workspaceRouteVm}>
                      {/* THE RUNTIME KERNEL — mounted ABOVE the Surface Host and OUTSIDE the route
                          subtree, so exactly ONE AttentionOwner / ProvisioningRuntime / FocusOwner
                          governs both retained surfaces and survives every Workspace ⇄ Work Unit
                          movement. Mounting it inside either surface would recreate the kernel on
                          navigation and destroy the retention it exists to provide.
                          tenant/principal are the retention boundary: a retained context may never
                          cross a tenant. */}
                      <RuntimeKernelProvider
                        tenant={typeof orgId === "string" ? orgId : ""}
                        principal={principalUserId ?? ""}
                      >
                        {/* Surface Host (NAV-1 (A)) — the canonical client-context owner of
                            operational-surface focus. Always mounted; no flag, no parallel mode.
                            It now assigns surface roles from COMMITTED FOCUS, not the pathname. */}
                        {/* Search states a destination from the top nav, which mounts ABOVE this
                            kernel and so cannot hold it. This listener performs the movement through
                            the one work-unit entry adapter: a Search click is an attention movement,
                            never a route push — the route is seed-only, and a push blanks the
                            surface. */}
                        <SearchAttentionListener />
                        <SurfaceHostProvider>{children}</SurfaceHostProvider>
                      </RuntimeKernelProvider>
                    </WorkspaceRouteVmProvider>
                  </div>
                  <AdminEntityDrawer />
                </div>
                </OperationalModeEntryProvider>
              </WorkspaceOrgProvider>
            </AdminViewerTimezoneProvider>
          </AdminOrgOperationalTimezoneProvider>
        </EntityLabelsProvider>
      </AdminVerticalProvider>
    </AdminAuthProvider>
  );
}
