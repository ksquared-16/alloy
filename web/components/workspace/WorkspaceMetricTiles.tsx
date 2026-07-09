"use client";

/**
 * @module WorkspaceMetricTiles
 *
 * Canonical metric tile row — polished for supporting (not dominating) the workspace.
 * Values are intentionally quieter than action cards; labels and icons read clearly.
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

/**
 * Polished metric tile overrides — spacing unchanged; reduced value weight; clearer labels/icons.
 * `md` used in Processing nav band; `sm` for compact full-width strips (Communications).
 */
const SIZE_OVERRIDES: Record<WorkspaceMetricTilesSize, string> = {
    sm: "[&_[data-work-unit-header-kpi]]:min-w-0 [&_[data-work-unit-header-kpi-value]]:text-[17px] [&_[data-work-unit-header-kpi-value]]:font-semibold [&_[data-work-unit-header-kpi-label]]:!overflow-visible [&_[data-work-unit-header-kpi-label]]:!whitespace-normal [&_[data-work-unit-header-kpi-label]]:text-alloy-midnight/60 [&_[data-work-unit-header-kpi-icon-well]]:bg-alloy-midnight-forge/[0.08] [&_[data-work-unit-header-kpi-icon]]:opacity-100",
    md: "[&_[data-work-unit-header-kpi]]:min-w-[8.05rem] [&_[data-work-unit-header-kpi]]:gap-2.5 [&_[data-work-unit-header-kpi]]:px-3 [&_[data-work-unit-header-kpi]]:py-2.5 [&_[data-work-unit-header-kpi-icon-well]]:h-[41px] [&_[data-work-unit-header-kpi-icon-well]]:w-[41px] [&_[data-work-unit-header-kpi-icon-well]]:bg-alloy-midnight-forge/[0.08] [&_[data-work-unit-header-kpi-icon]]:opacity-100 [&_[data-work-unit-header-kpi-value]]:text-[19px] [&_[data-work-unit-header-kpi-value]]:font-semibold [&_[data-work-unit-header-kpi-value]]:text-alloy-midnight [&_[data-work-unit-header-kpi-label]]:!overflow-visible [&_[data-work-unit-header-kpi-label]]:!whitespace-normal [&_[data-work-unit-header-kpi-label]]:text-[11px] [&_[data-work-unit-header-kpi-label]]:text-alloy-midnight/60",
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
