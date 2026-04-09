"use client";

import type { CSSProperties } from "react";
import { useCallback, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { neutral, derived, brand } from "@/styles/tokens/colors";
import "@/app/adminV2/components/workspace/workspace.css";
import KPIBlock from "@/app/adminV2/components/workspace/blocks/KPIBlock";
import ActionsBlock from "@/app/adminV2/components/workspace/blocks/ActionsBlock";
import type { ActionsVm, KPIVm } from "@/lib/ui-v2/workspace-types";
import type { WorkspaceAction } from "@/lib/ui-v2/workspace-actions";
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
  unassignedJobs: number | null;
  activeJobs: number | null;
  visitsToday: number | null;
  departments: number | null;
  workUnits: number | null;
  unpaidJobsSample: { count: number; capped: boolean } | null;
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

function buildKpis(metrics: WorkspaceRootMetrics | null, metricsLoading: boolean): KPIVm[] {
  if (metricsLoading || !metrics) {
    return [
      { id: "u", label: "Unassigned jobs", value: "—", lane: "business" },
      { id: "v", label: "Visits today", value: "—", lane: "business" },
      { id: "a", label: "Active jobs", value: "—", lane: "business" },
      { id: "d", label: "Departments", value: "—", lane: "ai" },
      { id: "w", label: "Work units", value: "—", lane: "ai" },
      { id: "p", label: "Unpaid (sample)", value: "—", lane: "ai", tone: "risk" },
    ];
  }

  const unpaid =
    metrics.unpaidJobsSample == null
      ? "—"
      : metrics.unpaidJobsSample.capped
        ? `${metrics.unpaidJobsSample.count}+`
        : String(metrics.unpaidJobsSample.count);

  return [
    {
      id: "unassigned",
      label: "Unassigned jobs",
      value: formatInt(metrics.unassignedJobs),
      lane: "business",
      tone: metrics.unassignedJobs != null && metrics.unassignedJobs > 0 ? "risk" : "neutral",
    },
    {
      id: "visits",
      label: "Visits today",
      value: formatInt(metrics.visitsToday),
      lane: "business",
    },
    {
      id: "active",
      label: "Active jobs",
      value: formatInt(metrics.activeJobs),
      lane: "business",
    },
    {
      id: "depts",
      label: "Departments",
      value: formatInt(metrics.departments),
      lane: "ai",
    },
    {
      id: "wu",
      label: "Work units",
      value: formatInt(metrics.workUnits),
      lane: "ai",
    },
    {
      id: "unpaid",
      label: "Jobs w/ balance (sample)",
      value: unpaid,
      lane: "ai",
      tone: "risk",
      aiSummary:
        metrics.unpaidJobsSample?.capped === true ? "First 200 jobs scanned" : undefined,
    },
  ];
}

/**
 * Organization workspace root — company banner, KPI strip, department grid, command rail (Admin V2 mock grammar).
 */
export function WorkspaceRootShell({ orgName, departments, deptTileStats, metrics, metricsLoading }: Props) {
  const router = useRouter();
  const displayName = (orgName && orgName.trim()) || "Your organization";

  const operationsDeptId = useMemo(
    () => departments.find((d) => d.key === "operations")?.id ?? departments[0]?.id ?? "",
    [departments]
  );

  const actionsModel: ActionsVm = useMemo(() => {
    const ops: ActionsVm["systemActions"] = [];
    if (operationsDeptId) {
      ops.push({
        id: "open-operations",
        label: "Open Operations",
        variant: "primary",
      });
    }
    ops.push({ id: "all-jobs", label: "All jobs", variant: operationsDeptId ? "secondary" : "primary" });
    return {
      primaries: [],
      systemActions: ops,
      quickOperations: [
        { id: "schedules", label: "Schedules" },
        { id: "work-units", label: "Work units (system)" },
        { id: "departments-admin", label: "Departments (system)" },
      ],
      systemStatusLines: [
        "Legacy admin lists open in /admin while workspace navigation stays under /adminV2/workspace.",
      ],
    };
  }, [operationsDeptId]);

  const onAction = useCallback(
    (a: WorkspaceAction) => {
      if (a.type === "navigate" && a.href) {
        router.push(a.href);
        return;
      }
      if (a.type !== "actions.block") return;
      switch (a.actionId) {
        case "open-operations":
          if (operationsDeptId) router.push(`${WORKSPACE_BASE}/dept/${encodeURIComponent(operationsDeptId)}`);
          break;
        case "all-jobs":
          router.push("/admin/jobs");
          break;
        case "schedules":
          router.push("/admin/schedules");
          break;
        case "work-units":
          router.push("/admin/system/work-units");
          break;
        case "departments-admin":
          router.push("/admin/system/departments");
          break;
        default:
          break;
      }
    },
    [operationsDeptId, router]
  );

  const kpis = useMemo(() => buildKpis(metrics, metricsLoading), [metrics, metricsLoading]);

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
                    Top layer above departments: pick a function to open signals, queues, and work units. KPIs below are
                    live org rollups where available; the unpaid column scans up to 200 recent jobs for open balances.
                  </p>
                </div>
              </div>
              <KPIBlock
                kpis={kpis}
                surface="company"
                dualRailHeadings={{ business: "Operations signals", secondary: "Workspace structure" }}
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

          <div className="adminv2-ws-dept-v2-command-column" data-adminv2-workspace-command-column>
            <aside
              className="adminv2-ws-dept-v2-rail adminv2-ws-dept-v2-rail--command-shell"
              data-adminv2-workspace-command-rail
              aria-label="Workspace shortcuts"
            >
              <ActionsBlock model={actionsModel} onAction={onAction} title="Quick links" surface="company" />
              <div className="adminv2-ws-actions-rail-subdivider" aria-hidden />
              <section className="adminv2-ws-actions-rail adminv2-ws-actions-rail--dept-panel px-3 pb-3 pt-0">
                <h3 className="adminv2-ws-actions-rail-title">Context</h3>
                <p className="text-xs leading-relaxed" style={{ color: derived.textSecondary }}>
                  This surface is scoped to your signed-in org. Department pages hold the operational lanes; system lists
                  for jobs and schedules remain in classic admin until those flows fully land in V2.
                </p>
                <p className="text-xs mt-3">
                  <Link href="/adminV2/workspace/drawer-probe" className="font-medium hover:underline" style={{ color: brand.primary }}>
                    Drawer probe
                  </Link>
                  <span style={{ color: derived.textSecondary }}> — smoke-test entity drawer from workspace.</span>
                </p>
              </section>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}
