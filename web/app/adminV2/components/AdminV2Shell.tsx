"use client";

import { Suspense, useEffect, useState, useCallback, type CSSProperties } from "react";
import {
    readAdminV2SidebarCollapsed,
    writeAdminV2SidebarCollapsed,
} from "@/lib/adminV2/navigation/adminV2SidebarCollapsed";
import { prefetchWorkspaceNavTree } from "@/lib/adminV2/navigation/workspaceNavTreeCache";
import { scheduleInboxWarmLoad } from "@/lib/adminV2/inboxWarmLoadCache";
import { scheduleAdminV2BackgroundWork } from "@/lib/workspace/adminV2DeferBackgroundWork";
import { usePathname } from "next/navigation";
import { neutral, derived, palette } from "@/styles/tokens/colors";

const CHAMBER_FRAME = `inset 0 0 0 1px ${derived.adminV2BoundaryAmberInset}`;
import TopNavBar from "./TopNavBar";
import { WorkspaceSiteFilterProvider } from "@/contexts/WorkspaceSiteFilterContext";
import Sidebar from "./Sidebar";
import InspectorPanel from "./InspectorPanel";
import AICommandBar from "./AICommandBar";
import AICommandSurfaceShell from "./aiCommandSurface/AICommandSurfaceShell";
import RecentAiActionsStrip from "./aiActivity/RecentAiActionsStrip";
import { GlobalAssistantProvider } from "@/contexts/GlobalAssistantContext";
import AskBosHandoffListener from "@/components/adminV2/AskBosHandoffListener";
import BreadcrumbBar from "./navigation/BreadcrumbBar";
import KPIBand from "./dashboard/KPIBand";
import SystemCanvas from "./canvas/SystemCanvas";
import RecordsExpandable from "./records/RecordsExpandable";
import { MOCK_DEPARTMENTS } from "./canvas/mockDepartments";
import type { DepartmentKey } from "@/lib/departmentColors";
import { AdminV2NavigationTransitionRibbon } from "@/components/admin/workspace/AdminV2NavigationTransitionRibbon";
import {
    isCanonicalAiActivityPath,
    isCanonicalFormsPath,
    isCanonicalSettingsPath,
    isCanonicalWorkflowsPath,
    isCanonicalWorkspacePath,
} from "@/lib/admin/canonicalAdminRoutes";
import AdminV2PersistentCommandRail from "./AdminV2PersistentCommandRail";
import { CommandRailBosMount } from "./CommandRailBosMount";
import { useAdminV2WorkspaceShellDocumentFlag } from "./useAdminV2WorkspaceShellDocumentFlag";
import BosDrawerGeometryDiagnostics from "./BosDrawerGeometryDiagnostics";
import { useWorkspaceCommandRailDrawerOffset } from "./useWorkspaceCommandRailDrawerOffset";
import { DrawerCommandRailActionsProvider } from "@/contexts/DrawerCommandRailActionsContext";
import { WorkspaceCommandRailRegistryProvider } from "@/contexts/WorkspaceCommandRailRegistryContext";

/**
 * AdminV2 AI command surface is internal/admin-only and should be interactive whenever visible.
 * This avoids NEXT_PUBLIC env misconfiguration causing a non-interactive placeholder bar in production.
 */
function adminV2AiCommandSurfaceEnabled(): boolean {
  return true;
}

/** Matches `AICommandSurfaceShell` inner max width so the activity strip aligns with the bar. */
const COMMAND_SURFACE_MAX_W_PX = 840;

function getDepartmentName(key: DepartmentKey): string {
  const dept = MOCK_DEPARTMENTS.find((d) => d.key === key);
  return dept?.name ?? key;
}

/**
 * DEBUG: set false after verifying ambient paints in DevTools.
 * Production tokens use ~3–7% alpha (see colors.ts); they are effectively invisible on neutral.background.
 * This pass uses the same hues (#00a283 teal, #273f52 slate) at high alpha so the shell wrapper is unmistakable.
 */
