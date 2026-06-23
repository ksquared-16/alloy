"use client";

import type { CSSProperties } from "react";
import { neutral, derived, brand } from "@/styles/tokens/colors";
import type { KPIVm } from "@/lib/ui-v2/workspace-types";
import { WorkspaceRootLifecycleGrid } from "@/components/admin/workspace/WorkspaceRootLifecycleGrid";
import { WorkspaceKpiOrientationCrossfade } from "@/components/admin/workspace/WorkspaceKpiOrientationCrossfade";
import type { OperatorLifecycleLandingCard } from "@/lib/admin/buildOperatorLifecycleLanding";
import { WorkspaceShellLayout } from "@/components/admin/workspace/WorkspaceShellLayout";
import { WorkspaceRootActionsRail } from "@/app/adminV2/components/workspace/WorkspaceRootActionsRail";

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
  /** Retained for workspace page API compatibility — lifecycle landing does not render departments. */
  departments?: unknown;
  deptTileStats?: unknown;
  metrics: WorkspaceRootMetrics | null;
  metricsLoading: boolean;
  orgOpportunityKpis?: KPIVm[] | null;
  workspaceKpiStrip?: KPIVm[] | undefined;
  kpiStripPlaceholder?: boolean;
  workspaceRollupRefined?: boolean;
  departmentsPending?: boolean;
  deptTileStatsPending?: boolean;
  kpiQuietReserveOnly?: boolean;
  lifecycleCards?: readonly OperatorLifecycleLandingCard[];
  lifecycleCardsPending?: boolean;
};

/**
 * Operator workspace root — lifecycle tiles and orientation rail.
 * KPI strip hidden until the model is trustworthy; aggregation continues in page.tsx.
 */
export function WorkspaceRootShell({
  orgName,
  workspaceKpiStrip,
  kpiStripPlaceholder = false,
  workspaceRollupRefined = false,
  lifecycleCards = [],
  lifecycleCardsPending = false,
}: Props) {
  const displayName = (orgName && orgName.trim()) || "Your organization";

  const defaultDepartmentId = lifecycleCards[0]?.departmentId ?? null;

  return (
    <WorkspaceShellLayout
      surface="company"
      rootClassName="adminv2-ws-company adminv2-ws-company-v2"
      style={companyRootStyle}
      workspaceRootShell
      railAriaLabel="Decisions and actions"
      railContent={<WorkspaceRootActionsRail defaultDepartmentId={defaultDepartmentId} />}
      containLead={null}
      primaryColumn={
        <>
          <div className="adminv2-ws-dept-v2-control-deck">
            <div className="adminv2-ws-dept-v2-top-stack">
              <div className="adminv2-ws-dept-v2-brief">
                <div className="adminv2-ws-dept-v2-brief-focus-label">Operator workspace</div>
                <div className="adminv2-ws-dept-v2-brief-head-row">
                  <h2 className="adminv2-ws-dept-v2-brief-headline">{displayName}</h2>
                </div>
                <p
                  className="text-sm mt-2 max-w-3xl adminv2-ws-root-brief-subline"
                  style={{ lineHeight: 1.45 }}
                >
                  Enrollment operations at a glance — track families, manage waitlists, and move children toward enrollment.
                </p>
              </div>
            </div>
          </div>

          {workspaceKpiStrip?.length ?
            <div
              className={`adminv2-ws-root-kpi-zone px-0 ${workspaceRollupRefined ? "adminv2-ws-deferred-surface--refined" : "adminv2-ws-deferred-surface--coarse"}`}
              data-workspace-zone="kpi-orientation"
            >
              <WorkspaceKpiOrientationCrossfade
                kpis={workspaceKpiStrip}
                placeholderPending={kpiStripPlaceholder}
                maxVisible={5}
              />
            </div>
          :   null}

          <section
            className={`adminv2-ws-root-departments-zone ${workspaceRollupRefined ? "adminv2-ws-deferred-surface--refined" : "adminv2-ws-deferred-surface--coarse"}`}
            aria-label="Lifecycle command tiles"
          >
            <WorkspaceRootLifecycleGrid lifecycles={lifecycleCards} pending={lifecycleCardsPending} />
          </section>
        </>
      }
    />
  );
}
