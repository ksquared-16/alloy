"use client";

import type { WorkspaceKpiBlock } from "@/lib/workspace/types";

export function KpiBlock({ block }: { block: WorkspaceKpiBlock }) {
    return (
        <section
            className="rounded-xl border border-dashed border-admin-border bg-alloy-stone/15 p-4 text-sm text-alloy-midnight/70"
            data-workspace-block="kpi"
        >
            <p className="font-medium text-alloy-midnight/85">{block.title ?? "KPIs"}</p>
            <p className="mt-1">{block.message}</p>
        </section>
    );
}