const DEBUG_EXAGGERATE_WORKSPACE_AMBIENT = false;

/** Production ambient — white workspace canvas (cards retain borders/hierarchy). */
const workspaceContentAmbientStyleProduction: CSSProperties = {
  backgroundColor: "#ffffff",
};

/** Debug ambient — larger blooms + stronger field wash/depth, same vocabulary hues, no layout change */
const workspaceContentAmbientStyleDebug: CSSProperties = {
  backgroundColor: neutral.background,
  backgroundImage: `
    radial-gradient(ellipse 120% 85% at 50% 12%, rgba(0, 162, 131, 0.5) 0%, rgba(0, 162, 131, 0.12) 45%, transparent 72%),
    radial-gradient(ellipse 95% 75% at 96% 8%, rgba(0, 162, 131, 0.42) 0%, transparent 58%),
    linear-gradient(180deg, rgba(39, 63, 82, 0.2) 0%, rgba(39, 63, 82, 0.06) 38%, transparent 62%),
    linear-gradient(180deg, transparent 35%, rgba(39, 63, 82, 0.32) 100%)
  `,
};

const workspaceContentAmbientStyle: CSSProperties = DEBUG_EXAGGERATE_WORKSPACE_AMBIENT
  ? workspaceContentAmbientStyleDebug
  : workspaceContentAmbientStyleProduction;

