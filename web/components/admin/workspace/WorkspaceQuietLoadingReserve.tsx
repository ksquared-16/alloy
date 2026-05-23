"use client";

import {
    ADMINV2_QUIET_RESERVE_PANEL_CLASS,
    ADMINV2_WORK_UNIT_QUEUE_ROW_SKELETON_COUNT,
    adminV2DeptKpiQuietReserveStyle,
    adminV2DeptPairedOperPanelReserveStyle,
    adminV2WorkUnitQueueLaneReserveStyle,
} from "@/lib/ui-v2/adminV2LoadingGeometry";
import { WorkUnitQueueLaneRowSkeletonList } from "@/components/admin/workspace/WorkUnitQueueCompactRowSkeleton";
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
            style={adminV2WorkUnitQueueLaneReserveStyle()}
            data-adminv2-wu-queue-lane-reserve="true"
            aria-hidden
        />
    );
}

function WorkUnitOperLaneSpinner() {
    return (
        <div
            className="h-9 w-9 rounded-full border-[3px] border-alloy-forge/12 border-t-alloy-forge/70 border-r-alloy-forge/35 animate-spin motion-reduce:animate-none"
            style={{ animationDuration: "0.95s" }}
            aria-hidden
        />
    );
}

/**
 * Centered loader inside the work-unit queue lane — gates oper region without framed page skeletons.
 */
export function WorkUnitOperationalLaneLoader({ laneLabel = "Queue" }: { laneLabel?: string }) {
    return (
        <div
            className="adminv2-ws-dept-v2-operational-row adminv2-ws-dept-v2-operational-row--double"
            aria-label="Lane queue"
            data-adminv2-wu-oper-region-loading="true"
            aria-busy="true"
            aria-live="polite"
        >
            <div className="adminv2-ws-dept-v2-lane adminv2-ws-dept-v2-lane--throughput" data-ws-lane-kind="lane_queue">
                <div className="adminv2-ws-dept-v2-lane-chrome adminv2-ws-dept-v2-lane-chrome--throughput-deck">
                    <section
                        className="adminv2-ws-dept-qsec adminv2-ws-dept-qsec--primary adminv2-ws-dept-throughput-panel rounded-xl border border-alloy-stone/18 bg-white shadow-sm"
                        aria-label={laneLabel}
                    >
                        <header className="adminv2-ws-queue-header border-b border-alloy-stone/12 px-2.5 py-2">
                            <div className="adminv2-ws-queue-title-row">
                                <h3 className="adminv2-ws-queue-title text-alloy-forge/90">{laneLabel}</h3>
                            </div>
                        </header>
                        <div className="px-2 py-2" data-adminv2-wu-oper-lane-row-skeletons="true">
                            <p className="mb-2 text-[11px] font-medium text-alloy-forge/75" role="status">
                                Loading work unit…
                            </p>
                            <WorkUnitQueueLaneRowSkeletonList
                                count={ADMINV2_WORK_UNIT_QUEUE_ROW_SKELETON_COUNT}
                                ariaLabel="Loading queue rows"
                            />
                        </div>
                    </section>
                </div>
            </div>
            <div
                className="adminv2-ws-dept-v2-lane adminv2-ws-dept-v2-lane--attention adminv2-ws-dept-v2-lane--attention--hidden"
                aria-hidden
            />
        </div>
    );
}
