"use client";

import type { KPIVm } from "@/lib/ui-v2/workspace-types";
import { computeWorkspaceHealthSummary } from "@/lib/metrics/workspaceHealthSummary";
import type { ResolvedMetricMap } from "@/lib/metrics/fetchResolvedMetrics";
import { WorkspaceHealthPulseSection } from "@/components/admin/workspace/layout/WorkspaceHealthPulseSection";

type Props = {
    orgName: string;
    kpis: KPIVm[];
    oipResolved?: ResolvedMetricMap;
    loading?: boolean;
};

/** Workspace root Section A — health + operational pulse command tiles. */
export default function WorkspaceCommandHeader({ orgName, kpis, oipResolved = {}, loading = false }: Props) {
    const health = computeWorkspaceHealthSummary(oipResolved);

    return (
        <div data-workspace-command-header="true">
            <WorkspaceHealthPulseSection
                health={health}
                kpis={kpis}
                oipResolved={oipResolved}
                loading={loading}
                contextLabel={orgName}
            />
        </div>
    );
}
