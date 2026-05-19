"use client";

import {
    WorkspacePairedOperPanel,
    WorkspacePairedOperPanelsGrid,
} from "@/components/admin/workspace/WorkspacePairedOperPanels";

/** Non-pulsing KPI band — reserves strip height without animated skeleton cells. */
export function WorkspaceQuietKpiReserve({ id = "kpi-quiet-reserve" }: { id?: string }) {
    return (
        <div
            id={id}
            className="adminv2-ws-kpi-root-band adminv2-ws-kpi-root-band--compact"
            aria-busy="true"
            aria-label="Loading key metrics"
        >
            <div
                className="adminv2-ws-kpi-strip adminv2-ws-kpi-strip--orientation rounded-lg border border-alloy-stone/12 bg-white/40"
                style={{ minHeight: "4.25rem" }}
                role="presentation"
            />
        </div>
    );
}

/** Single calm paired-panel reserve (both lanes) — one visual phase instead of row skeleton lists. */
export function DeptPairedOperQuietReserve({ throughputTitle }: { throughputTitle: string }) {
    return (
        <WorkspacePairedOperPanelsGrid>
            <WorkspacePairedOperPanel tone="throughput" ariaLabel={throughputTitle} title={throughputTitle}>
                <div
                    className="rounded-lg border border-alloy-stone/12 bg-white/45"
                    style={{ minHeight: "11.5rem" }}
                    aria-hidden
                />
            </WorkspacePairedOperPanel>
            <WorkspacePairedOperPanel
                tone="attention"
                ariaLabel="Needs Attention"
                title="Needs Attention"
                titleClassName="adminv2-ws-queue-title--section-primary-type"
            >
                <div
                    className="rounded-lg border border-alloy-stone/12 bg-white/45"
                    style={{ minHeight: "11.5rem" }}
                    aria-hidden
                />
            </WorkspacePairedOperPanel>
        </WorkspacePairedOperPanelsGrid>
    );
}

/** Work-unit queue lane quiet reserve while first rows are not yet useful. */
export function WorkspaceQuietQueueLaneReserve() {
    return (
        <div
            className="adminv2-ws-wu-queue-shell rounded-xl border border-alloy-stone/12 bg-white/40"
            style={{ minHeight: "14rem" }}
            aria-busy="true"
            aria-label="Loading queue"
        />
    );
}
