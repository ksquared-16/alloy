"use client";

import type { CSSProperties } from "react";
import { useMemo } from "react";
import { neutral, derived, brand } from "@/styles/tokens/colors";
import "@/app/adminV2/components/workspace/workspace.css";
import KPIBlock from "@/app/adminV2/components/workspace/blocks/KPIBlock";
import type { ActionsVm, KPIVm } from "@/lib/ui-v2/workspace-types";
import {
  WorkspaceRootDepartmentGrid,
  type WorkspaceRootDepartmentRow,
  type WorkspaceRootDeptTileStats,
} from "@/components/admin/workspace/WorkspaceRootDepartmentGrid";

const WORKSPACE_BASE = "/adminV2/workspace";

const companyRootStyle: CSSProperties = {
  backgroundColor: "transparent",
  color: neutral.textPrimary,
  ["--d-text-primary" as string]: neutral.textPrimary,
  ["--d-page-bg" as string]: neutral.background,
  ["--d-border" as string]: derived.border,
  ["--d-muted" as string]: derived.textSecondary,
  ["--d-surface" as string]: neutral.surface,
  ["--d-brand" as string]: brand.primary,
  ["--d-pine" as string]: brand.secondary,
  ["--d-top-wash" as string]: derived.kpiRailWash,
  ["--d-panel" as string]: derived.chromeDeckBg,
  ["--d-panel-quiet" as string]: derived.inspectorCommandRailWash,
  ["--d-rail" as string]: derived.inspectorCommandRail,
  ["--d-field-veil" as string]: derived.canvasFieldWash,
  ["--d-ambient-core" as string]: derived.ambientLifeBloomMid,
  ["--d-kpi-tint" as string]: derived.kpiBandBusinessLight,
  ["--d-kpi-ai-tint" as string]: derived.kpiBandAiLight,
  ["--d-summary-wash" as string]: derived.maskOverlay,
  ["--d-boundary-inset" as string]: derived.adminV2BoundaryAmberInset,
  ["--d-kpi-band-shadow" as string]: derived.kpiBandShadow,
  ["--d-admin-amber" as string]: derived.adminV2BoundaryAmber,
  ["--d-rail-hairline" as string]: derived.inspectorCommandHairline,
  ["--d-rail-sep" as string]: derived.inspectorChamberSeparation,
  ["--d-ambient-edge" as string]: derived.ambientLifeBloomEdge,
  ["--d-field-depth" as string]: derived.canvasFieldDepth,
  ["--d-card-shadow" as string]: derived.cardShadow,
};

export type WorkspaceRootMetrics = {
  departments: number | null;
  workUnits: number | null;
};

type Props = {
  orgName: string | null;
  departments: WorkspaceRootDepartmentRow[];
  deptTileStats: WorkspaceRootDeptTileStats;
  metrics: WorkspaceRootMetrics | null;
  metricsLoading: boolean;
};

function formatInt(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return String(Math.max(0, Math.floor(n)));
}

function buildKpis(params: {
  metrics: WorkspaceRootMetrics | null;
  metricsLoading: boolean;
}): KPIVm[] {
  const { metrics } = params;
  return [
    { id: "depts", label: "Departments", value: formatInt(metrics?.departments), lane: "business" },
    { id: "wu", label: "Work units", value: formatInt(metrics?.workUnits), lane: "business" },
  ];
}

/**
 * Organization workspace root — company banner, KPI strip, department grid, command rail (Admin V2 mock grammar).
 */
export function WorkspaceRootShell({ orgName, departments, deptTileStats, metrics, metricsLoading }: Props) {
  const displayName = (orgName && orgName.trim()) || "Your organization";

  const kpis = useMemo(
    () => buildKpis({ metrics, metricsLoading }),
    [metrics, metricsLoading]
  );

  return (
    <div
      data-ws-surface="company"
      data-adminv2-workspace-root-shell="true"
      className="adminv2-ws-root adminv2-ws-company adminv2-ws-company-v2"
      style={companyRootStyle}
    >
      <div className="adminv2-ws-dept-v2-contain">
        <nav className="text-sm text-alloy-midnight/60 flex flex-wrap items-center gap-1 pb-2" aria-label="Breadcrumb">
          <span className="text-alloy-midnight/80 font-medium">Workspace</span>
        </nav>

        <div className="adminv2-ws-dept-v2-page-split">
          <div className="adminv2-ws-dept-v2-primary-column">
            <div className="adminv2-ws-dept-v2-control-deck">
              <div className="adminv2-ws-dept-v2-top-stack">
                <div className="adminv2-ws-dept-v2-brief">
                  <div className="adminv2-ws-dept-v2-brief-focus-label">Organization workspace</div>
                  <div className="adminv2-ws-dept-v2-brief-head-row">
                    <h2 className="adminv2-ws-dept-v2-brief-headline">{displayName}</h2>
                  </div>
                  <p className="text-sm mt-2 max-w-3xl" style={{ color: derived.textSecondary, lineHeight: 1.45 }}>
                    Pick a department to drill into work units. This root surface stays structure-only.
                  </p>
                </div>
              </div>
              <KPIBlock
                kpis={kpis}
                surface="default"
                maxVisible={2}
              />
            </div>

            <section className="mt-4" aria-labelledby="ws-root-dept-heading">
              <div className="flex flex-wrap items-end justify-between gap-2 mb-3">
                <div>
                  <h2 id="ws-root-dept-heading" className="text-xs font-semibold uppercase tracking-wide" style={{ color: derived.textSecondary }}>
                    Departments
                  </h2>
                  <p className="text-sm mt-0.5" style={{ color: derived.textSecondary }}>
                    Each card is a live department from your org — drill in to work units and queues.
                  </p>
                </div>
              </div>
              <WorkspaceRootDepartmentGrid
                workspaceBasePath={WORKSPACE_BASE}
                departments={departments}
                deptTileStats={deptTileStats}
                tileVariant="workspaceRoot"
                omitOuterChrome
              />
            </section>
          </div>

          <div className="adminv2-ws-dept-v2-command-column" data-adminv2-workspace-command-column aria-hidden />
        </div>
      </div>
    </div>
  );
}