export default function AdminV2Shell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isWorkspaceV2Route = isCanonicalWorkspacePath(pathname);
  const isAiActivityRoute = isCanonicalAiActivityPath(pathname);
  const isSettingsRoute = isCanonicalSettingsPath(pathname);
  const isWorkflowsRoute = isCanonicalWorkflowsPath(pathname);
  const isFormsRoute = isCanonicalFormsPath(pathname);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readAdminV2SidebarCollapsed() ?? true);
  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((c) => {
      const next = !c;
      writeAdminV2SidebarCollapsed(next);
      return next;
    });
  }, []);

  useEffect(() => {
    return scheduleAdminV2BackgroundWork(
      () => {
        prefetchWorkspaceNavTree();
        scheduleInboxWarmLoad();
      },
      { idleTimeoutMs: 4500, fallbackMs: 2800 },
    );
  }, []);

  const [zoomLevel, setZoomLevel] = useState<"company" | "department">("company");
  const [selectedDepartmentKey, setSelectedDepartmentKey] = useState<DepartmentKey | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const handleDepartmentClick = (key: DepartmentKey) => {
    setSelectedDepartmentKey(key);
    setZoomLevel("department");
  };

  const handleGoToCompany = () => {
    setZoomLevel("company");
    setSelectedDepartmentKey(null);
    setSelectedNodeId(null);
  };

  const kpiScope =
    zoomLevel === "company" || !selectedDepartmentKey
      ? { level: "company" as const }
      : { level: "department" as const, key: selectedDepartmentKey };

  const showRecordsExpandable = zoomLevel === "department" && selectedDepartmentKey != null;
  useAdminV2WorkspaceShellDocumentFlag();
  useWorkspaceCommandRailDrawerOffset(pathname);

  if (isWorkspaceV2Route || isAiActivityRoute || isSettingsRoute || isWorkflowsRoute || isFormsRoute) {
    return (
      <GlobalAssistantProvider>
        <CommandRailBosMount>
        <WorkspaceCommandRailRegistryProvider>
        <DrawerCommandRailActionsProvider>
        <BosDrawerGeometryDiagnostics />
        <AskBosHandoffListener />
        <WorkspaceSiteFilterProvider>
          <div
            className="flex h-screen w-full overflow-hidden"
            style={{
              backgroundColor: "#ffffff",
            }}
            data-adminv2-app-shell="workspace-v2"
            data-adminv2-workspace-shell="v2"
            data-adminv2-sidebar-collapsed={sidebarCollapsed ? "true" : "false"}
          >
            <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebarCollapsed} />
            <div className="flex flex-1 flex-col min-w-0 min-h-0 overflow-hidden">
              <div className="relative z-[100] shrink-0" data-adminv2-shell-header-mount="persistent">
                <TopNavBar />
              </div>
              <div
                data-adminv2-workspace-ambient-root
                className="relative flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden lg:flex-row"
                style={workspaceContentAmbientStyle}
              >
                <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden isolate">
                  <AdminV2NavigationTransitionRibbon />
                  {isAiActivityRoute || isSettingsRoute || isWorkflowsRoute || isFormsRoute ?
                    <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                      {children}
                    </main>
                  : children}
                </div>
                <AdminV2PersistentCommandRail />
              </div>
            </div>
          </div>
        </WorkspaceSiteFilterProvider>
        </DrawerCommandRailActionsProvider>
        </WorkspaceCommandRailRegistryProvider>
        </CommandRailBosMount>
      </GlobalAssistantProvider>
    );
  }

  return (
    <GlobalAssistantProvider>
    <AskBosHandoffListener />
    <div
      className="flex h-screen w-full overflow-hidden"
      style={{ backgroundColor: neutral.background }}
    >
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={toggleSidebarCollapsed}
      />
      <div className="flex flex-1 flex-col min-w-0">
        <Suspense
          fallback={
            <div
              className="flex h-12 flex-shrink-0 items-center px-4 text-sm text-white/70"
              style={{ backgroundColor: palette.midnightForge }}
              aria-hidden
            >
              Loading…
            </div>
          }
        >
          <TopNavBar />
        </Suspense>
        <BreadcrumbBar
          zoomLevel={zoomLevel}
          departmentName={selectedDepartmentKey ? getDepartmentName(selectedDepartmentKey) : null}
          onGoToCompany={handleGoToCompany}
        />
        <div
          className="flex flex-1 min-h-0 flex-row min-w-0"
          style={{
            backgroundColor: neutral.surface,
            boxShadow: `0 1px 0 ${derived.border}`,
          }}
        >
          {/* Left: KPI + org field (+ records) — command center does not share this width */}
          <div className="flex flex-1 min-w-0 min-h-0 flex-col">
            <KPIBand scope={kpiScope} />
            <div
              className="flex flex-1 min-h-0 flex-col min-w-0"
              style={{
                backgroundColor: derived.canvasChamberDeep,
                boxShadow: `inset 0 2px 0 ${neutral.surface}, ${CHAMBER_FRAME}`,
                borderTop: `1px solid ${derived.border}`,
              }}
            >
              <main className="flex-1 min-h-0 min-w-0 overflow-hidden">
                <SystemCanvas
                  zoomLevel={zoomLevel}
                  selectedDepartmentKey={selectedDepartmentKey}
                  selectedNodeId={selectedNodeId}
                  onDepartmentClick={handleDepartmentClick}
                  onNodeSelect={setSelectedNodeId}
                />
              </main>
              {showRecordsExpandable && selectedDepartmentKey && (
                <RecordsExpandable
                  key={selectedDepartmentKey}
                  departmentName={getDepartmentName(selectedDepartmentKey)}
                  scope={{ level: "department", key: selectedDepartmentKey }}
                />
              )}
            </div>
          </div>
          {/* Right: full-height command center / inspector rail (KPI band height + org field) */}
          <InspectorPanel
            selectedNodeId={selectedNodeId}
            selectedDepartmentKey={selectedDepartmentKey}
            zoomLevel={zoomLevel}
          />
        </div>
        <div className="relative flex flex-col">
          <div className="flex w-full justify-center px-4">
            <div className="w-full" style={{ maxWidth: COMMAND_SURFACE_MAX_W_PX }}>
              <RecentAiActionsStrip />
            </div>
          </div>
          {adminV2AiCommandSurfaceEnabled() ? <AICommandSurfaceShell /> : <AICommandBar />}
        </div>
      </div>
    </div>
    </GlobalAssistantProvider>
  );
}
