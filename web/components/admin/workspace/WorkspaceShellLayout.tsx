"use client";

import type { CSSProperties, ReactNode } from "react";

import "@/app/adminV2/components/workspace/workspace.css";
import { WorkspaceCommandRailShell } from "@/app/adminV2/components/workspace/WorkspaceCommandRailShell";
import { WorkspaceCommandRailRegistrar } from "@/app/adminV2/components/workspace/WorkspaceCommandRailRegistrar";
import { usePersistentCommandRailEnabled } from "@/contexts/WorkspaceCommandRailRegistryContext";

export type WorkspaceShellSurface = "company" | "department" | "work_unit";

export type WorkspaceShellLayoutProps = {
  /** Maps to `[data-ws-surface]` for workspace.css selectors. */
  surface: WorkspaceShellSurface;
  /** Appended after `adminv2-ws-root` (e.g. `adminv2-ws-company adminv2-ws-company-v2`). */
  rootClassName: string;
  style?: CSSProperties;
  workspaceRootShell?: boolean;
  productionWorkspaceBridge?: boolean;
  /** Breadcrumb slot inside contain, above the page split */
  containLead?: ReactNode;
  primaryColumn: ReactNode;
  /** Inner rail body only; column chrome is wrapped here. Omit or pass `null` to collapse desktop rail grid. */
  railContent?: ReactNode | null;
  /** Work-unit layout: telemetry card between Actions and BOS in the command rail. */
  commandRailTelemetrySlot?: ReactNode | null;
  /** When set, overrides automatic `railContent != null` visibility. */
  showRail?: boolean;
  railAriaLabel?: string;
};

/**
 * Shared Admin V2 workspace chrome: centered contain, primary | command grid, optional sticky rail (CSS).
 * Collapse the command column when `railContent` is null/undefined and `showRail` is not forced true.
 */
export function WorkspaceShellLayout({
  surface,
  rootClassName,
  style,
  workspaceRootShell,
  productionWorkspaceBridge,
  containLead,
  primaryColumn,
  railContent,
  commandRailTelemetrySlot = null,
  showRail,
  railAriaLabel = "Decisions and actions",
}: WorkspaceShellLayoutProps) {
  const persistentCommandRail = usePersistentCommandRailEnabled();
  const hasLocalRail =
    !persistentCommandRail && (typeof showRail === "boolean" ? showRail : railContent != null);

  return (
    <div
      data-ws-surface={surface}
      className={`adminv2-ws-root ${rootClassName}`.trim()}
      style={style}
      {...(workspaceRootShell ? { "data-adminv2-workspace-root-shell": "true" } : {})}
      {...(productionWorkspaceBridge ? { "data-production-workspace-bridge": "true" } : {})}
    >
      <div className="adminv2-ws-dept-v2-contain">
        {persistentCommandRail ?
          <WorkspaceCommandRailRegistrar actions={railContent ?? null} telemetry={commandRailTelemetrySlot ?? null} />
        :   null}
        {containLead}
        <div
          className={
            hasLocalRail
              ? "adminv2-ws-dept-v2-page-split"
              : "adminv2-ws-dept-v2-page-split adminv2-ws-dept-v2-page-split--no-rail"
          }
        >
          <div className="adminv2-ws-dept-v2-primary-column">{primaryColumn}</div>
          {hasLocalRail ?
            <div
              className="adminv2-ws-dept-v2-command-column adminv2-ws-shell-command-column"
              data-adminv2-workspace-command-column
            >
              <WorkspaceCommandRailShell ariaLabel={railAriaLabel} telemetrySlot={commandRailTelemetrySlot}>
                {railContent}
              </WorkspaceCommandRailShell>
            </div>
          :   null}
        </div>
      </div>
    </div>
  );
}
