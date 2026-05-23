"use client";

import type { CSSProperties, MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { neutral, derived } from "@/styles/tokens/colors";
import {
    adminV2NavigationClickedItemProps,
    runAdminV2NavigationTransition,
    useAdminV2NavigationTransition,
} from "@/lib/adminV2/navigation";
import {
    prefetchDeptAboveFoldBundle,
    prefetchDeptAboveFoldOnIntent,
} from "@/lib/adminV2/prefetchAdminV2AboveFold";
import { appendWorkspaceSiteToPath } from "@/lib/adminV2/workspaceSiteFilterClient";
import { useWorkspaceSiteFilter } from "@/contexts/WorkspaceSiteFilterContext";
import {
    alloyFamilyToWorkspaceTileTone,
    operationalWorkspaceShellStyle,
    resolveVisualContext,
} from "@/lib/visualContext";
import { isGrowthSliceDepartmentKey } from "@/lib/workspace/growthSliceDepartments";
import "@/app/adminV2/components/workspace/workspace.css";

export type WorkspaceRootDepartmentRow = {
    id: string;
    key: string;
    name: string;
    description?: string | null;
    sort_order?: number | null;
    is_active?: boolean | null;
    /** When API exposes `default_visual_context_key`, ties tile to registry before `key` fallback. */
    default_visual_context_key?: string | null;
};

/** Org-level company shell — weakest contextual intensity; tiles use `data-ws-company-dept-tone` per row. */
const companyRootStyle: CSSProperties = operationalWorkspaceShellStyle({
    layer: "workspace",
});

/** Per-department rollups for root tiles (from /api/admin/work-units, etc.). */
export type WorkspaceRootDeptTileStats = Record<
    string,
    { workUnitCount: number; opportunityRollupLine?: string | null }
>;

type Props = {
    workspaceBasePath: string;
    departments: WorkspaceRootDepartmentRow[];
    deptTileStats?: WorkspaceRootDeptTileStats;
    /** When true, reserve stats line height with a skeleton (no coarse→refined number flash). */
    deptTileStatsPending?: boolean;
    /** Cold load: render placeholder tiles when `departments` is still empty. */
    departmentsPending?: boolean;
    /** `workspaceRoot`: larger tiles + stats lines (org workspace index). */
    tileVariant?: "default" | "workspaceRoot";
    /** When true, render only the department section (parent must supply `data-ws-surface="company"` + company v2 classes). */
    omitOuterChrome?: boolean;
};

function workspaceDeptClickedKey(departmentId: string): string {
    return `dept:${departmentId}`;
}

function isModifiedNavClick(e: MouseEvent<HTMLAnchorElement>): boolean {
    return e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.defaultPrevented;
}

/**
 * Org / company-level department entry — real rows from GET /api/admin/departments.
 * Primary click: orchestrated transition (prefetch bootstrap → router.push).
 */
export function WorkspaceRootDepartmentGrid({
    workspaceBasePath,
    departments,
    deptTileStats,
    deptTileStatsPending = false,
    departmentsPending = false,
    tileVariant = "default",
    omitOuterChrome = false,
}: Props) {
    const base = workspaceBasePath.replace(/\/$/, "");
    const root = tileVariant === "workspaceRoot";
    const router = useRouter();
    const selectedSiteId = useWorkspaceSiteFilter()?.selectedSiteId ?? null;
    useAdminV2NavigationTransition();

    const handleDepartmentTileClick = (e: MouseEvent<HTMLAnchorElement>, departmentId: string, href: string) => {
        if (isModifiedNavClick(e)) return;
        e.preventDefault();
        void runAdminV2NavigationTransition({
            href,
            clickedKey: workspaceDeptClickedKey(departmentId),
            variant: "department",
            prepare: () =>
                prefetchDeptAboveFoldBundle({
                    departmentId,
                    selectedSiteId,
                    reason: "click_prepare",
                }),
            commit: () => {
                router.push(href);
            },
        });
    };

    const grid = (
        <div
            className={
                root
                    ? "adminv2-ws-company-v2-dept-grid adminv2-ws-company-v2-dept-grid--workspace-root"
                    : "adminv2-ws-company-v2-dept-grid"
            }
        >
            {departmentsPending && departments.length === 0
                ? Array.from({ length: 4 }, (_, i) => (
                      <div
                          key={`dept-tile-skel-${i}`}
                          className={[
                              "adminv2-ws-company-dept-tile pointer-events-none select-none",
                              root ? "adminv2-ws-company-dept-tile--workspace-root" : "",
                          ]
                              .filter(Boolean)
                              .join(" ")}
                          data-ws-company-dept-tone="neutral"
                          aria-busy="true"
                      >
                          <div className="adminv2-ws-company-dept-tile-head">
                              <span className="block h-5 w-[min(72%,11rem)] rounded skeleton-pulse bg-alloy-stone/16" />
                          </div>
                          <span className="adminv2-ws-company-dept-tile-desc flex-1 block mt-2">
                              <span className="block h-3.5 w-full max-w-[16rem] rounded skeleton-pulse bg-alloy-stone/12" />
                              <span className="block h-3.5 w-[82%] max-w-[14rem] rounded skeleton-pulse bg-alloy-stone/10 mt-1.5" />
                          </span>
                          <div className="mt-auto pt-2 flex flex-col gap-1 min-h-[2.75rem]">
                              <span className="inline-block h-3.5 w-[min(72%,9rem)] rounded skeleton-pulse bg-alloy-stone/16" />
                              <span className="inline-block h-3 w-24 rounded skeleton-pulse bg-alloy-stone/10" />
                          </div>
                      </div>
                  ))
                : null}
            {departments.map((d) => {
                const tone = alloyFamilyToWorkspaceTileTone(
                    resolveVisualContext({
                        departmentKey: d.key,
                        departmentDefaultVisualContextKey: d.default_visual_context_key ?? undefined,
                    }).alloyFamily
                );
                const desc =
                    (d.description && String(d.description).trim()) ||
                    `Departments and work units for ${d.name}.`;
                const stats = deptTileStats?.[d.id];
                const wu = stats?.workUnitCount;
                const rollup = stats?.opportunityRollupLine?.trim();
                const statsLine =
                    isGrowthSliceDepartmentKey(d.key) && rollup
                        ? rollup
                        : wu != null && wu >= 0
                          ? `${wu} work unit${wu === 1 ? "" : "s"}`
                          : null;
                const href = appendWorkspaceSiteToPath(
                    `${base}/dept/${encodeURIComponent(d.id)}`,
                    selectedSiteId
                );
                const clickedKey = workspaceDeptClickedKey(d.id);
                const pendingProps = adminV2NavigationClickedItemProps(clickedKey);
                return (
                    <a
                        key={d.id}
                        href={href}
                        onPointerDown={(e) => {
                            if (isModifiedNavClick(e)) return;
                            prefetchDeptAboveFoldOnIntent({
                                departmentId: d.id,
                                selectedSiteId,
                                reason: "pointer",
                            });
                        }}
                        onClick={(e) => handleDepartmentTileClick(e, d.id, href)}
                        className={[
                            "adminv2-ws-company-dept-tile adminv2-interactive-surface group block h-full text-left no-underline text-inherit rounded-[inherit] focus:outline-none focus-visible:ring-2 focus-visible:ring-alloy-blue/35",
                            root ? "adminv2-ws-company-dept-tile--workspace-root" : "",
                        ]
                            .filter(Boolean)
                            .join(" ")}
                        data-ws-company-dept-key={d.key}
                        data-ws-company-dept-tone={tone}
                        aria-label={`${d.name} department workspace`}
                        {...pendingProps}
                    >
                        <div className="adminv2-ws-company-dept-tile-head">
                            <h3 className="adminv2-ws-company-dept-tile-name">{d.name}</h3>
                        </div>
                        <p className="adminv2-ws-company-dept-tile-desc flex-1">{desc}</p>
                        <div className="mt-auto pt-2 flex flex-col gap-1 min-h-[2.75rem]">
                            {deptTileStatsPending ? (
                                <p className="text-xs font-semibold tabular-nums min-h-[1.125rem]" aria-busy="true">
                                    <span className="inline-block h-3.5 w-[min(72%,9rem)] rounded skeleton-pulse bg-alloy-stone/16" />
                                </p>
                            ) : statsLine ? (
                                <p className="text-xs font-semibold tabular-nums" style={{ color: neutral.textPrimary }}>
                                    {statsLine}
                                </p>
                            ) : null}
                            <p className="text-[11px] font-medium leading-snug" style={{ color: derived.textSecondary }}>
                                Open department
                            </p>
                        </div>
                    </a>
                );
            })}
        </div>
    );

    if (omitOuterChrome) {
        return (
            <section className="adminv2-ws-company-v2-main" aria-label="Departments" data-production-workspace-root="true">
                {grid}
            </section>
        );
    }

    return (
        <div
            data-ws-surface="company"
            data-production-workspace-root="true"
            data-ws-root-tile-variant={root ? "workspaceRoot" : undefined}
            className="adminv2-ws-root adminv2-ws-company adminv2-ws-company-v2"
            style={companyRootStyle}
        >
            <div className={root ? "adminv2-ws-dept-v2-contain px-0" : "adminv2-ws-dept-v2-contain"}>
                <section className="adminv2-ws-company-v2-main" aria-label="Departments">
                    {grid}
                </section>
            </div>
        </div>
    );
}
