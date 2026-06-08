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

import { useMemo } from "react";
import DrawerLayoutRuntimeOverviewBody from "@/components/admin/vmDrawer/DrawerLayoutRuntimeOverviewBody";
import OpportunityDrawerInquiryWorkflowOverview from "@/components/admin/vmDrawer/OpportunityDrawerInquiryWorkflowOverview";
import OpportunityDrawerLayoutRuntimeBodyStatus from "@/components/admin/vmDrawer/OpportunityDrawerLayoutRuntimeBodyStatus";
import OpportunityDrawerLayoutRuntimeShadowDiagnostics from "@/components/admin/vmDrawer/OpportunityDrawerLayoutRuntimeShadowDiagnostics";
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";
import type { DrawerTabKey } from "@/lib/entityPresentation";
import {
    isLayoutRuntimeHardCutoverActiveClient,
    isLayoutRuntimeOpportunityDrawerBodyEnabledClient,
} from "@/lib/layout/featureFlag";
import type { UseOpportunityDrawerLayoutRuntimeShadowResult } from "@/lib/layout/runtime/shadow/useOpportunityDrawerLayoutRuntimeShadow";
import { useDrawerLayoutRuntimeBody } from "@/lib/layout/runtime/useDrawerLayoutRuntimeBody";

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

    // Memoized so the hook's fetch effect doesn't re-run (and cancel the in-flight
    // request) on every parent re-render — prevents the repeated-fetch loop.
    const layoutQueryParams = useMemo(
        () => ({ departmentId, workUnitId }),
        [departmentId, workUnitId],
    );
    const layoutBody = useDrawerLayoutRuntimeBody({
        cutoverEnabled: isLayoutRuntimeOpportunityDrawerBodyEnabledClient(),
        entityId: drawerId,
        vmReady,
        apiPath: "/api/admin/layout-runtime/opportunity-drawer-body",
        queryParams: layoutQueryParams,
        logTag: "opportunity_drawer",
    });

    const vmFallback = (
        <VmOverviewBody
            displayVm={displayVm}
            drawerId={drawerId}
            opportunitySingular={opportunitySingular}
            onSelectTab={onSelectTab}
        />
    );

    const showDebugPanel =
        layoutBody.cutoverEnabled &&
        !isLayoutRuntimeHardCutoverActiveClient() &&
        process.env.NEXT_PUBLIC_LAYOUT_RUNTIME_STAGING_DEBUG === "1";

    return (
        <div className="space-y-4" data-adminv2-opportunity-drawer-body="true">
            <DrawerLayoutRuntimeOverviewBody
                layoutBody={layoutBody}
                vmFallback={vmFallback}
                entityId={drawerId}
                surface="opportunity_drawer_overview"
            />
            {showDebugPanel ?
                <OpportunityDrawerLayoutRuntimeBodyStatus
                    phase={layoutBody.phase}
                    layoutSource={layoutBody.layoutSource}
                    layoutKey={layoutBody.layoutKey}
                    lastError={layoutBody.lastError}
                    opportunityId={drawerId}
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
