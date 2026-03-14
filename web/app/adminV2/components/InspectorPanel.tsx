"use client";

import { neutral } from "@/styles/tokens/colors";

export default function InspectorPanel() {
  return (
    <aside
      className="w-72 flex-shrink-0 border-l overflow-auto"
      style={{
        backgroundColor: neutral.surface,
        borderColor: neutral.border,
      }}
    >
      <div
        className="p-4 text-sm"
        style={{ color: neutral.textSecondary }}
      >
        Inspector panel
      </div>
    </aside>
  );
}
