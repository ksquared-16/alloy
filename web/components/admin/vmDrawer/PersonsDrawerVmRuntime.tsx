"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DrawerTabKey } from "@/lib/entityPresentation";
import OpportunityDrawerBodySaveBar from "@/components/admin/vmDrawer/OpportunityDrawerBodySaveBar";
import OpportunityDrawerOpeningOverlay from "@/components/admin/OpportunityDrawerOpeningOverlay";
import PersonDrawerOverviewBody from "@/components/admin/vmDrawer/PersonDrawerOverviewBody";
import PersonDrawerProofLayoutHeader from "@/components/admin/vmDrawer/PersonDrawerProofLayoutHeader";
import PersonDrawerVmTabPanes from "@/components/admin/vmDrawer/PersonDrawerVmTabPanes";
import DrawerLayoutRuntimeShellZoneView from "@/components/admin/vmDrawer/DrawerLayoutRuntimeShellZoneView";
import EntityDrawerOperatingShell from "@/components/admin/drawer/EntityDrawerOperatingShell";
import PersonDrawerChildLifecycleRail from "@/components/admin/entity/PersonDrawerChildLifecycleRail";
import PersonDrawerParentLifecycleRail from "@/components/admin/entity/PersonDrawerParentLifecycleRail";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import type { AdminDrawerEntityType } from "@/contexts/AdminDrawerContext";
import { personDisplayName } from "@/lib/adminFormatters";
import { resolvePersonDrawerOperatingBackLink } from "@/lib/admin/person/personDrawerBackLink";
import { findBackToLeadOpportunityInStack } from "@/lib/adminV2/viewModel/drawer/vmRuntime/resolveBackToLeadOpportunity";
import { PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS, resolvePersonDrawerProfileFromRecordWithHint } from "@/lib/admin/person/personDrawerChildChrome";
import { PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS } from "@/lib/admin/person/personDrawerParentChrome";
import { resolvePersonDrawerStatusProfile } from "@/lib/admin/person/personStatusApplicability";
import type { PersonDrawerVmChrome } from "@/lib/admin/person/resolvePersonDrawerVmOverviewSections";
import {
    layoutVariantFromChildVm,
    layoutVariantFromPersonVm,
} from "@/lib/adminV2/viewModel/drawer/vmRuntime/personDrawerVmLayout";
import { usePersonsDrawerVmPayload } from "@/lib/adminV2/viewModel/drawer/vmRuntime/usePersonsDrawerVmPayload";
import { peekPersonsDrawerDisplayVm } from "@/lib/adminV2/viewModel/drawer/vmRuntime/vmDrawerPayloadPeekSeed";
import {
    isDrawerSummaryStripBoundaryEnabledClient,
    isLayoutRuntimeChildDrawerBodyEnabledClient,
    isLayoutRuntimeHardCutoverActiveClient,
    isLayoutRuntimeLegacyEmergencyFallbackEnabledClient,
    isLayoutRuntimePersonDrawerBodyEnabledClient,
} from "@/lib/layout/featureFlag";
import type { AdornmentActionHandler } from "@/components/layout/LayoutRuntimePlanView";
import { handlePersonDrawerLayoutRuntimeAdornmentOpenDrawer } from "@/lib/layout/runtime/resolveLayoutAdornmentOpenDrawer";
import { shouldUsePersonOverviewComposition } from "@/lib/layout/runtime/personOverviewComposition";
import { shouldUseChildOverviewComposition } from "@/lib/layout/runtime/childOverviewComposition";
import { splitDrawerLayoutDocShellZones } from "@/lib/layout/runtime/splitDrawerLayoutDocShellZones";
import { mergePersonLayoutRuntimeWidgetRecord } from "@/lib/layout/runtime/mergePersonLayoutRuntimeWidgetRecord";
import { mergeChildLayoutRuntimeWidgetRecord } from "@/lib/layout/runtime/mergeChildLayoutRuntimeWidgetRecord";
import { useDrawerLayoutRuntimeBody } from "@/lib/layout/runtime/useDrawerLayoutRuntimeBody";
import { useBosPersonDrawerContextSeed } from "@/lib/adminV2/bos/useBosDrawerOperationalContextSeed";
import { DrawerCommandRailActionsRegistrar } from "@/app/adminV2/components/workspace/DrawerCommandRailActionsRegistrar";

const PERSON_TAB_LABELS: Partial<Record<DrawerTabKey, string>> = {
    overview: "Overview",
    related: "Activity",
    documents: "Documents",
    communications: "Communications",
};

const OPERATING_TABS: DrawerTabKey[] = ["overview", "related", "documents", "communications"];

