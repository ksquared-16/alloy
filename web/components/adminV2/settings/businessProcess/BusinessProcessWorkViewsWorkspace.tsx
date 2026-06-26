"use client";

import BusinessProcessWorkViewsListColumn from "@/components/adminV2/settings/businessProcess/BusinessProcessWorkViewsListColumn";
import BusinessProcessWorkViewsSetupWorkspace from "@/components/adminV2/settings/businessProcess/BusinessProcessWorkViewsSetupWorkspace";
import { WorkViewsConfigurationProvider } from "@/components/adminV2/settings/businessProcess/WorkViewsConfigurationContext";
import type { WorkViewCompatQueueLane } from "@/lib/lifecycle/workViewsRuntimeConvergence";

/** Legacy wrapper — configuration shell uses list/setup components directly. */
export default function BusinessProcessWorkViewsWorkspace({
    departmentId,
    processId,
    workUnitId,
    queueLanes = [],
}: {
    departmentId: string;
    processId: string;
    workUnitId: string | null;
    queueLanes?: WorkViewCompatQueueLane[];
}) {
    return (
        <WorkViewsConfigurationProvider
            departmentId={departmentId}
            processId={processId}
            queueLanes={queueLanes}
            enabled
        >
            <div className="grid min-h-[24rem] gap-0 xl:grid-cols-[17.5rem_minmax(0,1fr)]" data-testid="business-process-work-views-workspace">
                <div className="border-r border-alloy-forge/10 bg-alloy-stone/[0.03] p-3">
                    <BusinessProcessWorkViewsListColumn />
                </div>
                <div className="p-3">
                    <BusinessProcessWorkViewsSetupWorkspace
                        departmentId={departmentId}
                        workUnitId={workUnitId}
                        queueLanes={queueLanes}
                    />
                </div>
            </div>
        </WorkViewsConfigurationProvider>
    );
}
