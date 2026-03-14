"use client";

import { useState } from "react";
import { neutral } from "@/styles/tokens/colors";
import TopNavBar from "./TopNavBar";
import Sidebar from "./Sidebar";
import InspectorPanel from "./InspectorPanel";
import KPIStripPlaceholder from "./KPIStripPlaceholder";
import AICommandBar from "./AICommandBar";

export default function AdminV2Shell({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

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
        <div className="flex flex-1 min-h-0 flex-col">
          <KPIStripPlaceholder />
          <div className="flex flex-1 min-h-0">
            <main className="flex-1 min-w-0 overflow-hidden">
              {children}
            </main>
            <InspectorPanel />
          </div>
        </div>
        <AICommandBar />
      </div>
    </div>
  );
}
