"use client";

import {
    ADMINV2_QUIET_RESERVE_PANEL_CLASS,
    adminV2DeptKpiQuietReserveStyle,
    adminV2DeptPairedOperPanelReserveStyle,
} from "@/lib/ui-v2/adminV2LoadingGeometry";
import {
    WorkspacePairedOperPanel,
    WorkspacePairedOperPanelsGrid,
} from "@/components/admin/workspace/WorkspacePairedOperPanels";

function DeptPairedOperPanelReservePane() {
    return (
        <div
            className={ADMINV2_QUIET_RESERVE_PANEL_CLASS}
            style={adminV2DeptPairedOperPanelReserveStyle()}
            aria-hidden
        />
    );
}

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
                style={adminV2DeptKpiQuietReserveStyle()}
                role="presentation"
            />
        </div>
    );
}

function DeptOperRegionSpinner() {
    return (
        <div
            className="h-9 w-9 rounded-full border-[3px] border-alloy-forge/12 border-t-alloy-forge/70 border-r-alloy-forge/35 animate-spin motion-reduce:animate-none"
            style={{ animationDuration: "0.95s" }}
            aria-hidden
        />
    );
}

/**
 * Centered loader inside paired oper panels — gates Pipeline + Needs Attention without blank panel bodies.
 */
export function DeptOperationalRegionLoader({ throughputTitle }: { throughputTitle: string }) {
    const panelBodyStyle = adminV2DeptPairedOperPanelReserveStyle();
    return (
        <div
            className="relative"
            data-adminv2-dept-oper-region-loading="true"
            aria-busy="true"
            aria-live="polite"
            aria-label="Loading department queues and attention"
        >
            <WorkspacePairedOperPanelsGrid>
                <WorkspacePairedOperPanel tone="throughput" ariaLabel={throughputTitle} title={throughputTitle}>
                    <div style={panelBodyStyle} aria-hidden />
                </WorkspacePairedOperPanel>
                <WorkspacePairedOperPanel
                    tone="attention"
                    ariaLabel="Needs Attention"
                    title="Needs Attention"
                    titleClassName="adminv2-ws-queue-title--section-primary-type"
                >
                    <div style={panelBodyStyle} aria-hidden />
                </WorkspacePairedOperPanel>
            </WorkspacePairedOperPanelsGrid>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <DeptOperRegionSpinner />
            </div>
        </div>
    );
}

/** Single calm paired-panel reserve (both lanes) — same geometry on cold nav and client revisit. */
export function DeptPairedOperQuietReserve({ throughputTitle }: { throughputTitle: string }) {
    return (
        <div data-adminv2-dept-oper-reserve="true" aria-busy="true">
            <WorkspacePairedOperPanelsGrid>
                <WorkspacePairedOperPanel tone="throughput" ariaLabel={throughputTitle} title={throughputTitle}>
                    <DeptPairedOperPanelReservePane />
                </WorkspacePairedOperPanel>
                <WorkspacePairedOperPanel
                    tone="attention"
                    ariaLabel="Needs Attention"
                    title="Needs Attention"
                    titleClassName="adminv2-ws-queue-title--section-primary-type"
                >
                    <DeptPairedOperPanelReservePane />
                </WorkspacePairedOperPanel>
            </WorkspacePairedOperPanelsGrid>
        </div>
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
