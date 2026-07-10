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
import { WS_METRIC_EYEBROW, WS_TEXT_SECONDARY } from "@/components/workspace/workspaceTokens";

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

/** Accent ring on icon wells — visual anchor without module themes. */
const ACCENT_ICON_RING: Partial<Record<ProcessCardAccent, string>> = {
    pine: "[&_[data-work-unit-header-kpi-icon-well]]:ring-1 [&_[data-work-unit-header-kpi-icon-well]]:ring-alloy-bend-pine/28",
    blue: "[&_[data-work-unit-header-kpi-icon-well]]:ring-1 [&_[data-work-unit-header-kpi-icon-well]]:ring-alloy-blue/25",
    ember: "[&_[data-work-unit-header-kpi-icon-well]]:ring-1 [&_[data-work-unit-header-kpi-icon-well]]:ring-alloy-ember/28",
    midnight:
        "[&_[data-work-unit-header-kpi-icon-well]]:ring-1 [&_[data-work-unit-header-kpi-icon-well]]:ring-alloy-midnight-forge/22",
    stone: "[&_[data-work-unit-header-kpi-icon-well]]:ring-1 [&_[data-work-unit-header-kpi-icon-well]]:ring-alloy-stone/50",
    gold: "[&_[data-work-unit-header-kpi-icon-well]]:ring-1 [&_[data-work-unit-header-kpi-icon-well]]:ring-alloy-gold-dark/30",
};

/**
 * Canonical metric tile overrides — accent icon wells from processCardAccentStyles;
 * numbers intentionally quieter than action cards; labels use secondary hierarchy.
 */
const SIZE_OVERRIDES: Record<WorkspaceMetricTilesSize, string> = {
    sm: `[&_[data-work-unit-header-kpi]]:min-w-0 [&_[data-work-unit-header-kpi-value]]:!font-medium [&_[data-work-unit-header-kpi-value]]:text-[16px] [&_[data-work-unit-header-kpi-label]]:!overflow-visible [&_[data-work-unit-header-kpi-label]]:!whitespace-normal [&_[data-work-unit-header-kpi-label]]:${WS_TEXT_SECONDARY} [&_[data-work-unit-header-kpi-icon]]:!opacity-100`,
    md: `[&_[data-work-unit-header-kpi]]:min-w-[8.05rem] [&_[data-work-unit-header-kpi]]:gap-2.5 [&_[data-work-unit-header-kpi]]:px-3 [&_[data-work-unit-header-kpi]]:py-2.5 [&_[data-work-unit-header-kpi-icon-well]]:h-[41px] [&_[data-work-unit-header-kpi-icon-well]]:w-[41px] [&_[data-work-unit-header-kpi-icon]]:!opacity-100 [&_[data-work-unit-header-kpi-value]]:!font-medium [&_[data-work-unit-header-kpi-value]]:text-[18px] [&_[data-work-unit-header-kpi-value]]:text-alloy-midnight [&_[data-work-unit-header-kpi-label]]:!overflow-visible [&_[data-work-unit-header-kpi-label]]:!whitespace-normal [&_[data-work-unit-header-kpi-label]]:text-[11px] [&_[data-work-unit-header-kpi-label]]:${WS_TEXT_SECONDARY}`,
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
    eyebrow,
    size = "sm",
    align = "start",
    loading = false,
    ariaLabel = "Workspace metrics",
    className = "",
    "data-testid": testId,
}: {
    items: WorkspaceMetricTileItem[];
    /** Optional band label stacked above tiles (e.g. Today's activity). */
    eyebrow?: string;
    size?: WorkspaceMetricTilesSize;
    align?: WorkspaceMetricTilesAlign;
    loading?: boolean;
    ariaLabel?: string;
    className?: string;
    "data-testid"?: string;
}) {
    if (items.length === 0) return null;

    const tiles = (
        <div
            className={`flex flex-wrap items-stretch gap-2.5 ${align === "end" ? "justify-end" : "justify-start"} ${SIZE_OVERRIDES[size]} ${eyebrow ? "w-full" : className}`.trim()}
            data-workspace-metric-tiles="true"
            data-testid={eyebrow ? undefined : testId}
            role="list"
            aria-label={ariaLabel}
            aria-busy={loading}
        >
            {items.map((item, index) => (
                <div
                    key={item.key}
                    role="listitem"
                    className={`min-w-0 ${item.accent ? (ACCENT_ICON_RING[item.accent] ?? "") : ""}`.trim()}
                >
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

    if (!eyebrow) return tiles;

    return (
        <div
            className={`flex w-full min-w-0 flex-col gap-1.5 ${className}`.trim()}
            data-workspace-metric-band="true"
            data-testid={testId}
        >
            <p className={WS_METRIC_EYEBROW}>
                <span className="h-1.5 w-1.5 shrink-0 rotate-45 bg-alloy-slate/50" aria-hidden />
                {eyebrow}
            </p>
            {tiles}
        </div>
    );
}
