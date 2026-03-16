"use client";

import { useState } from "react";
import { neutral } from "@/styles/tokens/colors";
import TopNavBar from "./TopNavBar";
import Sidebar from "./Sidebar";
import InspectorPanel from "./InspectorPanel";
import AICommandBar from "./AICommandBar";
import BreadcrumbBar from "./navigation/BreadcrumbBar";
import AIKPIStrip from "./dashboard/AIKPIStrip";
import BusinessKPIStrip from "./dashboard/BusinessKPIStrip";
import SystemCanvas from "./canvas/SystemCanvas";
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
        <div className="flex flex-1 min-h-0 flex-col">
          <AIKPIStrip scope={kpiScope} />
          <BusinessKPIStrip scope={kpiScope} />
          <div className="flex flex-1 min-h-0">
            <main className="flex-1 min-w-0 overflow-hidden">
              <SystemCanvas
                zoomLevel={zoomLevel}
                selectedDepartmentKey={selectedDepartmentKey}
                selectedNodeId={selectedNodeId}
                onDepartmentClick={handleDepartmentClick}
                onNodeSelect={setSelectedNodeId}
              />
            </main>
            <InspectorPanel
              selectedNodeId={selectedNodeId}
              selectedDepartmentKey={selectedDepartmentKey}
              zoomLevel={zoomLevel}
            />
          </div>
        </div>
        <AICommandBar />
      </div>
    </div>
  );
}