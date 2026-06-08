"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import RecordLifecycleRail from "@/components/admin/drawer/RecordLifecycleRail";
import CommunicationsDrawerBackgroundLoader from "@/components/admin/communications/CommunicationsDrawerBackgroundLoader";
import OpportunityDrawerOverviewBody from "@/components/admin/vmDrawer/OpportunityDrawerOverviewBody";
import OpportunityDrawerVmTabPanes from "@/components/admin/vmDrawer/OpportunityDrawerVmTabPanes";
import { OpportunityDrawerHeaderControls } from "@/components/admin/opportunity/OpportunityDrawerHeaderControls";
import OpportunityDrawerQueueNavigatorControls from "@/components/admin/OpportunityDrawerQueueNavigatorControls";
import VmProgressiveStatusDropdown from "@/components/admin/vmDrawer/VmProgressiveStatusDropdown";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import Drawer, {
    ADMINV2_DRAWER_BACKDROP_Z,
    ADMINV2_DRAWER_PANEL_Z,
} from "@/components/admin/Drawer";
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
import type { DrawerTabKey } from "@/lib/entityPresentation";
import { resolveOpportunityQueueNavigatorPosition } from "@/lib/admin/opportunityDrawerQueueNavigator";
import { useOpportunityDrawerLayoutRuntimeShadow } from "@/lib/layout/runtime/shadow/useOpportunityDrawerLayoutRuntimeShadow";

