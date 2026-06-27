"use client";

import type { KPIVm } from "@/lib/ui-v2/workspace-types";
import type { ResolvedMetricMap } from "@/lib/metrics/fetchResolvedMetrics";
import type { WorkspaceHealthSummary } from "@/lib/metrics/workspaceHealthSummary";
import { OipHealthStrip } from "@/components/admin/workspace/OipHealthStrip";
import { WorkspaceOperationalPulseStrip } from "@/components/admin/workspace/layout/WorkspaceOperationalPulseStrip";
import { WS_LAYOUT, WS_LAYOUT_ATTR, WS_ORG_PULSE_BAND_CLASS } from "@/lib/workspace/workspaceLayoutSystem";
import { alloySectionDomAttrs } from "@/lib/perf/alloySectionMap";

type Props = {
    health: WorkspaceHealthSummary;
    kpis: KPIVm[];
    oipResolved?: ResolvedMetricMap;
    loading?: boolean;
    contextLabel?: string | null;
};

/** Workspace root command header — compact organization + operational pulse bands. */
export function WorkspaceHealthPulseSection({
    health,
    kpis,
    oipResolved,
    loading = false,
    contextLabel = null,
}: Props) {
    const orgName = contextLabel?.trim() ?? "";

    return (
        <section
            className={`${WS_ORG_PULSE_BAND_CLASS} space-y-2`}
            data-ws-layout={WS_LAYOUT_ATTR.workspaceSectionA}
            data-ws-command-banner="true"
            data-workspace-health-pulse="true"
            data-workspace-org-pulse-band="true"
            {...alloySectionDomAttrs("WS-02")}
        >
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                {orgName ?
                    <div className="min-w-0">
                        <h1 className={WS_LAYOUT.workspaceTitle} data-workspace-org-title="true">
                            {orgName}
                        </h1>
                        <p
                            className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.1em] text-alloy-midnight/45"
                            data-workspace-command-center-label="true"
                        >
                            Command Center
                        </p>
                    </div>
                :   null}

                <div
                    className="min-w-0"
                    data-workspace-zone="health-snapshot"
                    {...alloySectionDomAttrs("WS-03")}
                >
                    <h2 id="workspace-org-pulse-heading" className="sr-only">
                        Organization Pulse
                    </h2>
                    <div aria-labelledby="workspace-org-pulse-heading">
                        <OipHealthStrip health={health} compact />
                    </div>
                </div>
            </div>

            <div
                className="border-t border-alloy-midnight/[0.06] pt-2"
                data-workspace-zone="operational-pulse"
                {...alloySectionDomAttrs("WS-04")}
            >
                <h3 id="workspace-operational-pulse-heading" className="sr-only">
                    Operational Pulse
                </h3>
                <p
                    className={`${WS_LAYOUT.sectionKicker} mb-1.5`}
                    aria-hidden="true"
                >
                    Operational Pulse
                </p>
                <div aria-labelledby="workspace-operational-pulse-heading">
                    <WorkspaceOperationalPulseStrip
                        kpis={kpis}
                        oipResolved={oipResolved}
                        loading={loading}
                    />
                </div>
            </div>
        </section>
    );
}
