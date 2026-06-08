"use client";

/**
 * C1b — opportunity drawer overview tab body with layout runtime cutover + VM fallback.
 *
 * ## Read-only display parity (pilot scope)
 *
 * - Overview **display** may render from resolved layout docs when flags are on.
 * - Layout runtime body is **read-only** — no inline field editing or save paths.
 * - VM / legacy overview retains any editable sections until a later cutover sprint.
 * - Drawer shell save orchestration (header actions, status mutation, registry modals)
 *   remains VM-owned and is intentionally outside this component.
 *
 * ## Fallback chain
 *
 * 1. Flags off → VM overview only.
 * 2. Flags on + loading → coordinated hold (no VM flash).
 * 3. Fetch/resolve/evaluate failure → VM overview.
 * 4. Render-phase error (Error Boundary) → VM overview.
 */

import type { ReactNode } from "react";
import OpportunityDrawerInquiryWorkflowOverview from "@/components/admin/vmDrawer/OpportunityDrawerInquiryWorkflowOverview";
import OpportunityDrawerLayoutRuntimeBodyErrorBoundary from "@/components/admin/vmDrawer/OpportunityDrawerLayoutRuntimeBodyErrorBoundary";
import OpportunityDrawerLayoutRuntimeBodyStatus from "@/components/admin/vmDrawer/OpportunityDrawerLayoutRuntimeBodyStatus";
import OpportunityDrawerLayoutRuntimeOverviewHold from "@/components/admin/vmDrawer/OpportunityDrawerLayoutRuntimeOverviewHold";
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

function VmOverviewBody({
    displayVm,
    drawerId,
    opportunitySingular,
    onSelectTab,
}: Pick<Props, "displayVm" | "drawerId" | "opportunitySingular" | "onSelectTab">) {
    return (
        <div data-drawer-vm-runtime-overview="true">
            <OpportunityDrawerInquiryWorkflowOverview
                displayVm={displayVm}
                drawerId={drawerId}
                opportunitySingular={opportunitySingular}
                onSelectTab={onSelectTab}
            />
        </div>
    );
}

export default function OpportunityDrawerOverviewBody(props: Props) {
    const {
        displayVm,
        drawerId,
        opportunitySingular,
        onSelectTab,
        vmReady,
        departmentId,
        workUnitId,
        layoutRuntimeShadow,
    } = props;

    const layoutBody = useOpportunityDrawerLayoutRuntimeBody({
        opportunityId: drawerId,
        vmReady,
        departmentId,
        workUnitId,
    });

    const vmFallback = (
        <VmOverviewBody
            displayVm={displayVm}
            drawerId={drawerId}
            opportunitySingular={opportunitySingular}
            onSelectTab={onSelectTab}
        />
    );

    let overviewBody: ReactNode;
    if (layoutBody.bodyReady && layoutBody.doc && layoutBody.record) {
        overviewBody = (
            <OpportunityDrawerLayoutRuntimeBodyErrorBoundary
                fallback={vmFallback}
                logContext={{
                    opportunityId: drawerId,
                    layoutSource: layoutBody.layoutSource,
                    surface: "opportunity_drawer_overview",
                }}
            >
                <div
                    className="space-y-4"
                    data-drawer-layout-runtime-overview="true"
                    data-layout-runtime-source={layoutBody.layoutSource ?? ""}
                    data-layout-runtime-readonly="true"
                >
                    <LayoutRuntimeDrawerBodyView doc={layoutBody.doc} record={layoutBody.record} />
                </div>
            </OpportunityDrawerLayoutRuntimeBodyErrorBoundary>
        );
    } else if (layoutBody.showHold) {
        overviewBody = <OpportunityDrawerLayoutRuntimeOverviewHold />;
    } else {
        overviewBody = vmFallback;
    }

    return (
        <div className="space-y-4" data-adminv2-opportunity-drawer-body="true">
            {overviewBody}
            {layoutBody.cutoverEnabled ?
                <OpportunityDrawerLayoutRuntimeBodyStatus
                    phase={layoutBody.phase}
                    layoutSource={layoutBody.layoutSource}
                    layoutKey={layoutBody.layoutKey}
                    lastError={layoutBody.lastError}
                    opportunityId={drawerId}
                />
            :   null}
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