const DRAWER_ACCENT_OPPORTUNITY = "#2d6a9f";

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
        isOpportunityDrawerOpening,
        isOpportunityQueueNavPending,
        navigateOpportunityInQueue,
    } = useAdminDrawer();
    const { displayVm, coldLoading, error, suppressFullDrawerLoading, holdPriorPayload, patchDisplayRecord } =
        useOpportunityDrawerVmPayload();
    const [drawerTab, setDrawerTab] = useState<DrawerTabKey>("overview");

    const statusCanMutate = useMemo(
        () => resolveOpportunityVmStatusCanMutate(displayVm, authCanMutate),
        [displayVm, authCanMutate]
    );

    const record = displayVm?.above_fold.record ?? null;

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
    });

    const { onActionSelect, actionLoadingKey } = useOpportunityDrawerVmHeaderActions({
        opportunityId: drawer.id,
        departmentId: displayVm?.workspace.department_id,
        workUnitId: displayVm?.workspace.work_unit_id,
        registryHostExtensions,
        actionHost: headerActionHost,
    });

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

    useEffect(() => {
        if (!displayVm) return;
        logDrawerVmRuntime("render", {
            opportunity_id: displayVm.entity.id,
            drawer_id: drawer.id,
            tab: drawerTab,
        });
    }, [displayVm, drawer.id, drawerTab]);

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

    const committedTitleRef = useRef(opportunitySingular);

    const queuePosition = useMemo(() => {
        if (!drawer.opportunityQueueNavigator || !drawer.id) return null;
        return resolveOpportunityQueueNavigatorPosition(drawer.id, drawer.opportunityQueueNavigator);
    }, [drawer.id, drawer.opportunityQueueNavigator]);

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
                    menuActions={displayVm?.actions.header ?? []}
                    showRegistryActions={false}
                    canMutate={statusCanMutate}
                    onActionSelect={onActionSelect}
                    actionPreflightBlocked={actionPreflightBlocked}
                    onDismissActionPreflightBlocked={clearActionPreflightBlocked}
                    registryActionFeedback={registryActionFeedback}
                />
        );
    }, [
        committedVisible,
        drawer.id,
        drawer.opportunityQueuePreviewSeed,
        displayVm?.actions.header,
        onActionSelect,
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
                    menuActions={displayVm.actions.header_menu}
                    showRegistryActions
                    canMutate={statusCanMutate}
                    actionLoadingKey={actionLoadingKey}
                    onActionSelect={onActionSelect}
                    layout="modal-actions"
                    actionPreflightBlocked={actionPreflightBlocked}
                    onDismissActionPreflightBlocked={clearActionPreflightBlocked}
                    registryActionFeedback={registryActionFeedback}
                    actionsDisabledReason={
                        actionLoadingKey ? "An action is running — wait for it to finish."
                        : !statusCanMutate ? "You don't have permission to run actions on this record."
                        :   null
                    }
                />
            </div>
        );
    }, [
        committedVisible,
        actionLoadingKey,
        displayVm,
        drawer.id,
        drawer.opportunityQueuePreviewSeed,
        onActionSelect,
        record,
        statusCanMutate,
        actionPreflightBlocked,
        clearActionPreflightBlocked,
        registryActionFeedback,
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
                <RecordLifecycleRail
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
        Boolean(drawerVmRender.id);

    return (
        <>
        <Drawer
            isOpen={drawerOpen}
            onClose={closeDrawer}
            title={drawerTitle}
            headerSubtitle={headerSubtitleBelowTitle}
            headerTitleCenter={headerAttentionCenter}
            headerTitleRight={headerTitleRight}
            variant="adminV2"
            presentation="modal"
            panelClassName="max-w-7xl"
            zIndexBackdrop={ADMINV2_DRAWER_BACKDROP_Z}
            zIndexPanel={ADMINV2_DRAWER_PANEL_Z}
            accentColor={DRAWER_ACCENT_OPPORTUNITY}
            recordModalTone="cleaning-v2"
            overlayChildren={
                registryModals ?
                    <div data-vm-drawer-action-modals-host="true">{registryModals}</div>
                :   null
            }
        >
            <div
                className="relative"
                data-adminv2-drawer="true"
                data-drawer-runtime="opportunity-vm"
                {...(holdPriorPayload ? { "data-drawer-vm-transition-hold": "true" } : {})}
            >
                {isOpportunityQueueNavPending ?
                    <div
                        className="absolute inset-0 z-20 flex items-center justify-center bg-white/75"
                        role="status"
                        data-opportunity-drawer-queue-nav-pending="true"
                    >
                        <p className="text-sm font-medium text-alloy-midnight/85">Opening record…</p>
                    </div>
                :   null}
                {queuePosition && queuePosition.total >= 2 ?
                    <div className="mb-3 flex justify-end">
                        <OpportunityDrawerQueueNavigatorControls
                            position={queuePosition}
                            pending={isOpportunityQueueNavPending}
                            onPrev={() => navigateOpportunityInQueue("prev")}
                            onNext={() => navigateOpportunityInQueue("next")}
                        />
                    </div>
                :   null}
                {error ?
                    <p className="text-sm text-alloy-ember">{error}</p>
                :   null}
                {showColdShell ?
                    <div className="py-12 text-center" data-drawer-vm-runtime-cold-loading="true">
                        <p className="text-sm font-medium text-alloy-midnight/75">Loading opportunity…</p>
                    </div>
                :   committedVisible && displayVm && record ?
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
                                        :   "text-alloy-midnight/60 hover:bg-alloy-stone/10"
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
                        :   null}
                        {drawer.id ?
                            <CommunicationsDrawerBackgroundLoader
                                apiEntityType="opportunities"
                                entityId={drawer.id}
                            />
                        :   null}
                        {drawerTab === "overview" ?
                            <OpportunityDrawerOverviewBody
                                displayVm={displayVm}
                                drawerId={String(displayVm.entity.id)}
                                opportunitySingular={opportunitySingular}
                                onSelectTab={onTabSelect}
                                vmReady={Boolean(displayVm.structureSettled && committedVisible)}
                                departmentId={displayVm.workspace.department_id}
                                workUnitId={displayVm.workspace.work_unit_id}
                                layoutRuntimeShadow={layoutRuntimeShadow}
                            />
                        :   <OpportunityDrawerVmTabPanes
                                drawerId={String(displayVm.entity.id)}
                                drawerTab={drawerTab}
                                record={record}
                                onSelectTab={onTabSelect}
                            />
                        }
                    </>
                :   null}
            </div>
        </Drawer>
    </>
    );
}
