"use client";

import type { HTMLAttributes } from "react";

import CompactKpiStrip, { type CompactKpiItem } from "@/components/workspace/CompactKpiStrip";

export type { CompactKpiItem as WorkspaceMetricTileItem };

/**
 * Operational Workspace Doctrine V2 — compact KPI / status metric tile strip.
 */
export default function WorkspaceMetricTiles({
    items,
    loading = false,
    ariaLabel = "Status",
    ...rest
}: {
    items: CompactKpiItem[];
    loading?: boolean;
    ariaLabel?: string;
} & HTMLAttributes<HTMLDivElement>) {
    return (
        <CompactKpiStrip
            items={items}
            loading={loading}
            ariaLabel={ariaLabel}
            data-workspace-metric-tiles="true"
            {...rest}
        />
    );
}
