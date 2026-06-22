"use client";

/**
 * Person/child drawer overview tab — layout runtime hard cutover body.
 */

import { useCallback, useEffect, useMemo } from "react";
import DrawerLayoutRuntimeOverviewBody from "@/components/admin/vmDrawer/DrawerLayoutRuntimeOverviewBody";
import PersonDrawerLegacyOperatingOverview from "@/components/admin/vmDrawer/PersonDrawerLegacyOperatingOverview";
import type { AdornmentActionHandler } from "@/components/layout/LayoutRuntimePlanView";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import type { AdminDrawerEntityType } from "@/contexts/AdminDrawerContext";
import type { ChildDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/child/types";
import type { PersonDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/person/types";
import type { PersonDrawerVmChrome } from "@/lib/admin/person/resolvePersonDrawerVmOverviewSections";
import type { ResolvedPersonDrawerLayoutVariant } from "@/lib/admin/person/personDrawerLayoutRuntime";
import {
    isLayoutRuntimeChildDrawerBodyEnabledClient,
    isLayoutRuntimeLegacyEmergencyFallbackEnabledClient,
    isLayoutRuntimePersonDrawerBodyEnabledClient,
} from "@/lib/layout/featureFlag";
import { mergePersonLayoutRuntimeWidgetRecord } from "@/lib/layout/runtime/mergePersonLayoutRuntimeWidgetRecord";
import { mergeChildLayoutRuntimeWidgetRecord } from "@/lib/layout/runtime/mergeChildLayoutRuntimeWidgetRecord";
import { logChildLinkStep, logPersonLinkStep } from "@/lib/layout/runtime/childLinkBrowserTrace";
import { reportLayoutRuntimeLinkRenderedDebug } from "@/lib/layout/runtime/reportLayoutRuntimeLinkDispatchDebug";
import { handlePersonDrawerLayoutRuntimeAdornmentOpenDrawer } from "@/lib/layout/runtime/resolveLayoutAdornmentOpenDrawer";
import type { UseDrawerLayoutRuntimeBodyResult } from "@/lib/layout/runtime/useDrawerLayoutRuntimeBody";
import { useDrawerLayoutRuntimeBody } from "@/lib/layout/runtime/useDrawerLayoutRuntimeBody";

type Props = {
    displayVm: PersonDrawerViewModel | ChildDrawerViewModel;
    chrome: PersonDrawerVmChrome;
    layoutVariant: ResolvedPersonDrawerLayoutVariant;
    isChildSurface: boolean;
    personId: string;
    canMutate: boolean;
    vmReady: boolean;
    layoutBody?: UseDrawerLayoutRuntimeBodyResult;
    layoutDocOverride?: import("@/lib/layout/layoutV2").LayoutDoc | null;
    onOpenDrawer: (type: AdminDrawerEntityType, id: string) => void;
    onOpenLinkedPerson: (personId: string) => void;
};

export default function PersonDrawerOverviewBody({
    displayVm,
    chrome,
    layoutVariant,
    isChildSurface,
    personId,
    canMutate,
    vmReady,
    layoutBody: layoutBodyProp,
    layoutDocOverride,
    onOpenDrawer,
    onOpenLinkedPerson,
}: Props) {
    const { openDrawer, drawer } = useAdminDrawer();
    const record = displayVm.record;
    const legacyEmergency = isLayoutRuntimeLegacyEmergencyFallbackEnabledClient();

    const personLayoutBodyInternal = useDrawerLayoutRuntimeBody({
        cutoverEnabled: isLayoutRuntimePersonDrawerBodyEnabledClient() && !isChildSurface,
        entityId: layoutBodyProp ? null : personId,
        vmReady: layoutBodyProp ? false : vmReady,
        apiPath: "/api/admin/layout-runtime/person-drawer-body",
        logTag: "person_drawer",
    });

    const childLayoutBodyInternal = useDrawerLayoutRuntimeBody({
        cutoverEnabled: isLayoutRuntimeChildDrawerBodyEnabledClient() && isChildSurface,
        entityId: layoutBodyProp ? null : personId,
        vmReady: layoutBodyProp ? false : vmReady,
        apiPath: "/api/admin/layout-runtime/child-drawer-body",
        logTag: "child_drawer",
    });

    const layoutBody =
        layoutBodyProp ??
        (isChildSurface ? childLayoutBodyInternal : personLayoutBodyInternal);

    const vmWidgetRecord = useMemo(() => {
        if (!record) return null;
        return record as Record<string, unknown>;
    }, [record]);

    const mergedLayoutBody = useMemo(() => {
        if (!layoutBody.record) return layoutBody;
        const mergedRecord =
            isChildSurface ?
                mergeChildLayoutRuntimeWidgetRecord(layoutBody.record, vmWidgetRecord)
            :   mergePersonLayoutRuntimeWidgetRecord(layoutBody.record, vmWidgetRecord);
        if (mergedRecord === layoutBody.record) return layoutBody;
        return { ...layoutBody, record: mergedRecord };
    }, [layoutBody, vmWidgetRecord, isChildSurface]);

    useEffect(() => {
        if (!mergedLayoutBody.record || mergedLayoutBody.phase !== "ready") return;
        if (isChildSurface) {
            logChildLinkStep("rendered", {
                surface: "queue",
                resolvedTargetId: personId,
                openMethod: "PersonDrawerOverviewBody",
                success: true,
            });
            reportLayoutRuntimeLinkRenderedDebug("child", personId);
            logChildLinkStep("vm-request-result", {
                surface: "queue",
                resolvedTargetId: personId,
                success: true,
                urlOrApi: "/api/admin/layout-runtime/child-drawer-body",
            });
        } else {
            logPersonLinkStep("rendered", {
                surface: "queue",
                resolvedTargetId: personId,
                openMethod: "PersonDrawerOverviewBody",
                success: true,
            });
            reportLayoutRuntimeLinkRenderedDebug("person", personId);
        }
    }, [isChildSurface, mergedLayoutBody.phase, mergedLayoutBody.record, personId]);

    const onAdornmentAction = useCallback<AdornmentActionHandler>(
        (item, adornment, rowRecord) => {
            if (!mergedLayoutBody.record) return;
            handlePersonDrawerLayoutRuntimeAdornmentOpenDrawer({
                item,
                adornment,
                record: mergedLayoutBody.record,
                rowRecord,
                personRecord: record,
                openDrawer,
                opportunityId: drawer.personDrawerOpenSeed?.opportunity_id ?? null,
                opportunityWorkspaceContext: drawer.opportunityWorkspaceContext ?? null,
                isChildSurface,
            });
        },
        [
            mergedLayoutBody.record,
            record,
            openDrawer,
            drawer.personDrawerOpenSeed?.opportunity_id,
            drawer.opportunityWorkspaceContext,
            isChildSurface,
        ],
    );

    const vmFallback = useMemo(() => {
        if (!legacyEmergency) return null;
        return (
            <PersonDrawerLegacyOperatingOverview
                displayVm={displayVm}
                chrome={chrome}
                layoutVariant={layoutVariant}
                isChildSurface={isChildSurface}
                personId={personId}
                canMutate={canMutate}
                onOpenDrawer={onOpenDrawer}
                onOpenLinkedPerson={onOpenLinkedPerson}
            />
        );
    }, [
        legacyEmergency,
        displayVm,
        chrome,
        layoutVariant,
        isChildSurface,
        personId,
        canMutate,
        onOpenDrawer,
        onOpenLinkedPerson,
    ]);

    return (
        <div data-drawer-vm-runtime-overview="true" data-person-drawer-layout-runtime-overview="true">
            <DrawerLayoutRuntimeOverviewBody
                layoutBody={mergedLayoutBody}
                vmFallback={vmFallback}
                entityId={personId}
                surface={isChildSurface ? "child_drawer_overview" : "person_drawer_overview"}
                canMutate={canMutate}
                onAdornmentAction={onAdornmentAction}
                layoutDocOverride={layoutDocOverride}
            />
        </div>
    );
}
