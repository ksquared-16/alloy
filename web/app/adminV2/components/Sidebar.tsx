"use client";

import Link from "next/link";
import { neutral, brand } from "@/styles/tokens/colors";
import { PanelLeftClose, PanelLeft } from "lucide-react";

export default function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <aside
      className="flex flex-col flex-shrink-0 border-r transition-[width] duration-200 overflow-hidden"
      style={{
        width: collapsed ? 48 : 220,
        backgroundColor: neutral.surface,
        borderColor: neutral.border,
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center justify-center h-12 w-full flex-shrink-0 hover:opacity-90"
        style={{ color: brand.primary }}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? <PanelLeft size={20} /> : <PanelLeftClose size={20} />}
      </button>
      {!collapsed && (
        <div className="px-3 py-2 text-sm flex flex-col gap-2" style={{ color: neutral.textSecondary }}>
          <span>Sidebar</span>
          <Link
            href="/adminV2/workspace"
            className="text-xs font-semibold hover:underline"
            style={{ color: brand.primary }}
          >
            Workspace
          </Link>
          <Link
            href="/adminV2/settings"
            className="text-xs font-semibold hover:underline"
            style={{ color: brand.primary }}
          >
            Settings
          </Link>
        </div>
      )}
    </aside>
  );
}
