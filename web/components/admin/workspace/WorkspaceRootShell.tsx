"use client";

import type { CSSProperties } from "react";
import { useMemo } from "react";
import { neutral, derived, brand } from "@/styles/tokens/colors";
import { WorkspaceKpiOrientationCrossfade } from "@/components/admin/workspace/WorkspaceKpiOrientationCrossfade";
import { WorkspaceQuietKpiReserve } from "@/components/admin/workspace/WorkspaceQuietLoadingReserve";
import type { KPIVm } from "@/lib/ui-v2/workspace-types";
import { WorkspaceRootLifecycleGrid } from "@/components/admin/workspace/WorkspaceRootLifecycleGrid";
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

function buildStructureKpis(lifecycleCount: number): KPIVm[] {
  return [{ id: "lifecycles", label: "Lifecycles", value: String(lifecycleCount), lane: "business" }];
}

function filterOperatorWorkspaceKpis(items: KPIVm[], lifecycleCount: number): KPIVm[] {
  const filtered = items.filter((k) => {
    const label = String(k.label ?? "").trim().toLowerCase();
    const id = String(k.id ?? "").trim().toLowerCase();
    return label !== "departments" && id !== "depts" && label !== "work units" && id !== "wu";
  });
  if (filtered.some((k) => k.id === "lifecycles")) return filtered;
  return [...buildStructureKpis(lifecycleCount), ...filtered];
}

/**
 * Operator workspace root — lifecycle tiles, KPI strip, orientation rail.
 */
export function WorkspaceRootShell({
  orgName,
  orgOpportunityKpis,
  workspaceKpiStrip,
  kpiStripPlaceholder = false,
  workspaceRollupRefined = false,
  kpiQuietReserveOnly = false,
  lifecycleCards = [],
  lifecycleCardsPending = false,
}: Props) {
  const displayName = (orgName && orgName.trim()) || "Your organization";
  const lifecycleCount = lifecycleCards.length;

  const kpis = useMemo(() => {
    if (workspaceKpiStrip !== undefined) {
      return filterOperatorWorkspaceKpis(workspaceKpiStrip, lifecycleCount);
    }
    const structure = buildStructureKpis(lifecycleCount);
    const roll = orgOpportunityKpis?.length ? orgOpportunityKpis : [];
    return filterOperatorWorkspaceKpis([...structure, ...roll], lifecycleCount);
  }, [workspaceKpiStrip, orgOpportunityKpis, lifecycleCount]);

  return (
    <WorkspaceShellLayout
      surface="company"
      rootClassName="adminv2-ws-company adminv2-ws-company-v2"
      style={companyRootStyle}
      workspaceRootShell
      railAriaLabel="Decisions and actions"
      showRail
      railContent={<WorkspaceRootActionsRail />}
      containLead={
        <nav className="adminv2-ws-inline-breadcrumb text-alloy-midnight/60 flex flex-wrap items-center gap-0.5 pb-1" aria-label="Breadcrumb">
          <span className="text-alloy-midnight/80 font-medium">Workspace</span>
        </nav>
      }
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
                  Command center for your configured lifecycles — open where work is waiting and stay in flow.
                </p>
              </div>
            </div>
            {kpiStripPlaceholder && kpiQuietReserveOnly ? (
              <WorkspaceQuietKpiReserve id="workspace-kpi-quiet-reserve" />
            ) : (
              <WorkspaceKpiOrientationCrossfade
                kpis={kpis}
                placeholderPending={kpiStripPlaceholder}
                maxVisible={5}
              />
            )}
          </div>

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
