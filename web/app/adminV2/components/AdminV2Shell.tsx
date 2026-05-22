"use client";

import { Suspense, useEffect, useState, useCallback, type CSSProperties } from "react";
import {
    readAdminV2SidebarCollapsed,
    writeAdminV2SidebarCollapsed,
} from "@/lib/adminV2/navigation/adminV2SidebarCollapsed";
import { prefetchWorkspaceNavTree } from "@/lib/adminV2/navigation/workspaceNavTreeCache";
import { usePathname } from "next/navigation";
import { neutral, derived, palette } from "@/styles/tokens/colors";

const CHAMBER_FRAME = `inset 0 0 0 1px ${derived.adminV2BoundaryAmberInset}`;
import TopNavBar from "./TopNavBar";
import WorkspaceSiteFilterGate from "./WorkspaceSiteFilterGate";
import Sidebar from "./Sidebar";
import InspectorPanel from "./InspectorPanel";
import AICommandBar from "./AICommandBar";
import AICommandSurfaceShell from "./aiCommandSurface/AICommandSurfaceShell";
import RecentAiActionsStrip from "./aiActivity/RecentAiActionsStrip";
import { GlobalAssistantProvider } from "@/contexts/GlobalAssistantContext";
import BreadcrumbBar from "./navigation/BreadcrumbBar";
import KPIBand from "./dashboard/KPIBand";
import SystemCanvas from "./canvas/SystemCanvas";
import RecordsExpandable from "./records/RecordsExpandable";
import { MOCK_DEPARTMENTS } from "./canvas/mockDepartments";
import type { DepartmentKey } from "@/lib/departmentColors";
import WorkspaceAmbientLayer from "./WorkspaceAmbientLayer";
import { AdminV2NavigationTransitionRibbon } from "@/components/admin/workspace/AdminV2NavigationTransitionRibbon";

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

