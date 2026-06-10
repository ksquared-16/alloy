"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import OpportunityDrawerProofLayoutHeader from "@/components/admin/vmDrawer/OpportunityDrawerProofLayoutHeader";
import EntityDrawerOperatingShell from "@/components/admin/drawer/EntityDrawerOperatingShell";
import ProofDoctrineLifecycleRail from "@/components/layout/proofShell/ProofDoctrineLifecycleRail";
import CommunicationsDrawerBackgroundLoader from "@/components/admin/communications/CommunicationsDrawerBackgroundLoader";
import OpportunityDrawerOverviewBody from "@/components/admin/vmDrawer/OpportunityDrawerOverviewBody";
import DrawerLayoutRuntimeShellZoneView from "@/components/admin/vmDrawer/DrawerLayoutRuntimeShellZoneView";
import OpportunityDrawerBodySaveBar from "@/components/admin/vmDrawer/OpportunityDrawerBodySaveBar";
import VmDrawerActionModalsPortal from "@/components/admin/vmDrawer/VmDrawerActionModalsPortal";
import OpportunityDrawerVmTabPanes from "@/components/admin/vmDrawer/OpportunityDrawerVmTabPanes";
import { OpportunityDrawerHeaderControls } from "@/components/admin/opportunity/OpportunityDrawerHeaderControls";
import OpportunityDrawerQueueNavigatorControls from "@/components/admin/OpportunityDrawerQueueNavigatorControls";
import VmProgressiveStatusDropdown from "@/components/admin/vmDrawer/VmProgressiveStatusDropdown";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { formatOpportunityInquiryDrawerTitle } from "@/lib/admin/drawer/opportunityInquiryDrawerTitle";
import { isDrawerHeaderAttentionVisible } from "@/lib/admin/drawer/drawerHeaderAttentionPresentation";
import { buildOpportunityVmLifecycleRailModel } from "@/lib/adminV2/viewModel/drawer/vmRuntime/buildOpportunityVmLifecycleRailModel";
import { resolveOpportunityVmStatusCanMutate } from "@/lib/adminV2/viewModel/drawer/vmRuntime/resolveOpportunityVmStatusCanMutate";
import { useOpportunityDrawerVmHeaderActions } from "@/lib/adminV2/viewModel/drawer/vmRuntime/useOpportunityDrawerVmHeaderActions";
import { useOpportunityDrawerVmRegistryModals } from "@/lib/adminV2/viewModel/drawer/vmRuntime/useOpportunityDrawerVmRegistryModals";
import { useOpportunityDrawerActionPreflight } from "@/lib/admin/actions/useOpportunityDrawerActionPreflight";
import { useOpportunityDrawerRegistryActionFeedback } from "@/lib/admin/actions/useOpportunityDrawerRegistryActionFeedback";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";
import { OPPORTUNITY_INQUIRY_WORKFLOW_TAB_STRIP } from "@/lib/adminV2/shellContracts/opportunityInquiryWorkflowTabs";
import { useOpportunityDrawerVmPayload } from "@/lib/adminV2/viewModel/drawer/vmRuntime/useOpportunityDrawerVmPayload";
import { resolveOpportunityVmStatusLabel } from "@/lib/adminV2/viewModel/drawer/vmRuntime/resolveOpportunityVmStatusLabel";
import { logDrawerVmRuntime } from "@/lib/adminV2/viewModel/drawer/vmRuntime/drawerVmRuntimeLog";
import { logDrawerTabSwitch } from "@/lib/admin/drawer/personDrawerPerfLogs";
import type { DrawerTabKey } from "@/lib/entityPresentation";
import { resolveOpportunityQueueNavigatorPosition } from "@/lib/admin/opportunityDrawerQueueNavigator";
import type { AdornmentActionHandler } from "@/components/layout/LayoutRuntimePlanView";
import { useOpportunityDrawerLayoutRuntimeShadow } from "@/lib/layout/runtime/shadow/useOpportunityDrawerLayoutRuntimeShadow";
import {
    isDrawerSummaryStripBoundaryEnabledClient,
    isLayoutRuntimeHardCutoverActiveClient,
    isLayoutRuntimeOpportunityDrawerBodyEnabledClient,
} from "@/lib/layout/featureFlag";
import { mergeOpportunityLayoutRuntimeWidgetRecord } from "@/lib/layout/runtime/mergeOpportunityLayoutRuntimeWidgetRecord";
import { handleLayoutRuntimeAdornmentOpenDrawer } from "@/lib/layout/runtime/resolveLayoutAdornmentOpenDrawer";
import { splitDrawerLayoutDocShellZones } from "@/lib/layout/runtime/splitDrawerLayoutDocShellZones";
import { shouldUseLeadOverviewComposition } from "@/lib/layout/runtime/leadOverviewComposition";
import { useDrawerLayoutRuntimeBody } from "@/lib/layout/runtime/useDrawerLayoutRuntimeBody";
import OpportunityDrawerOpeningOverlay from "@/components/admin/OpportunityDrawerOpeningOverlay";
import OpportunityDrawerTabBackgroundLoader from "@/components/admin/vmDrawer/OpportunityDrawerTabBackgroundLoader";
import { scheduleDeferredCommunicationsDrawerPrefetch } from "@/lib/admin/communications/communicationsDrawerPrefetch";
import { scheduleOpportunityDrawerTabPrefetch } from "@/lib/admin/opportunityDrawerTabPrefetch";
import { opportunityDisplayLocationFromRecord } from "@/lib/opportunities/resolveOpportunityDisplayLocation";
import { drawerSubjectContextDiagnosticAttrs } from "@/lib/workUnits/buildDrawerSubjectContextFromQueueRowContext";
import { useBosOpportunityDrawerContextSeed } from "@/lib/adminV2/bos/useBosDrawerOperationalContextSeed";
import { DrawerCommandRailActionsRegistrar } from "@/app/adminV2/components/workspace/DrawerCommandRailActionsRegistrar";
import { DeleteLeadModal } from "@/components/admin/opportunity/DeleteLeadModal";
import { buildRecordManageMenuForEntity } from "@/lib/admin/recordManage/buildRecordManageMenu";
import {
    dispatchOpportunityQueueUpdated,
    dispatchOpportunityQueueUpdatedBroadcast,
} from "@/lib/admin/opportunityQueueRefreshEvent";
import type { RecordManageMenuActionKey } from "@/lib/admin/recordManage/types";

