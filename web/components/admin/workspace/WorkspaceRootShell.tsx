"use client";

import type { CSSProperties } from "react";
import { neutral, derived, brand } from "@/styles/tokens/colors";
import type { KPIVm } from "@/lib/ui-v2/workspace-types";
import type { ResolvedMetricMap } from "@/lib/metrics/fetchResolvedMetrics";
import { WorkspaceRootLifecycleGrid } from "@/components/admin/workspace/WorkspaceRootLifecycleGrid";
import WorkspaceCommandHeader from "@/components/admin/workspace/WorkspaceCommandHeader";
import type { OperatorLifecycleLandingCard } from "@/lib/admin/buildOperatorLifecycleLanding";
import { WorkspaceShellLayout } from "@/components/admin/workspace/WorkspaceShellLayout";
import { WorkspaceRootActionsRail } from "@/app/adminV2/components/workspace/WorkspaceRootActionsRail";
import { OPERATOR_BUSINESS_PROCESSES_LABEL } from "@/lib/metrics/workspaceHealthSummary";
import { WS_ZONE_MT } from "@/lib/workspace/workspaceLayoutSpacing";
import { WS_LAYOUT, WS_LAYOUT_ATTR } from "@/lib/workspace/workspaceLayoutSystem";

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
  departments?: unknown;
  deptTileStats?: unknown;
  metrics: WorkspaceRootMetrics | null;
  metricsLoading: boolean;
  orgOpportunityKpis?: KPIVm[] | null;
  workspaceKpiStrip?: KPIVm[] | undefined;
  oipResolved?: ResolvedMetricMap;
  kpiStripPlaceholder?: boolean;
  workspaceRollupRefined?: boolean;
  departmentsPending?: boolean;
  deptTileStatsPending?: boolean;
  kpiQuietReserveOnly?: boolean;
  lifecycleCards?: readonly OperatorLifecycleLandingCard[];
  lifecycleCardsPending?: boolean;
};

export function WorkspaceRootShell({
  orgName,
  workspaceKpiStrip,
  oipResolved,
  kpiStripPlaceholder = false,
  workspaceRollupRefined = false,
  lifecycleCards = [],
  lifecycleCardsPending = false,
}: Props) {
  const displayName = (orgName && orgName.trim()) || "Your organization";
  const defaultDepartmentId = lifecycleCards[0]?.departmentId ?? null;
  const showHeader = workspaceRollupRefined && (workspaceKpiStrip?.length || kpiStripPlaceholder);

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
          {showHeader ?
            <div
              className="adminv2-ws-root-kpi-zone px-0 pb-1"
              data-workspace-zone="command-header"
            >
              <WorkspaceCommandHeader
                orgName={displayName}
                kpis={workspaceKpiStrip ?? []}
                oipResolved={oipResolved}
                loading={kpiStripPlaceholder}
              />
            </div>
          :   null}

            <section
                className={`adminv2-ws-root-departments-zone ${WS_ZONE_MT.commandToGrid}`}
                data-ws-layout={WS_LAYOUT_ATTR.workspaceSectionB}
                aria-label="Business process command tiles"
            >
                <h2 className={`${WS_LAYOUT.sectionKicker} mb-2`}>
                    {OPERATOR_BUSINESS_PROCESSES_LABEL}
                </h2>
                <WorkspaceRootLifecycleGrid lifecycles={lifecycleCards} pending={lifecycleCardsPending} />
            </section>
        </>
      }
    />
  );
}