/** Production ambient — cool near-white slab + restrained slate/indigo wash (ambient dots stay very subtle separately). */
const workspaceContentAmbientStyleProduction: CSSProperties = {
  backgroundColor: "#f6f9fb",
  backgroundImage: `
    linear-gradient(180deg, rgba(36, 59, 86, 0.022) 0%, transparent 30%),
    linear-gradient(180deg, transparent 74%, rgba(39, 63, 82, 0.03) 100%),
    linear-gradient(135deg, rgba(33, 56, 88, 0.014) 0%, transparent 42%)
  `,
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
  const isWorkspaceV2Route =
    pathname === "/adminV2/workspace" ||
    pathname.startsWith("/adminV2/workspace/") ||
    pathname === "/admin/v2" ||
    pathname === "/admin/v2/workspace" ||
    pathname.startsWith("/admin/v2/workspace/");
  const isAiActivityRoute = pathname === "/adminV2/ai-activity" || pathname === "/admin/v2/ai-activity";
  const isSettingsRoute =
    pathname === "/adminV2/settings" ||
    pathname.startsWith("/adminV2/settings/") ||
    pathname === "/admin/v2/settings" ||
    pathname.startsWith("/admin/v2/settings/");
  const isWorkflowsRoute =
    pathname === "/adminV2/workflows" ||
    pathname.startsWith("/adminV2/workflows/") ||
    pathname === "/admin/v2/workflows" ||
    pathname.startsWith("/admin/v2/workflows/");
  const isFormsRoute =
    pathname === "/adminV2/forms" || pathname.startsWith("/adminV2/forms/");

  const workspaceSiteFilterSubtree =
    pathname === "/adminV2/workspace" ||
    pathname.startsWith("/adminV2/workspace/") ||
    pathname === "/admin/v2/workspace" ||
    pathname.startsWith("/admin/v2/workspace/");

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readAdminV2SidebarCollapsed() ?? true);
  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((c) => {
      const next = !c;
      writeAdminV2SidebarCollapsed(next);
      return next;
    });
  }, []);

  useEffect(() => {
    prefetchWorkspaceNavTree();
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

  if (isWorkspaceV2Route || isAiActivityRoute || isSettingsRoute || isWorkflowsRoute || isFormsRoute) {
    return (
      <GlobalAssistantProvider>
      <div
        className="flex h-screen w-full overflow-hidden"
        style={{ backgroundColor: neutral.background }}
      >
        <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebarCollapsed} />
        <div className="flex flex-1 flex-col min-w-0 min-h-0 overflow-hidden">
          {workspaceSiteFilterSubtree ? (
            <WorkspaceSiteFilterGate>
              <div className="relative z-[100] shrink-0">
                <Suspense
                  fallback={
                    <div
                      className="adminv2-shell-header flex h-14 flex-shrink-0 items-center px-4 text-sm text-white/70"
                      style={{ backgroundColor: palette.midnightForge }}
                      aria-hidden
                    >
                      Loading…
                    </div>
                  }
                >
                  <TopNavBar />
                </Suspense>
              </div>
              <div
                data-adminv2-workspace-ambient-root
                className="relative flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden"
                style={workspaceContentAmbientStyle}
              >
                {isWorkspaceV2Route || isSettingsRoute || isWorkflowsRoute || isFormsRoute ? (
                  <WorkspaceAmbientLayer />
                ) : null}
                {/* Reserve room for the bottom AI bar so content isn't hidden behind it. */}
                <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden isolate pb-[96px]">
                  <AdminV2NavigationTransitionRibbon />
                  {isAiActivityRoute || isSettingsRoute || isWorkflowsRoute || isFormsRoute ? (
                    <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
                  ) : (
                    children
                  )}
                </div>
                {/* Raise AI bar slightly so it doesn't feel glued to the viewport bottom. */}
                <div className="absolute bottom-2 left-0 right-0 z-20 flex flex-col">
                  <div className="flex w-full justify-center px-4">
                    <div className="w-full" style={{ maxWidth: COMMAND_SURFACE_MAX_W_PX }}>
                      <RecentAiActionsStrip />
                    </div>
                  </div>
                  {adminV2AiCommandSurfaceEnabled() ? <AICommandSurfaceShell /> : <AICommandBar />}
                </div>
              </div>
            </WorkspaceSiteFilterGate>
          ) : (
            <>
              <div className="relative z-[100] shrink-0">
                <Suspense
                  fallback={
                    <div
                      className="adminv2-shell-header flex h-14 flex-shrink-0 items-center px-4 text-sm text-white/70"
                      style={{ backgroundColor: palette.midnightForge }}
                      aria-hidden
                    >
                      Loading…
                    </div>
                  }
                >
                  <TopNavBar />
                </Suspense>
              </div>
              <div
                data-adminv2-workspace-ambient-root
                className="relative flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden"
                style={workspaceContentAmbientStyle}
              >
                {isWorkspaceV2Route || isSettingsRoute || isWorkflowsRoute || isFormsRoute ? (
                  <WorkspaceAmbientLayer />
                ) : null}
                <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden isolate pb-[96px]">
                  <AdminV2NavigationTransitionRibbon />
                  {isAiActivityRoute || isSettingsRoute || isWorkflowsRoute || isFormsRoute ? (
                    <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">{children}</main>
                  ) : (
                    children
                  )}
                </div>
                <div className="absolute bottom-2 left-0 right-0 z-20 flex flex-col">
                  <div className="flex w-full justify-center px-4">
                    <div className="w-full" style={{ maxWidth: COMMAND_SURFACE_MAX_W_PX }}>
                      <RecentAiActionsStrip />
                    </div>
                  </div>
                  {adminV2AiCommandSurfaceEnabled() ? <AICommandSurfaceShell /> : <AICommandBar />}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      </GlobalAssistantProvider>
    );
  }

  return (
    <GlobalAssistantProvider>
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
