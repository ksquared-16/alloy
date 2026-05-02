"use client";

import type { CSSProperties } from "react";
import { useMemo } from "react";
import Link from "next/link";
import { neutral, derived, brand } from "@/styles/tokens/colors";
import KPIBlock from "@/app/adminV2/components/workspace/blocks/KPIBlock";
import { KpiStripSkeleton } from "@/components/admin/workspace/KpiStripSkeleton";
import type { KPIVm } from "@/lib/ui-v2/workspace-types";
import {
  WorkspaceRootDepartmentGrid,
  type WorkspaceRootDepartmentRow,
  type WorkspaceRootDeptTileStats,
} from "@/components/admin/workspace/WorkspaceRootDepartmentGrid";
import { WorkspaceShellLayout } from "@/components/admin/workspace/WorkspaceShellLayout";

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
  /** Growth-slice departments: rolled up from per-dept `opportunity-lifecycle-kpis` (same semantics as /dept). */
  orgOpportunityKpis?: KPIVm[] | null;
  /**
   * When set (including `[]`), replaces the default structure + pipeline KPI merge — placement-driven order from resolver.
   * When `undefined`, the shell builds the legacy merge from `metrics` + `orgOpportunityKpis`.
   */
  workspaceKpiStrip?: KPIVm[] | undefined;
  /** Skeleton only — placements still loading after first paint (no numeric KPIs yet). */
  kpiStripPlaceholder?: boolean;
};

function formatInt(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return String(Math.max(0, Math.floor(n)));
}

function buildStructureKpis(params: {
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
export function WorkspaceRootShell({
  orgName,
  departments,
  deptTileStats,
  metrics,
  metricsLoading,
  orgOpportunityKpis,
  workspaceKpiStrip,
  kpiStripPlaceholder = false,
}: Props) {
  const displayName = (orgName && orgName.trim()) || "Your organization";

  const kpis = useMemo(() => {
    if (workspaceKpiStrip !== undefined) {
      return workspaceKpiStrip;
    }
    const structure = buildStructureKpis({ metrics, metricsLoading });
    const roll = orgOpportunityKpis?.length ? orgOpportunityKpis : [];
    return [...structure, ...roll];
  }, [workspaceKpiStrip, metrics, metricsLoading, orgOpportunityKpis]);

  return (
    <WorkspaceShellLayout
      surface="company"
      rootClassName="adminv2-ws-company adminv2-ws-company-v2"
      style={companyRootStyle}
      workspaceRootShell
      railAriaLabel="Workspace orientation"
      showRail
      railContent={
        <section className="adminv2-ws-actions-rail adminv2-ws-actions-rail--dept-panel adminv2-ws-actions-rail--orientation px-3 pb-3 pt-3">
          <h3 className="adminv2-ws-actions-rail-title">Orientation</h3>
          <p className="adminv2-ws-workspace-orientation-lead">
            You are at the top of the hierarchy. Use the department cards to drill into work units and queues;
            this column stays lightweight.
          </p>
          <div className="adminv2-ws-workspace-orientation-meta" aria-label="Related admin surfaces">
            <span className="adminv2-ws-workspace-orientation-meta-k">Drill path</span>
            <span className="adminv2-ws-workspace-orientation-meta-v">Department → work unit → record</span>
          </div>
          <div className="adminv2-ws-actions-rail-list adminv2-ws-actions-rail-list--column mt-3">
            <Link
              href="/admin/opportunities"
              className="adminv2-ws-actions-rail-secondary adminv2-ws-workspace-orientation-link text-center no-underline rounded-md font-bold text-[11px] w-full"
            >
              Open inquiries (classic admin)
            </Link>
            <Link
              href="/admin/system/work-units"
              className="adminv2-ws-actions-rail-secondary adminv2-ws-workspace-orientation-link text-center no-underline rounded-md font-bold text-[11px] w-full"
            >
              Work unit registry
            </Link>
          </div>
        </section>
      }
      containLead={
        <nav className="text-sm text-alloy-midnight/60 flex flex-wrap items-center gap-1 pb-2" aria-label="Breadcrumb">
          <span className="text-alloy-midnight/80 font-medium">Workspace</span>
        </nav>
      }
      primaryColumn={
        <>
          <div className="adminv2-ws-dept-v2-control-deck">
            <div className="adminv2-ws-dept-v2-top-stack">
              <div className="adminv2-ws-dept-v2-brief">
                <div className="adminv2-ws-dept-v2-brief-focus-label">Organization workspace</div>
                <div className="adminv2-ws-dept-v2-brief-head-row">
                  <h2 className="adminv2-ws-dept-v2-brief-headline">{displayName}</h2>
                </div>
                <p
                  className="text-sm mt-2 max-w-3xl adminv2-ws-root-brief-subline"
                  style={{ lineHeight: 1.45 }}
                >
                  Pick a department to drill into work units. This root surface stays structure-only.
                </p>
              </div>
            </div>
            {kpiStripPlaceholder ? <KpiStripSkeleton id="ws-root-kpi-skeleton" /> : <KPIBlock kpis={kpis} maxVisible={5} />}
          </div>

          <section className="adminv2-ws-root-departments-zone" aria-labelledby="ws-root-dept-heading">
            <div className="flex flex-wrap items-end justify-between gap-2 mb-3">
              <div>
                <h2 id="ws-root-dept-heading" className="adminv2-ws-root-zone-kicker">
                  Departments
                </h2>
                <p className="adminv2-ws-root-zone-sub">
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
        </>
      }
    />
  );
}
