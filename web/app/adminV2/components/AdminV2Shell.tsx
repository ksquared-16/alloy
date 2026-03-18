"use client";

import { useState } from "react";
import { neutral, derived } from "@/styles/tokens/colors";

const CHAMBER_FRAME = `inset 0 0 0 1px ${derived.adminV2BoundaryAmberInset}`;
import TopNavBar from "./TopNavBar";
import Sidebar from "./Sidebar";
import InspectorPanel from "./InspectorPanel";
import AICommandBar from "./AICommandBar";
import BreadcrumbBar from "./navigation/BreadcrumbBar";
import KPIBand from "./dashboard/KPIBand";
import SystemCanvas from "./canvas/SystemCanvas";
import RecordsExpandable from "./records/RecordsExpandable";
import { MOCK_DEPARTMENTS } from "./canvas/mockDepartments";
import type { DepartmentKey } from "@/lib/departmentColors";

function getDepartmentName(key: DepartmentKey): string {
  const dept = MOCK_DEPARTMENTS.find((d) => d.key === key);
  return dept?.name ?? key;
}

export default function AdminV2Shell({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
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

  return (
    <div
      className="flex h-screen w-full overflow-hidden"
      style={{ backgroundColor: neutral.background }}
    >
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((c) => !c)}
      />
      <div className="flex flex-1 flex-col min-w-0">
        <TopNavBar />
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
        <AICommandBar />
      </div>
    </div>
  );
}
