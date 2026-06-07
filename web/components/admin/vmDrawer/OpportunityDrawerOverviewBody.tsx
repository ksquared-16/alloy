"use client";

/**
 * C1b — opportunity drawer overview tab body with layout runtime cutover + VM fallback.
 */

import OpportunityDrawerInquiryWorkflowOverview from "@/components/admin/vmDrawer/OpportunityDrawerInquiryWorkflowOverview";
import OpportunityDrawerLayoutRuntimeShadowDiagnostics from "@/components/admin/vmDrawer/OpportunityDrawerLayoutRuntimeShadowDiagnostics";
import LayoutRuntimeDrawerBodyView from "@/components/layout/LayoutRuntimeDrawerBodyView";
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";
import type { DrawerTabKey } from "@/lib/entityPresentation";
import type { UseOpportunityDrawerLayoutRuntimeShadowResult } from "@/lib/layout/runtime/shadow/useOpportunityDrawerLayoutRuntimeShadow";
import { useOpportunityDrawerLayoutRuntimeBody } from "@/lib/layout/runtime/useOpportunityDrawerLayoutRuntimeBody";

type Props = {
    displayVm: OpportunityDrawerViewModel;
    drawerId: string;
    opportunitySingular: string;
    onSelectTab: (tab: DrawerTabKey) => void;
    vmReady: boolean;
    departmentId?: string | null;
    workUnitId?: string | null;
    layoutRuntimeShadow: UseOpportunityDrawerLayoutRuntimeShadowResult;
};

export default function OpportunityDrawerOverviewBody({
    displayVm,
    drawerId,
    opportunitySingular,
    onSelectTab,
    vmReady,
    departmentId,
    workUnitId,
    layoutRuntimeShadow,
}: Props) {
    const layoutBody = useOpportunityDrawerLayoutRuntimeBody({
        opportunityId: drawerId,
        vmReady,
        departmentId,
        workUnitId,
    });

    return (
        <div className="space-y-4" data-adminv2-opportunity-drawer-body="true">
            {layoutBody.bodyReady && layoutBody.doc && layoutBody.record ?
                <div
                    className="space-y-4"
                    data-drawer-layout-runtime-overview="true"
                    data-layout-runtime-source={layoutBody.layoutSource ?? ""}
                >
                    <LayoutRuntimeDrawerBodyView doc={layoutBody.doc} record={layoutBody.record} />
                </div>
            :   <div data-drawer-vm-runtime-overview="true">
                    <OpportunityDrawerInquiryWorkflowOverview
                        displayVm={displayVm}
                        drawerId={drawerId}
                        opportunitySingular={opportunitySingular}
                        onSelectTab={onSelectTab}
                    />
                </div>
            }
            {layoutRuntimeShadow.shadowEnabled && layoutBody.useVmFallback ?
                <div
                    aria-hidden="true"
                    hidden
                    data-layout-runtime-shadow-mount="opportunity"
                    data-shadow-parity-score={layoutRuntimeShadow.telemetry?.parityScore ?? ""}
                    data-shadow-readiness={layoutRuntimeShadow.telemetry?.readinessLevel ?? ""}
                />
            :   null}
            {layoutRuntimeShadow.diagnosticsEnabled ?
                <OpportunityDrawerLayoutRuntimeShadowDiagnostics
                    telemetry={layoutRuntimeShadow.telemetry}
                    evaluating={layoutRuntimeShadow.evaluating}
                    lastError={layoutRuntimeShadow.lastError}
                />
            :   null}
        </div>
    );
}