function resolvePersonDrawerVmChrome(
    displayVm: { surface: string } | null,
    isChildSurface: boolean,
): PersonDrawerVmChrome {
    if (!displayVm) return "generic";
    if (isChildSurface || displayVm.surface === "child") return "child";
    if (displayVm.surface === "parent") return "parent";
    return "generic";
}

function resolvePersonDrawerProofTitle(
    record: Record<string, unknown>,
    displayVm: { header: { title: string } } | null,
    chrome: PersonDrawerVmChrome,
): string {
    const headerTitle = displayVm?.header.title?.trim();
    if (headerTitle) return headerTitle;
    const name = personDisplayName({
        first_name: record.first_name as string | null | undefined,
        last_name: record.last_name as string | null | undefined,
        full_name: record.full_name as string | null | undefined,
    });
    if (name !== "—") return name;
    if (chrome === "child") return "Child";
    if (chrome === "parent") return "Parent";
    return "Person";
}

export default function PersonsDrawerVmRuntime() {
    const { canMutate } = useAdminAuth();
    const {
        drawer,
        drawerVmRender,
        closeDrawer,
        openDrawer,
        canGoBack,
        previousDrawer,
        stack,
        goBack,
        goBackToLead,
    } = useAdminDrawer();
    const [drawerTab, setDrawerTab] = useState<DrawerTabKey>("overview");
    const layoutCutoverHeader = isLayoutRuntimeHardCutoverActiveClient();
    const { displayVm, isChildSurface, coldLoading, error, suppressFullDrawerLoading, holdPriorPayload } =
        usePersonsDrawerVmPayload();

    const chrome = useMemo(
        () => resolvePersonDrawerVmChrome(displayVm, isChildSurface),
        [displayVm, isChildSurface],
    );

    const record = displayVm?.record ?? null;
    const personId = String(displayVm?.entity.id ?? drawer.id ?? "").trim();

    const personDrawerDisplayName = useMemo(() => {
        if (!record) return displayVm?.header.title ?? null;
        return resolvePersonDrawerProofTitle(record, displayVm, chrome);
    }, [chrome, displayVm, record]);

    useBosPersonDrawerContextSeed({
        drawerId: drawer.type === "persons" ? drawer.id : null,
        displayName: personDrawerDisplayName,
        isChild: isChildSurface || chrome === "child",
    });

    const vmMatchesRender = useMemo(
        () =>
            displayVm != null &&
            String(displayVm.entity.id) === String(drawerVmRender.id) &&
            drawerVmRender.type === "persons",
        [displayVm, drawerVmRender.id, drawerVmRender.type],
    );

    const layoutVariant = useMemo(() => {
        if (!displayVm) return null;
        if (isChildSurface && displayVm.surface === "child") {
            return layoutVariantFromChildVm(displayVm);
        }
        if (!isChildSurface && displayVm.surface !== "child") {
            return layoutVariantFromPersonVm(displayVm);
        }
        return null;
    }, [displayVm, isChildSurface]);

    const committedVisible = useMemo(
        () =>
            vmMatchesRender &&
            drawer.type === "persons" &&
            String(drawer.id) === String(displayVm?.entity.id) &&
            Boolean(displayVm && record && layoutVariant),
        [vmMatchesRender, drawer.type, drawer.id, displayVm, record, layoutVariant],
    );

    const layoutPrefetchId =
        drawerVmRender.type === "persons" && drawerVmRender.id ? String(drawerVmRender.id) : null;

    const pinnedOpportunityId = useMemo(() => {
        const pinned = findBackToLeadOpportunityInStack(stack, drawer);
        return pinned?.id ?? drawer.personDrawerOpenSeed?.opportunity_id ?? null;
    }, [stack, drawer]);

    const personLayoutContextQuery = useMemo(
        () => ({ opportunityId: pinnedOpportunityId }),
        [pinnedOpportunityId],
    );

    const personOverviewLayoutBody = useDrawerLayoutRuntimeBody({
        cutoverEnabled: isLayoutRuntimePersonDrawerBodyEnabledClient() && !isChildSurface,
        entityId: layoutPrefetchId && !isChildSurface ? layoutPrefetchId : null,
        vmReady: Boolean(displayVm?.structureSettled && layoutPrefetchId && !isChildSurface),
        apiPath: "/api/admin/layout-runtime/person-drawer-body",
        logTag: "person_drawer",
        queryParams: personLayoutContextQuery,
    });

    const childOverviewLayoutBody = useDrawerLayoutRuntimeBody({
        cutoverEnabled: isLayoutRuntimeChildDrawerBodyEnabledClient() && isChildSurface,
        entityId: layoutPrefetchId && isChildSurface ? layoutPrefetchId : null,
        vmReady: Boolean(displayVm?.structureSettled && layoutPrefetchId && isChildSurface),
        apiPath: "/api/admin/layout-runtime/child-drawer-body",
        logTag: "child_drawer",
    });

    const activeOverviewLayoutBody = isChildSurface ? childOverviewLayoutBody : personOverviewLayoutBody;

    const overviewWidgetRecord = useMemo(() => {
        if (!record) return null;
        return record as Record<string, unknown>;
    }, [record]);

    const mergedOverviewLayoutRecord = useMemo(() => {
        if (!activeOverviewLayoutBody.record) return null;
        return isChildSurface ?
                mergeChildLayoutRuntimeWidgetRecord(activeOverviewLayoutBody.record, overviewWidgetRecord)
            :   mergePersonLayoutRuntimeWidgetRecord(activeOverviewLayoutBody.record, overviewWidgetRecord);
    }, [activeOverviewLayoutBody.record, overviewWidgetRecord, isChildSurface]);

    const summaryStripBoundaryEnabled = isDrawerSummaryStripBoundaryEnabledClient();

    const personCompositionActive = useMemo(
        () => !isChildSurface && shouldUsePersonOverviewComposition(personOverviewLayoutBody.doc),
        [isChildSurface, personOverviewLayoutBody.doc],
    );

    const childCompositionActive = useMemo(
        () => isChildSurface && shouldUseChildOverviewComposition(childOverviewLayoutBody.doc),
        [isChildSurface, childOverviewLayoutBody.doc],
    );

    const layoutShellZones = useMemo(() => {
        if (!summaryStripBoundaryEnabled || !activeOverviewLayoutBody.doc || !activeOverviewLayoutBody.bodyReady) {
            return null;
        }
        if (isChildSurface && !childCompositionActive) return null;
        if (!isChildSurface && !personCompositionActive) return null;
        return splitDrawerLayoutDocShellZones(
            activeOverviewLayoutBody.doc,
            isChildSurface ? "child" : "person",
        );
    }, [
        isChildSurface,
        summaryStripBoundaryEnabled,
        activeOverviewLayoutBody.doc,
        activeOverviewLayoutBody.bodyReady,
        personCompositionActive,
        childCompositionActive,
    ]);

    const overviewLayoutDocBodyOverride = useMemo(() => {
        if (!layoutShellZones?.summarySectionKeys.length) return undefined;
        return layoutShellZones.bodyDoc;
    }, [layoutShellZones]);

    const layoutAdornmentAction = useCallback<AdornmentActionHandler>(
        (item, adornment, rowRecord) => {
            if (!mergedOverviewLayoutRecord || !personId || !record) return;
            handlePersonDrawerLayoutRuntimeAdornmentOpenDrawer({
                item,
                adornment,
                record: mergedOverviewLayoutRecord,
                rowRecord,
                personRecord: record,
                openDrawer,
                opportunityId: drawer.personDrawerOpenSeed?.opportunity_id ?? null,
                opportunityWorkspaceContext: drawer.opportunityWorkspaceContext ?? null,
                isChildSurface,
            });
        },
        [
            mergedOverviewLayoutRecord,
            personId,
            record,
            openDrawer,
            drawer.personDrawerOpenSeed?.opportunity_id,
            drawer.opportunityWorkspaceContext,
            isChildSurface,
        ],
    );

    const drawerSummaryStrip = useMemo(() => {
        if (!layoutShellZones?.summarySectionKeys.length || !mergedOverviewLayoutRecord || !personId) {
            return null;
        }
        return (
            <DrawerLayoutRuntimeShellZoneView
                zone="summary_strip"
                doc={layoutShellZones.summaryDoc}
                record={mergedOverviewLayoutRecord}
                entityId={personId}
                canMutate={!!canMutate}
                onAdornmentAction={layoutAdornmentAction}
            />
        );
    }, [
        layoutShellZones,
        mergedOverviewLayoutRecord,
        personId,
        canMutate,
        layoutAdornmentAction,
    ]);

    const overviewLayoutShellReady =
        !layoutCutoverHeader ||
        drawerTab !== "overview" ||
        !activeOverviewLayoutBody.cutoverEnabled ||
        activeOverviewLayoutBody.bodyReady ||
        activeOverviewLayoutBody.phase === "fallback";

    const hasWarmPayloadOnOpen = useMemo(
        () =>
            drawer.type === "persons" &&
            drawerVmRender.type === "persons" &&
            String(drawer.id) === String(drawerVmRender.id) &&
            peekPersonsDrawerDisplayVm(drawer) != null,
        [drawer, drawerVmRender.type, drawerVmRender.id],
    );

    const showColdShell =
        coldLoading && !displayVm && !suppressFullDrawerLoading && drawer.type === drawerVmRender.type;

    const drawerOpen =
        Boolean(drawer.type && drawer.id) &&
        drawer.type === "persons" &&
        drawerVmRender.type === "persons" &&
        Boolean(drawerVmRender.id) &&
        (committedVisible || showColdShell || hasWarmPayloadOnOpen) &&
        (!layoutCutoverHeader || drawerTab !== "overview" || overviewLayoutShellReady);

    const showRuntimeOpeningOverlay =
        Boolean(drawer.type === "persons" && drawer.id) &&
        drawerVmRender.type === "persons" &&
        Boolean(drawerVmRender.id) &&
        !drawerOpen &&
        !error &&
        (committedVisible || hasWarmPayloadOnOpen || showColdShell);

    const shellEntity = isChildSurface ? "child" : "person";
    const entityLabel = isChildSurface ? "Child" : chrome === "parent" ? "Parent" : "Person";

    useEffect(() => {
        setDrawerTab("overview");
    }, [drawer.id, chrome]);

    const backLink = useMemo(
        () =>
            resolvePersonDrawerOperatingBackLink(canGoBack, previousDrawer, drawer.openSource, {
                stack,
                drawer,
            }),
        [canGoBack, previousDrawer, drawer, stack],
    );

    const handleBackLink = useCallback(() => {
        if (backLink?.mode === "back_to_lead") {
            goBackToLead();
            return;
        }
        goBack();
    }, [backLink?.mode, goBack, goBackToLead]);

    const onOpenLinkedPerson = useCallback(
        (linkedPersonId: string) => {
            const pinOppId = drawer.personDrawerOpenSeed?.opportunity_id?.trim() || undefined;
            openDrawer({
                type: "persons",
                id: linkedPersonId,
                source: "person_household_link",
                opportunityWorkspaceContext: drawer.opportunityWorkspaceContext ?? undefined,
                personDrawerOpenSeed: {
                    personId: linkedPersonId,
                    opportunity_id: pinOppId,
                },
            });
        },
        [drawer.opportunityWorkspaceContext, drawer.personDrawerOpenSeed?.opportunity_id, openDrawer],
    );

    const onOpenDrawer = useCallback(
        (type: AdminDrawerEntityType, id: string) => {
            openDrawer({
                type,
                id,
                opportunityWorkspaceContext: drawer.opportunityWorkspaceContext ?? undefined,
            });
        },
        [drawer.opportunityWorkspaceContext, openDrawer],
    );

    const onTabSelect = useCallback((tab: DrawerTabKey) => setDrawerTab(tab), []);

    const tabs = useMemo((): DrawerTabKey[] => {
        if (isChildSurface) return OPERATING_TABS;
        if (personCompositionActive || chrome === "parent") return OPERATING_TABS;
        return ["overview"];
    }, [chrome, isChildSurface, personCompositionActive]);

    const lifecycleRail = useMemo(() => {
        if (personCompositionActive || childCompositionActive) return null;
        if (!isLayoutRuntimeLegacyEmergencyFallbackEnabledClient()) return null;
        if (!record || chrome === "generic") return null;
        const childChromeHint = { presentation_emphasis: PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS };
        const parentChromeHint = { presentation_emphasis: PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS };
        if (isChildSurface) {
            return (
                <PersonDrawerChildLifecycleRail
                    record={record}
                    chromeHint={childChromeHint}
                    onSelectTab={onTabSelect}
                />
            );
        }
        if (chrome === "parent") {
            return (
                <PersonDrawerParentLifecycleRail
                    record={record}
                    chromeHint={parentChromeHint}
                    onSelectTab={onTabSelect}
                />
            );
        }
        return null;
    }, [record, chrome, isChildSurface, onTabSelect, personCompositionActive, childCompositionActive]);

    const proofTitle = useMemo(() => {
        if (!record) return entityLabel;
        return resolvePersonDrawerProofTitle(record, displayVm, chrome);
    }, [record, displayVm, chrome, entityLabel]);

    const currentStatusKey = useMemo(
        () => String(record?.status_key ?? "").trim(),
        [record?.status_key]
    );

    const personStatusProfile = useMemo(() => {
        if (!record) return null;
        const profile = resolvePersonDrawerProfileFromRecordWithHint(record, {
            presentation_emphasis:
                isChildSurface ? PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS : undefined,
        });
        return resolvePersonDrawerStatusProfile(profile, { childChrome: isChildSurface });
    }, [record, isChildSurface]);

    const composedProofHeader = useMemo(() => {
        if (!layoutCutoverHeader || !committedVisible || !personId || !record) return undefined;
        return (
            <PersonDrawerProofLayoutHeader
                title={proofTitle}
                personId={personId}
                record={record}
                entityLabel={entityLabel}
                statusLabel={displayVm?.header.status_label ?? null}
                statusControl={displayVm?.header.status ?? null}
                currentStatusKey={currentStatusKey}
                statusProfile={personStatusProfile}
                canMutate={!!canMutate}
                tabs={tabs}
                activeTab={drawerTab}
                onTabSelect={onTabSelect}
                lifecycleRail={lifecycleRail}
                onClose={closeDrawer}
                tabLabels={PERSON_TAB_LABELS}
                backLink={
                    backLink ?
                        { label: backLink.label, onClick: handleBackLink }
                    :   null
                }
                dataAttribute={isChildSurface ? "child-drawer-runtime" : "person-drawer-runtime"}
                personCompositionActive={personCompositionActive}
                childCompositionActive={childCompositionActive}
            />
        );
    }, [
        layoutCutoverHeader,
        committedVisible,
        personId,
        record,
        proofTitle,
        entityLabel,
        displayVm?.header.status_label,
        displayVm?.header.status,
        currentStatusKey,
        personStatusProfile,
        canMutate,
        tabs,
        drawerTab,
        onTabSelect,
        lifecycleRail,
        closeDrawer,
        backLink,
        handleBackLink,
        isChildSurface,
        personCompositionActive,
        childCompositionActive,
    ]);

    const drawerCommandRailRegistration = useMemo(() => {
        if (!drawerOpen || !committedVisible) return null;
        return {
            actions: [],
            actionCount: 0,
            canMutate: !!canMutate,
            onActionSelect: () => undefined,
            disabledReason: "Person drawer actions are not configured yet.",
        };
    }, [canMutate, committedVisible, drawerOpen]);

    return (
        <>
            {showRuntimeOpeningOverlay ?
                <OpportunityDrawerOpeningOverlay
                    onCancel={closeDrawer}
                    recordLabel={entityLabel}
                />
            :   null}
            <EntityDrawerOperatingShell
                entity={shellEntity}
                isOpen={drawerOpen}
                onClose={closeDrawer}
                title={proofTitle}
                composedStickyHeader={composedProofHeader}
                panelFooterChrome={
                    layoutCutoverHeader && committedVisible ?
                        <OpportunityDrawerBodySaveBar canMutate={!!canMutate} />
                    :   undefined
                }
                panelClassName="max-w-5xl"
                runtimeDataAttribute={isChildSurface ? "child-vm" : "person-vm"}
                holdPriorPayload={holdPriorPayload}
                summaryStrip={
                    drawerTab === "overview" && committedVisible ? drawerSummaryStrip : null
                }
            >
                <div data-person-drawer-vm-chrome={chrome}>
                    {error ?
                        <p className="text-sm text-alloy-ember">{error}</p>
                    :   null}
                    {showColdShell ?
                        <div className="adminv2-drawer-vm-cold-loading" data-drawer-vm-runtime-cold-loading="true">
                            <p className="text-sm font-medium text-alloy-midnight/75">
                                Loading {entityLabel.toLowerCase()}…
                            </p>
                        </div>
                    :   committedVisible && displayVm && record && layoutVariant ?
                        <>
                            {drawerTab === "overview" ?
                                <PersonDrawerOverviewBody
                                    displayVm={displayVm}
                                    chrome={chrome}
                                    layoutVariant={layoutVariant}
                                    isChildSurface={isChildSurface}
                                    personId={personId}
                                    canMutate={!!canMutate}
                                    vmReady={Boolean(displayVm.structureSettled && committedVisible)}
                                    layoutBody={activeOverviewLayoutBody}
                                    layoutDocOverride={overviewLayoutDocBodyOverride}
                                    onOpenDrawer={onOpenDrawer}
                                    onOpenLinkedPerson={onOpenLinkedPerson}
                                />
                            :   <PersonDrawerVmTabPanes
                                    personId={personId}
                                    drawerTab={drawerTab}
                                    record={record}
                                    isChildSurface={isChildSurface}
                                    chrome={chrome}
                                    canMutate={!!canMutate}
                                />
                            }
                        </>
                    :   null}
                </div>
            </EntityDrawerOperatingShell>
            <DrawerCommandRailActionsRegistrar registration={drawerCommandRailRegistration} />
        </>
    );
}
