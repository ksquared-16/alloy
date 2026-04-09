"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { neutral, derived, brand } from "@/styles/tokens/colors";
import "@/app/adminV2/components/workspace/workspace.css";

export type WorkspaceRootDepartmentRow = {
    id: string;
    key: string;
    name: string;
    description?: string | null;
    sort_order?: number | null;
    is_active?: boolean | null;
};

/** Matches company rollup tile tones — extended for seeded cleaning-org keys. */
function deptToneForKey(departmentKey: string): "pine" | "amber" | "blue" | "neutral" {
    const m: Record<string, "pine" | "amber" | "blue" | "neutral"> = {
        operations: "pine",
        finance: "neutral",
        growth: "blue",
        customer_experience: "amber",
        system: "neutral",
        revenue: "amber",
        team: "neutral",
    };
    return m[departmentKey] ?? "neutral";
}

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

/** Per-department rollups for root tiles (from /api/admin/work-units, etc.). */
export type WorkspaceRootDeptTileStats = Record<string, { workUnitCount: number }>;

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
                            const tone = deptToneForKey(d.key);
                            const desc =
                                (d.description && String(d.description).trim()) ||
                                `Open the ${d.name} workspace — work units and queues live inside.`;
                            const wu = deptTileStats?.[d.id]?.workUnitCount;
                            const statsLine =
                                wu != null && wu >= 0 ? `${wu} work unit${wu === 1 ? "" : "s"} in this department` : null;
                            return (
                                <Link
                                    key={d.id}
                                    href={`${base}/dept/${encodeURIComponent(d.id)}`}
                                    className={[
                                        "adminv2-ws-company-dept-tile block text-left no-underline text-inherit rounded-[inherit] focus:outline-none focus-visible:ring-2 focus-visible:ring-alloy-blue/35",
                                        root ? "adminv2-ws-company-dept-tile--workspace-root" : "",
                                    ]
                                        .filter(Boolean)
                                        .join(" ")}
                                    data-ws-company-dept-key={d.key}
                                    data-ws-company-dept-tone={tone}
                                    aria-label={`Open ${d.name} department`}
                                >
                                    <div className="adminv2-ws-company-dept-tile-head">
                                        <h3 className="adminv2-ws-company-dept-tile-name">{d.name}</h3>
                                    </div>
                                    <p className="adminv2-ws-company-dept-tile-desc">{desc}</p>
                                    {statsLine ? (
                                        <p className="text-xs font-medium leading-snug" style={{ color: derived.textSecondary }}>
                                            {statsLine}
                                        </p>
                                    ) : null}
                                    <p className="mt-3 text-xs font-semibold" style={{ color: brand.primary }}>
                                        Open department →
                                    </p>
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
