"use client";

/**
 * @module WorkspaceMetricTiles
 *
 * ## Purpose
 * The canonical metric tile row for operational module workspaces. Wraps the shipped
 * workspace / work-unit KPI card (`SurfaceHeaderKpiCard`) so every module's metrics
 * read identically. Only the metrics change — never the tile chrome.
 *
 * ## When to use
 * - In `WorkspaceShell.metricsColumn` (Processing Today's activity band).
 * - In `WorkspaceShell.kpiBand` full-width strips (Communications — migrate from CompactKpiStrip).
 * - Any module status summary beside or below the mode nav.
 *
 * ## Do NOT use for
 * - Org-level `/workspace` landing KPIs (Presentation Runtime header model).
 * - Decorative stats without real/derived data.
 * - Module-specific card layouts — pass data via `WorkspaceMetricTileItem[]` only.
 *
 * ## Color (frozen)
 * Midnight Forge = structure; Bend Pine = success/progress; Gold = publish/attention.
 * Callers pass semantic `accent`; this component never invents decoration.
 */

import { SurfaceHeaderKpiCard } from "@/components/presentation/workspace/WorkspaceHeader";
import type { WorkspaceHeaderKpiVm } from "@/lib/presentation/runtime/workspaceHeaderSurfaceConfig";
import type { ProcessCardAccent, ProcessCardIcon } from "@/lib/presentation/runtime/workspaceProcessSurfaceConfig";

export type WorkspaceMetricStatus = "healthy" | "warning" | "critical" | "unknown";

export interface WorkspaceMetricTileItem {
    key: string;
    label: string;
    value: string;
    icon: ProcessCardIcon;
    accent?: ProcessCardAccent | null;
    status?: WorkspaceMetricStatus;
}

export type WorkspaceMetricTilesSize = "sm" | "md";
export type WorkspaceMetricTilesAlign = "start" | "end";

const SIZE_OVERRIDES: Record<WorkspaceMetricTilesSize, string> = {
    sm: "[&_[data-work-unit-header-kpi]]:min-w-0 [&_[data-work-unit-header-kpi-label]]:!overflow-visible [&_[data-work-unit-header-kpi-label]]:!whitespace-normal",
    md: "[&_[data-work-unit-header-kpi]]:min-w-[8.05rem] [&_[data-work-unit-header-kpi]]:gap-2.5 [&_[data-work-unit-header-kpi]]:px-3 [&_[data-work-unit-header-kpi]]:py-2.5 [&_[data-work-unit-header-kpi-icon-well]]:h-[41px] [&_[data-work-unit-header-kpi-icon-well]]:w-[41px] [&_[data-work-unit-header-kpi-value]]:text-[21px] [&_[data-work-unit-header-kpi-label]]:!overflow-visible [&_[data-work-unit-header-kpi-label]]:!whitespace-normal [&_[data-work-unit-header-kpi-label]]:text-[11px]",
};

function toKpiVm(item: WorkspaceMetricTileItem, index: number, loading: boolean): WorkspaceHeaderKpiVm {
    return {
        slot: index + 1,
        label: item.label,
        icon: item.icon,
        accent: item.accent ?? null,
        formattedValue: loading ? "…" : item.value,
        status: item.status ?? "unknown",
        sourceKey: null,
        drillHref: null,
    };
}

export default function WorkspaceMetricTiles({
    items,
    size = "sm",
    align = "start",
    loading = false,
    ariaLabel = "Workspace metrics",
    className = "",
}: {
    items: WorkspaceMetricTileItem[];
    size?: WorkspaceMetricTilesSize;
    align?: WorkspaceMetricTilesAlign;
    loading?: boolean;
    ariaLabel?: string;
    className?: string;
}) {
    if (items.length === 0) return null;
    return (
        <div
            className={`flex flex-wrap items-stretch gap-2.5 ${align === "end" ? "justify-end" : "justify-start"} ${SIZE_OVERRIDES[size]} ${className}`.trim()}
            data-workspace-metric-tiles="true"
            role="list"
            aria-label={ariaLabel}
            aria-busy={loading}
        >
            {items.map((item, index) => (
                <div key={item.key} role="listitem" className="min-w-0">
                    <SurfaceHeaderKpiCard
                        kpi={toKpiVm(item, index, loading)}
                        interactive={false}
                        variant="work-unit"
                        density="compact"
                    />
                </div>
            ))}
        </div>
    );
}
