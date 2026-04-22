"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { neutral, derived } from "@/styles/tokens/colors";
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
    /** `workspaceRoot`: larger tiles + stats lines (org workspace index). */
    tileVariant?: "default" | "workspaceRoot";
    /** When true, render only the department section (parent must supply `data-ws-surface="company"` + company v2 classes). */
    omitOuterChrome?: boolean;
};

/**
 * Org / company-level department entry — real rows from GET /api/admin/departments.
 * Reuses Admin V2 company workspace tile chrome (workspace.css) without rollup metrics.
 */
export function WorkspaceRootDepartmentGrid({
    workspaceBasePath,
    departments,
    deptTileStats,
    tileVariant = "default",
    omitOuterChrome = false,
}: Props) {
    const base = workspaceBasePath.replace(/\/$/, "");
    const root = tileVariant === "workspaceRoot";

    const grid = (
        <div
            className={
                root
                    ? "adminv2-ws-company-v2-dept-grid adminv2-ws-company-v2-dept-grid--workspace-root"
                    : "adminv2-ws-company-v2-dept-grid"
            }
        >
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
                            return (
                                <Link
                                    key={d.id}
                                    href={`${base}/dept/${encodeURIComponent(d.id)}`}
                                    className={[
                                        "adminv2-ws-company-dept-tile group block h-full text-left no-underline text-inherit rounded-[inherit] focus:outline-none focus-visible:ring-2 focus-visible:ring-alloy-blue/35",
                                        root ? "adminv2-ws-company-dept-tile--workspace-root" : "",
                                    ]
                                        .filter(Boolean)
                                        .join(" ")}
                                    data-ws-company-dept-key={d.key}
                                    data-ws-company-dept-tone={tone}
                                    aria-label={`${d.name} department workspace`}
                                >
                                    <div className="adminv2-ws-company-dept-tile-head">
                                        <h3 className="adminv2-ws-company-dept-tile-name">{d.name}</h3>
                                    </div>
                                    <p className="adminv2-ws-company-dept-tile-desc flex-1">{desc}</p>
                                    <div className="mt-auto pt-2 flex flex-col gap-1">
                                        {statsLine ? (
                                            <p className="text-xs font-semibold tabular-nums" style={{ color: neutral.textPrimary }}>
                                                {statsLine}
                                            </p>
                                        ) : null}
                                        <p className="text-[11px] font-medium leading-snug" style={{ color: derived.textSecondary }}>
                                            Open department
                                        </p>
                                    </div>
                                </Link>
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