const OPPORTUNITY_TAB_LABELS: Partial<Record<DrawerTabKey, string>> = {
    overview: "Overview",
    communications: "Communications",
    notes: "Notes",
    documents: "Documents",
    activity: "Activity",
};

export default function OpportunityDrawerVmRuntime() {
    const { canMutate: authCanMutate } = useAdminAuth();
    const { labels } = useEntityLabels();
    const opportunitySingular = labels.opportunities?.singular ?? "Opportunity";
    const {
        drawer,
        drawerVmRender,
        closeDrawer,
        openDrawer,
        isOpportunityDrawerOpening,
        isOpportunityQueueNavPending,
        navigateOpportunityInQueue,
    } = useAdminDrawer();
    const { displayVm, coldLoading, error, suppressFullDrawerLoading, holdPriorPayload, patchDisplayRecord, reloadOpportunityDisplayVm } =
        useOpportunityDrawerVmPayload();
    const [drawerTab, setDrawerTab] = useState<DrawerTabKey>("overview");
    const layoutCutoverHeader = isLayoutRuntimeHardCutoverActiveClient();

    const statusCanMutate = useMemo(
        () => resolveOpportunityVmStatusCanMutate(displayVm, authCanMutate),
        [displayVm, authCanMutate]
    );

    const record = displayVm?.above_fold.record ?? null;

    useBosOpportunityDrawerContextSeed({
        drawerId: drawer.type === "opportunities" ? drawer.id : null,
        overviewData: record as Record<string, unknown> | null,
        queuePreviewSeed: drawer.opportunityQueuePreviewSeed ?? null,
        opportunitySingular,
    });

    const { feedback: registryActionFeedback, showSuccess, showError, clearFeedback: clearRegistryActionFeedback } =
        useOpportunityDrawerRegistryActionFeedback(drawer.id);

    const { blocked: actionPreflightBlocked, clearBlocked: clearActionPreflightBlocked, applyBlockedFromDetail } =
        useOpportunityDrawerActionPreflight(drawer.id);

    const registryActionHost = useMemo(
        () => ({
            patchRecord: patchDisplayRecord,
        }),
        [patchDisplayRecord]
    );

    const headerActionHost = useMemo(
        () => ({
            showSuccess: (message: string, opts?: { workflow_run_id?: string }) => {
                clearActionPreflightBlocked();
                showSuccess(message, opts);
            },
            showError: (message: string) => {
                clearActionPreflightBlocked();
                showError(message);
            },
            clearPreflight: clearActionPreflightBlocked,
            applyPreflightBlocked: applyBlockedFromDetail,
        }),
        [
            applyBlockedFromDetail,
            clearActionPreflightBlocked,
            showError,
            showSuccess,
        ]
    );

    const { modals: registryModals, registryHostExtensions } = useOpportunityDrawerVmRegistryModals({
        opportunityId: drawer.id,
        record,
        canMutate: statusCanMutate,
        actionHost: registryActionHost,
        workspaceWorkUnitId: displayVm?.workspace.work_unit_id ?? null,
        workspaceDepartmentId: displayVm?.workspace.department_id ?? null,
        reloadOpportunityDisplayVm,
    });

    const { onActionSelect, actionLoadingKey } = useOpportunityDrawerVmHeaderActions({
        opportunityId: drawer.id,
        departmentId: displayVm?.workspace.department_id,
        workUnitId: displayVm?.workspace.work_unit_id,
        registryHostExtensions,
        actionHost: headerActionHost,
    });

    const [deleteLeadModalOpen, setDeleteLeadModalOpen] = useState(false);
    const [manageBusyKey, setManageBusyKey] = useState<RecordManageMenuActionKey | null>(null);

    const manageMenuItems = useMemo(
        () => buildRecordManageMenuForEntity("lead", opportunitySingular),
        [opportunitySingular]
    );

    const onManageSelect = useCallback((key: RecordManageMenuActionKey) => {
        if (key === "delete_lead") {
            setDeleteLeadModalOpen(true);
            return;
        }
    }, []);

    const onLeadDeleted = useCallback(() => {
        const opportunityId = drawer.id?.trim();
        setDeleteLeadModalOpen(false);
        setManageBusyKey(null);
        closeDrawer();
        if (opportunityId) {
            dispatchOpportunityQueueUpdated(opportunityId, "delete_lead");
        } else {
            dispatchOpportunityQueueUpdatedBroadcast("delete_lead");
        }
    }, [closeDrawer, drawer.id]);

    useEffect(() => {
        setDrawerTab("overview");
        clearRegistryActionFeedback();
    }, [drawer.id, clearRegistryActionFeedback]);

    useEffect(() => {
        if (!drawer.id?.trim()) return;
        const oid = drawer.id.trim();
        const onFocusDocuments = (ev: Event) => {
            const id =
                typeof (ev as CustomEvent<{ opportunity_id?: string }>).detail?.opportunity_id === "string"
                    ? (ev as CustomEvent<{ opportunity_id?: string }>).detail!.opportunity_id!.trim()
                    : "";
            if (id !== oid) return;
            setDrawerTab("documents");
        };
        window.addEventListener("adminv2:opportunity-focus-documents", onFocusDocuments as EventListener);
        return () =>
            window.removeEventListener("adminv2:opportunity-focus-documents", onFocusDocuments as EventListener);
    }, [drawer.id]);

    const drawerTabPrevRef = useRef(drawerTab);
    useEffect(() => {
        const prev = drawerTabPrevRef.current;
        if (prev !== drawerTab && displayVm?.entity.id) {
            logDrawerTabSwitch({
                entityType: "opportunity",
                entityId: String(displayVm.entity.id),
                fromTab: prev,
                toTab: drawerTab,
            });
        }
        drawerTabPrevRef.current = drawerTab;
    }, [displayVm?.entity.id, drawerTab]);

    const vmMatchesRender = useMemo(
        () =>
            displayVm != null &&
            String(displayVm.entity.id) === String(drawerVmRender.id) &&
            drawerVmRender.type === "opportunities",
        [displayVm, drawerVmRender.id, drawerVmRender.type]
    );

    const committedVisible = useMemo(
        () =>
            vmMatchesRender &&
            drawer.type === "opportunities" &&
            String(drawer.id) === String(displayVm?.entity.id),
        [vmMatchesRender, drawer.type, drawer.id, displayVm?.entity.id]
    );

    const layoutRuntimeShadow = useOpportunityDrawerLayoutRuntimeShadow({
        opportunityId: committedVisible ? drawer.id : null,
        vmReady: Boolean(displayVm?.structureSettled && committedVisible),
        departmentId: displayVm?.workspace.department_id,
        workUnitId: displayVm?.workspace.work_unit_id,
    });

    const overviewLayoutQueryParams = useMemo(
        () => ({
            departmentId: displayVm?.workspace.department_id,
            workUnitId: displayVm?.workspace.work_unit_id,
        }),
        [displayVm?.workspace.department_id, displayVm?.workspace.work_unit_id],
    );

    const layoutPrefetchId =
        drawerVmRender.type === "opportunities" && drawerVmRender.id ?
            String(drawerVmRender.id)
            : null;

    const overviewLayoutBody = useDrawerLayoutRuntimeBody({
        cutoverEnabled: isLayoutRuntimeOpportunityDrawerBodyEnabledClient(),
        entityId: layoutPrefetchId,
        vmReady: Boolean(displayVm?.structureSettled && layoutPrefetchId),
        apiPath: "/api/admin/layout-runtime/opportunity-drawer-body",
        queryParams: overviewLayoutQueryParams,
        logTag: "opportunity_drawer",
    });

    useLayoutEffect(() => {
        if (!layoutPrefetchId) return;
        scheduleDeferredCommunicationsDrawerPrefetch("opportunities", layoutPrefetchId);
        scheduleOpportunityDrawerTabPrefetch(layoutPrefetchId);
    }, [layoutPrefetchId]);

    const summaryStripBoundaryEnabled = isDrawerSummaryStripBoundaryEnabledClient();

    const overviewWidgetRecord = useMemo(() => {
        if (!record) return null;
        const merged: Record<string, unknown> = { ...record };
        if (displayVm?.summaries?.tasks && merged._inquiry_summary_tasks == null) {
            merged._inquiry_summary_tasks = displayVm.summaries.tasks;
        }
        return merged;
    }, [record, displayVm?.summaries?.tasks]);

    const mergedOverviewLayoutRecord = useMemo(() => {
        if (!overviewLayoutBody.record) return null;
        return mergeOpportunityLayoutRuntimeWidgetRecord(overviewLayoutBody.record, overviewWidgetRecord);
    }, [overviewLayoutBody.record, overviewWidgetRecord]);

    const layoutShellZones = useMemo(() => {
        if (!summaryStripBoundaryEnabled || !overviewLayoutBody.doc || !overviewLayoutBody.bodyReady) {
            return null;
        }
        return splitDrawerLayoutDocShellZones(overviewLayoutBody.doc, "opportunity");
    }, [summaryStripBoundaryEnabled, overviewLayoutBody.doc, overviewLayoutBody.bodyReady]);

    const leadCompositionActive = useMemo(
        () => shouldUseLeadOverviewComposition(overviewLayoutBody.doc),
        [overviewLayoutBody.doc],
    );

    const layoutAdornmentAction = useCallback<AdornmentActionHandler>(
        (item, adornment, rowRecord) => {
            if (!mergedOverviewLayoutRecord || !drawer.id) return;
            handleLayoutRuntimeAdornmentOpenDrawer({
                item,
                adornment,
                record: mergedOverviewLayoutRecord,
                rowRecord,
                opportunityId: drawer.id,
                opportunityRecord: mergedOverviewLayoutRecord as Record<string, unknown>,
                openDrawer,
                opportunityWorkspaceContext:
                    displayVm?.workspace.department_id && displayVm?.workspace.work_unit_id ?
                        {
                            department_id: displayVm.workspace.department_id,
                            work_unit_id: displayVm.workspace.work_unit_id,
                        }
                        : drawer.opportunityWorkspaceContext ?? null,
            });
        },
        [
            mergedOverviewLayoutRecord,
            drawer.id,
            drawer.opportunityWorkspaceContext,
            displayVm?.workspace.department_id,
            displayVm?.workspace.work_unit_id,
            openDrawer,
        ],
    );

    const overviewLayoutDocBodyOverride = useMemo(() => {
        if (!layoutShellZones?.summarySectionKeys.length) return undefined;
        return layoutShellZones.bodyDoc;
    }, [layoutShellZones]);

    const drawerSummaryStrip = useMemo(() => {
        if (
            !layoutShellZones?.summarySectionKeys.length ||
            !mergedOverviewLayoutRecord ||
            !drawer.id
        ) {
            return null;
        }
        return (
            <DrawerLayoutRuntimeShellZoneView
                zone="summary_strip"
                doc={layoutShellZones.summaryDoc}
                record={mergedOverviewLayoutRecord}
                entityId={drawer.id}
                canMutate={statusCanMutate}
                onAdornmentAction={layoutAdornmentAction}
            />
        );
    }, [
        layoutShellZones,
        mergedOverviewLayoutRecord,
        drawer.id,
        statusCanMutate,
        layoutAdornmentAction,
    ]);

    const overviewLayoutShellReady =
        !layoutCutoverHeader ||
        drawerTab !== "overview" ||
        !overviewLayoutBody.cutoverEnabled ||
        overviewLayoutBody.bodyReady ||
        overviewLayoutBody.phase === "fallback";

    const committedTitleRef = useRef(opportunitySingular);

    const queuePosition = useMemo(() => {
        if (!drawer.opportunityQueueNavigator || !drawer.id) return null;
        return resolveOpportunityQueueNavigatorPosition(drawer.id, drawer.opportunityQueueNavigator);
    }, [drawer.id, drawer.opportunityQueueNavigator]);

    const queueNavigationControls = useMemo(() => {
        if (!queuePosition || queuePosition.total < 2) return null;
        return (
            <OpportunityDrawerQueueNavigatorControls
                position={queuePosition}
                pending={isOpportunityQueueNavPending}
                onPrev={() => navigateOpportunityInQueue("prev")}
                onNext={() => navigateOpportunityInQueue("next")}
            />
        );
    }, [queuePosition, isOpportunityQueueNavPending, navigateOpportunityInQueue]);

    const drawerTitle = useMemo(() => {
        if (!committedVisible || !record) return committedTitleRef.current;
        const next =
            formatOpportunityInquiryDrawerTitle(record, opportunitySingular) || opportunitySingular;
        committedTitleRef.current = next;
        return next;
    }, [record, opportunitySingular, committedVisible]);

    const statusLabel = useMemo(
        () =>
            resolveOpportunityVmStatusLabel({
                drawerId: committedVisible ? drawer.id : displayVm?.entity.id ?? drawer.id,
                displayVm,
                queueSeedStatusLabel: drawer.opportunityQueuePreviewSeed?.statusLabel,
            }),
        [drawer.id, displayVm, drawer.opportunityQueuePreviewSeed?.statusLabel]
    );

    const currentStatusKey = useMemo(
        () => String(record?.status_key ?? "").trim(),
        [record]
    );

    const headerAttentionCenter = useMemo(() => {
        if (!committedVisible || !drawer.id || !record || !isDrawerHeaderAttentionVisible(record)) {
            return null;
        }
        return (
            <OpportunityDrawerHeaderControls
                layout="modal-attention"
                opportunityId={drawer.id}
                overviewData={record}
                opportunitySingular={opportunitySingular}
                queuePreviewSeed={drawer.opportunityQueuePreviewSeed}
                inquiryWorkflow
                manageMenuItems={manageMenuItems}
                canMutate={statusCanMutate}
                onManageSelect={onManageSelect}
                actionPreflightBlocked={actionPreflightBlocked}
                onDismissActionPreflightBlocked={clearActionPreflightBlocked}
                registryActionFeedback={registryActionFeedback}
            />
        );
    }, [
        committedVisible,
        drawer.id,
        drawer.opportunityQueuePreviewSeed,
        manageMenuItems,
        onManageSelect,
        opportunitySingular,
        record,
        statusCanMutate,
        actionPreflightBlocked,
        clearActionPreflightBlocked,
        registryActionFeedback,
    ]);

    /** Status below title (left) — matches legacy inquiry modal subtitle rail. */
    const headerSubtitleBelowTitle = useMemo(() => {
        if (!committedVisible || !drawer.id || !statusLabel) return undefined;
        return (
            <div className="mt-0.5" data-opportunity-drawer-header-status-below-title="true">
                <div className="shrink-0" data-drawer-vm-status-rail="true">
                    <VmProgressiveStatusDropdown
                        opportunityId={drawer.id}
                        firstPaintLabel={statusLabel}
                        currentStatusKey={currentStatusKey}
                        statusControl={displayVm?.header.status}
                        canMutate={statusCanMutate}
                    />
                </div>
            </div>
        );
    }, [
        committedVisible,
        currentStatusKey,
        displayVm?.header.status,
        drawer.id,
        statusCanMutate,
        statusLabel,
    ]);

    /** Top-right: Work with BOS + Actions menu + close (Drawer appends close). */
    const headerTitleRight = useMemo(() => {
        if (!committedVisible || !drawer.id || !displayVm || !record) return undefined;
        return (
            <div
                className="flex shrink-0 items-start"
                data-opportunity-drawer-header-title-right="true"
            >
                <OpportunityDrawerHeaderControls
                    opportunityId={drawer.id}
                    overviewData={record}
                    queuePreviewSeed={drawer.opportunityQueuePreviewSeed}
                    inquiryWorkflow
                    manageMenuItems={manageMenuItems}
                    canMutate={statusCanMutate}
                    manageBusyKey={manageBusyKey}
                    onManageSelect={onManageSelect}
                    layout="modal-actions"
                    actionPreflightBlocked={actionPreflightBlocked}
                    onDismissActionPreflightBlocked={clearActionPreflightBlocked}
                    registryActionFeedback={registryActionFeedback}
                    manageDisabledReason={
                        manageBusyKey ? "A manage action is running — wait for it to finish."
                            : !statusCanMutate ? "You don't have permission to manage this record."
                                : null
                    }
                />
            </div>
        );
    }, [
        committedVisible,
        displayVm,
        drawer.id,
        drawer.opportunityQueuePreviewSeed,
        manageBusyKey,
        manageMenuItems,
        onManageSelect,
        record,
        statusCanMutate,
        actionPreflightBlocked,
        clearActionPreflightBlocked,
        registryActionFeedback,
    ]);

    const drawerCommandRailRegistration = useMemo(() => {
        if (!committedVisible || !displayVm || !drawer.id || !record) return null;
        const actions = displayVm.actions.header_menu;
        return {
            actions,
            actionCount: actions.length,
            canMutate: statusCanMutate,
            actionLoadingKey,
            onActionSelect,
            disabledReason:
                actionLoadingKey ? "An action is running — wait for it to finish."
                : !statusCanMutate ? "You don't have permission to run actions on this record."
                :   null,
        };
    }, [
        actionLoadingKey,
        committedVisible,
        displayVm,
        drawer.id,
        onActionSelect,
        record,
        statusCanMutate,
    ]);

    const tabs = useMemo((): DrawerTabKey[] => {
        const fromVm = displayVm?.layout.tabs;
        if (fromVm && fromVm.length > 0) return fromVm;
        return OPPORTUNITY_INQUIRY_WORKFLOW_TAB_STRIP;
    }, [displayVm?.layout.tabs]);

    const lifecycleRail = useMemo(() => {
        const model = buildOpportunityVmLifecycleRailModel({
            displayVm,
            drawerId: drawer.id,
        });
        if (model && model.steps.length > 0) {
            return (
                <ProofDoctrineLifecycleRail
                    model={model}
                    data-testid="opportunity-lifecycle-rail"
                    aria-label="Opportunity lifecycle"
                />
            );
        }
        return null;
    }, [displayVm, drawer.id]);

    const showColdShell = coldLoading && !displayVm && !suppressFullDrawerLoading;

    const onTabSelect = useCallback((tab: DrawerTabKey) => setDrawerTab(tab), []);

    const drawerOpen =
        Boolean(drawer.type && drawer.id) &&
        !isOpportunityDrawerOpening &&
        drawerVmRender.type === "opportunities" &&
        Boolean(drawerVmRender.id) &&
        committedVisible &&
        Boolean(displayVm) &&
        Boolean(record) &&
        (!layoutCutoverHeader || drawerTab !== "overview" || overviewLayoutShellReady);

    const showRuntimeOpeningOverlay =
        Boolean(drawer.type === "opportunities" && drawer.id) &&
        drawerVmRender.type === "opportunities" &&
        Boolean(drawerVmRender.id) &&
        !isOpportunityDrawerOpening &&
        !drawerOpen &&
        !error;

    const locationLabel = useMemo(() => {
        if (!record) return null;
        const location = opportunityDisplayLocationFromRecord(record);
        if (location.kind === "single" || location.kind === "multiple") return location.label;
        return null;
    }, [record]);

    const drawerSubjectShellAttrs = useMemo(
        () => drawerSubjectContextDiagnosticAttrs(drawer.drawerSubjectContext),
        [drawer.drawerSubjectContext],
    );

    const composedProofHeader = useMemo(() => {
        if (!layoutCutoverHeader || !committedVisible || !drawer.id || !displayVm || !record) return undefined;
        return (
            <OpportunityDrawerProofLayoutHeader
                title={drawerTitle}
                locationLabel={locationLabel}
                opportunityId={drawer.id}
                record={record}
                displayVm={displayVm}
                queuePreviewSeed={drawer.opportunityQueuePreviewSeed}
                opportunitySingular={opportunitySingular}
                statusLabel={statusLabel}
                currentStatusKey={currentStatusKey}
                statusControl={displayVm.header.status}
                statusCanMutate={statusCanMutate}
                tabs={tabs}
                activeTab={drawerTab}
                onTabSelect={onTabSelect}
                lifecycleRail={lifecycleRail}
                onClose={closeDrawer}
                manageMenuItems={manageMenuItems}
                onManageSelect={onManageSelect}
                manageBusyKey={manageBusyKey}
                actionPreflightBlocked={actionPreflightBlocked}
                onDismissActionPreflightBlocked={clearActionPreflightBlocked}
                registryActionFeedback={registryActionFeedback}
                tabLabels={OPPORTUNITY_TAB_LABELS}
                leadCompositionActive={leadCompositionActive}
                queueNavigation={queueNavigationControls}
            />
        );
    }, [
        layoutCutoverHeader,
        committedVisible,
        drawer.id,
        drawer.opportunityQueuePreviewSeed,
        displayVm,
        record,
        drawerTitle,
        locationLabel,
        opportunitySingular,
        statusLabel,
        currentStatusKey,
        statusCanMutate,
        tabs,
        drawerTab,
        onTabSelect,
        lifecycleRail,
        closeDrawer,
        manageBusyKey,
        manageMenuItems,
        onManageSelect,
        actionPreflightBlocked,
        clearActionPreflightBlocked,
        registryActionFeedback,
        leadCompositionActive,
        queueNavigationControls,
    ]);

    const drawerTitleNode = drawerTitle;

    return (
        <>
            {showRuntimeOpeningOverlay ?
                <OpportunityDrawerOpeningOverlay
                    onCancel={closeDrawer}
                    recordLabel={opportunitySingular}
                />
                : null}
            <EntityDrawerOperatingShell
                entity="opportunity"
                isOpen={drawerOpen}
                onClose={closeDrawer}
                title={drawerTitleNode}
                headerSubtitle={layoutCutoverHeader ? undefined : headerSubtitleBelowTitle}
                headerTitleCenter={layoutCutoverHeader ? undefined : headerAttentionCenter}
                headerTitleRight={layoutCutoverHeader ? undefined : headerTitleRight}
                composedStickyHeader={composedProofHeader}
                panelFooterChrome={
                    layoutCutoverHeader && committedVisible ?
                        <OpportunityDrawerBodySaveBar canMutate={statusCanMutate} />
                        : undefined
                }
                runtimeDataAttribute="opportunity-vm"
                runtimeShellDataAttributes={drawerSubjectShellAttrs}
                holdPriorPayload={holdPriorPayload}
                summaryStrip={
                    drawerTab === "overview" && committedVisible ? drawerSummaryStrip : null
                }
            >
                {isOpportunityQueueNavPending ?
                    <div
                        className="absolute inset-0 z-20 flex items-center justify-center bg-white/75"
                        role="status"
                        data-opportunity-drawer-queue-nav-pending="true"
                    >
                        <p className="text-sm font-medium text-alloy-midnight/85">Opening record…</p>
                    </div>
                    : null}
                {!layoutCutoverHeader && queueNavigationControls ?
                    <div className="mb-3 flex justify-end">
                        {queueNavigationControls}
                    </div>
                    : null}
                {error ?
                    <p className="text-sm text-alloy-ember">{error}</p>
                    : null}
                {showColdShell ?
                    <div className="adminv2-drawer-vm-cold-loading" data-drawer-vm-runtime-cold-loading="true">
                        <p className="text-sm font-medium text-alloy-midnight/75">Loading opportunity…</p>
                    </div>
                    : committedVisible && displayVm && record ?
                        <>
                            {!layoutCutoverHeader ?
                                <>
                                    <div
                                        className="mb-3 flex flex-wrap gap-0.5 border-b border-alloy-stone/15 pb-2"
                                        data-opportunity-drawer-tab-strip="true"
                                    >
                                        {tabs.map((tab) => (
                                            <button
                                                key={tab}
                                                type="button"
                                                onClick={() => onTabSelect(tab)}
                                                className={clsx(
                                                    "rounded-md px-3 py-1.5 text-xs font-semibold capitalize",
                                                    drawerTab === tab ?
                                                        "bg-alloy-blue/10 text-alloy-blue"
                                                        : "text-alloy-midnight/60 hover:bg-alloy-stone/10",
                                                )}
                                                data-opportunity-drawer-tab={tab}
                                            >
                                                {OPPORTUNITY_TAB_LABELS[tab] ?? tab}
                                            </button>
                                        ))}
                                    </div>
                                    {lifecycleRail ?
                                        <div
                                            className="mb-3"
                                            data-opportunity-drawer-lifecycle-rail-wrap="true"
                                        >
                                            {lifecycleRail}
                                        </div>
                                        : null}
                                </>
                                : null}
                            {drawer.id ?
                                <>
                                    <CommunicationsDrawerBackgroundLoader
                                        apiEntityType="opportunities"
                                        entityId={drawer.id}
                                    />
                                    <OpportunityDrawerTabBackgroundLoader drawerId={drawer.id} />
                                </>
                                : null}
                            {drawerTab === "overview" ?
                                <OpportunityDrawerOverviewBody
                                    displayVm={displayVm}
                                    drawerId={String(displayVm.entity.id)}
                                    opportunitySingular={opportunitySingular}
                                    onSelectTab={onTabSelect}
                                    vmReady={Boolean(displayVm.structureSettled && committedVisible)}
                                    canMutate={statusCanMutate}
                                    departmentId={displayVm.workspace.department_id}
                                    workUnitId={displayVm.workspace.work_unit_id}
                                    layoutRuntimeShadow={layoutRuntimeShadow}
                                    layoutBody={overviewLayoutBody}
                                    layoutDocBodyOverride={overviewLayoutDocBodyOverride}
                                />
                                : <OpportunityDrawerVmTabPanes
                                    drawerId={String(displayVm.entity.id)}
                                    drawerTab={drawerTab}
                                    record={record}
                                    onSelectTab={onTabSelect}
                                />
                            }
                        </>
                        : null}
            </EntityDrawerOperatingShell>
            {registryModals || deleteLeadModalOpen ?
                <VmDrawerActionModalsPortal>
                    {registryModals}
                    {drawer.id ?
                        <DeleteLeadModal
                            open={deleteLeadModalOpen}
                            opportunityId={drawer.id}
                            leadSingular={opportunitySingular}
                            onClose={() => setDeleteLeadModalOpen(false)}
                            onDeleted={onLeadDeleted}
                        />
                    :   null}
                </VmDrawerActionModalsPortal>
                : null}
            <DrawerCommandRailActionsRegistrar registration={drawerCommandRailRegistration} />
        </>
    );
}
