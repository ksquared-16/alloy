"use client";

import type { WorkspaceKpiBlock } from "@/lib/workspace/types";

export function KpiBlock({ block, presentation = "flat" }: { block: WorkspaceKpiBlock; presentation?: "flat" | "bridge" }) {
    if (presentation === "bridge") {
        return (
            <div data-workspace-block="kpi" className="adminv2-ws-dept-v2-kpi-measurement-strip" role="group" aria-label="Key metrics">
                <div className="adminv2-ws-dept-v2-kpi-dual">
                    <div className="adminv2-ws-dept-v2-kpi-rail adminv2-ws-dept-v2-kpi-rail--business">
                        <div className="adminv2-ws-dept-v2-kpi-rail-heading">{block.title ?? "KPIs"}</div>
                        <div className="adminv2-ws-kpi-strip adminv2-ws-kpi-strip--dept-embedded">
                            <div className="adminv2-ws-kpi-cell adminv2-ws-kpi-cell--placeholder">
                                <span className="adminv2-ws-kpi-label">Status</span>
                                <span
                                    className="adminv2-ws-kpi-value adminv2-ws-kpi-value--placeholder"
                                    style={{ fontWeight: 500, fontSize: 12, lineHeight: 1.4 }}
                                >
                                    {block.message}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

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
