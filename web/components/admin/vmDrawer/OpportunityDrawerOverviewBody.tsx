"use client";

/**
 * C1b — opportunity drawer overview tab body with layout runtime hard cutover.
 */

import { useMemo, useCallback } from "react";
import DrawerLayoutRuntimeOverviewBody from "@/components/admin/vmDrawer/DrawerLayoutRuntimeOverviewBody";
import OpportunityDrawerInquiryWorkflowOverview from "@/components/admin/vmDrawer/OpportunityDrawerInquiryWorkflowOverview";
import OpportunityDrawerLayoutRuntimeBodyStatus from "@/components/admin/vmDrawer/OpportunityDrawerLayoutRuntimeBodyStatus";
import OpportunityDrawerLayoutRuntimeShadowDiagnostics from "@/components/admin/vmDrawer/OpportunityDrawerLayoutRuntimeShadowDiagnostics";
import type { AdornmentActionHandler } from "@/components/layout/LayoutRuntimePlanView";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";
import type { DrawerTabKey } from "@/lib/entityPresentation";
import {
    isLayoutRuntimeHardCutoverActiveClient,
    isLayoutRuntimeOpportunityDrawerBodyEnabledClient,
} from "@/lib/layout/featureFlag";
import { mergeOpportunityLayoutRuntimeWidgetRecord } from "@/lib/layout/runtime/mergeOpportunityLayoutRuntimeWidgetRecord";
import { handleLayoutRuntimeAdornmentOpenDrawer } from "@/lib/layout/runtime/resolveLayoutAdornmentOpenDrawer";
import type { UseOpportunityDrawerLayoutRuntimeShadowResult } from "@/lib/layout/runtime/shadow/useOpportunityDrawerLayoutRuntimeShadow";
import type { UseDrawerLayoutRuntimeBodyResult } from "@/lib/layout/runtime/useDrawerLayoutRuntimeBody";
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
    layoutBody?: UseDrawerLayoutRuntimeBodyResult;
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
        layoutBody: layoutBodyProp,
    } = props;

    const { openDrawer } = useAdminDrawer();
    const vmRecord = displayVm.above_fold.record ?? null;

    const vmWidgetRecord = useMemo(() => {
        if (!vmRecord) return null;
        const merged: Record<string, unknown> = { ...vmRecord };
        if (displayVm.summaries?.tasks && merged._inquiry_summary_tasks == null) {
            merged._inquiry_summary_tasks = displayVm.summaries.tasks;
        }
        return merged;
    }, [vmRecord, displayVm.summaries?.tasks]);

    const layoutQueryParams = useMemo(
        () => ({ departmentId, workUnitId }),
        [departmentId, workUnitId],
    );
    const layoutBodyInternal = useDrawerLayoutRuntimeBody({
        cutoverEnabled: isLayoutRuntimeOpportunityDrawerBodyEnabledClient(),
        entityId: layoutBodyProp ? null : drawerId,
        vmReady: layoutBodyProp ? false : vmReady,
        apiPath: "/api/admin/layout-runtime/opportunity-drawer-body",
        queryParams: layoutQueryParams,
        logTag: "opportunity_drawer",
    });
    const layoutBody = layoutBodyProp ?? layoutBodyInternal;

    const mergedLayoutBody = useMemo(() => {
        if (!layoutBody.record) return layoutBody;
        const mergedRecord = mergeOpportunityLayoutRuntimeWidgetRecord(layoutBody.record, vmWidgetRecord);
        if (mergedRecord === layoutBody.record) return layoutBody;
        return { ...layoutBody, record: mergedRecord };
    }, [layoutBody, vmWidgetRecord]);

    const onAdornmentAction = useCallback<AdornmentActionHandler>(
        (item, adornment, rowRecord) => {
            if (!mergedLayoutBody.record) return;
            handleLayoutRuntimeAdornmentOpenDrawer({
                item,
                adornment,
                record: mergedLayoutBody.record,
                rowRecord,
                opportunityId: drawerId,
                opportunityRecord: vmRecord,
                openDrawer,
                opportunityWorkspaceContext:
                    displayVm.workspace.department_id && displayVm.workspace.work_unit_id ?
                        {
                            department_id: displayVm.workspace.department_id,
                            work_unit_id: displayVm.workspace.work_unit_id,
                        }
                    :   null,
            });
        },
        [mergedLayoutBody.record, drawerId, vmRecord, openDrawer, displayVm.workspace.department_id, displayVm.workspace.work_unit_id],
    );

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
                layoutBody={mergedLayoutBody}
                vmFallback={vmFallback}
                entityId={drawerId}
                surface="opportunity_drawer_overview"
                onAdornmentAction={onAdornmentAction}
            />
            {showDebugPanel ?
                <OpportunityDrawerLayoutRuntimeBodyStatus
                    phase={mergedLayoutBody.phase}
                    layoutSource={mergedLayoutBody.layoutSource}
                    layoutKey={mergedLayoutBody.layoutKey}
                    lastError={mergedLayoutBody.lastError}
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
