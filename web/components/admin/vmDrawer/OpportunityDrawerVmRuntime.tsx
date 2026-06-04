"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import RecordLifecycleRail from "@/components/admin/drawer/RecordLifecycleRail";
import RecordLifecycleRailSkeleton from "@/components/admin/drawer/RecordLifecycleRailSkeleton";
import CommunicationsDrawerBackgroundLoader from "@/components/admin/communications/CommunicationsDrawerBackgroundLoader";
import OpportunityDrawerInquiryWorkflowOverview from "@/components/admin/vmDrawer/OpportunityDrawerInquiryWorkflowOverview";
import OpportunityDrawerVmTabPanes from "@/components/admin/vmDrawer/OpportunityDrawerVmTabPanes";
import { OpportunityDrawerHeaderControls } from "@/components/admin/opportunity/OpportunityDrawerHeaderControls";
import OpportunityDrawerQueueNavigatorControls from "@/components/admin/OpportunityDrawerQueueNavigatorControls";
import VmOpportunityStatusControl from "@/components/admin/vmDrawer/VmOpportunityStatusControl";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import Drawer, {
    ADMINV2_DRAWER_BACKDROP_Z,
    ADMINV2_DRAWER_PANEL_Z,
} from "@/components/admin/Drawer";
import { formatOpportunityInquiryDrawerTitle } from "@/lib/admin/drawer/opportunityInquiryDrawerTitle";
import { resolveOpportunityDrawerQueueDefinition } from "@/lib/admin/drawer/resolveOpportunityDrawerQueueDefinition";
import { resolveRecordLifecycleRailModel } from "@/lib/admin/drawer/resolveRecordLifecycleRailModel";
import { useEntityLabels } from "@/contexts/EntityLabelsContext";
import { OPPORTUNITY_INQUIRY_WORKFLOW_TAB_STRIP } from "@/lib/adminV2/shellContracts/opportunityInquiryWorkflowTabs";
import { opportunityDrawerVmStatusLabelFromControl } from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerVmStatusReconciliation";
import { useOpportunityDrawerVmPayload } from "@/lib/adminV2/viewModel/drawer/vmRuntime/useOpportunityDrawerVmPayload";
import { logDrawerVmRuntime } from "@/lib/adminV2/viewModel/drawer/vmRuntime/drawerVmRuntimeLog";
import type { StatusControlVm } from "@/lib/adminV2/viewModel/drawer/types";
import type { DrawerTabKey } from "@/lib/entityPresentation";
import { resolveOpportunityQueueNavigatorPosition } from "@/lib/admin/opportunityDrawerQueueNavigator";

const DRAWER_ACCENT_OPPORTUNITY = "#2d6a9f";

const OPPORTUNITY_TAB_LABELS: Partial<Record<DrawerTabKey, string>> = {
    overview: "Overview",
    communications: "Communications",
    notes: "Notes",
    documents: "Documents",
    activity: "Activity",
};

/** Phase A — stable readonly status from VM; no dropdown on first paint. */
function statusControlReadonlyForFirstPaint(status: StatusControlVm): StatusControlVm {
    if (status.renderAs === "hidden") return status;
    const label = opportunityDrawerVmStatusLabelFromControl(status);
    return { renderAs: "readonly_pill", label };
}

export default function OpportunityDrawerVmRuntime() {
    const { canMutate } = useAdminAuth();
    const { labels } = useEntityLabels();
    const opportunitySingular = labels.opportunities?.singular ?? "Opportunity";
    const {
        drawer,
        closeDrawer,
        isOpportunityDrawerOpening,
        isOpportunityQueueNavPending,
        navigateOpportunityInQueue,
    } = useAdminDrawer();
    const { displayVm, coldLoading, error, suppressFullDrawerLoading, holdPriorPayload } =
        useOpportunityDrawerVmPayload();
    const [drawerTab, setDrawerTab] = useState<DrawerTabKey>("overview");

    useEffect(() => {
        setDrawerTab("overview");
    }, [drawer.id]);

    useEffect(() => {
        if (!displayVm) return;
        logDrawerVmRuntime("render", {
            opportunity_id: displayVm.entity.id,
            drawer_id: drawer.id,
            tab: drawerTab,
        });
    }, [displayVm, drawer.id, drawerTab]);

    const record = displayVm?.above_fold.record ?? null;

    const queuePosition = useMemo(() => {
        if (!drawer.opportunityQueueNavigator || !drawer.id) return null;
        return resolveOpportunityQueueNavigatorPosition(drawer.id, drawer.opportunityQueueNavigator);
    }, [drawer.id, drawer.opportunityQueueNavigator]);

    const drawerTitle = useMemo(() => {
        if (!record) return "Opportunity";
        return formatOpportunityInquiryDrawerTitle(record, opportunitySingular) || opportunitySingular;
    }, [record, opportunitySingular]);

    const headerActions = useMemo(() => {
        if (!displayVm || !drawer.id) return null;
        return (
            <OpportunityDrawerHeaderControls
                opportunityId={drawer.id}
                overviewData={record ?? {}}
                queuePreviewSeed={drawer.opportunityQueuePreviewSeed}
                inquiryWorkflow
                menuActions={displayVm.actions.header}
                showRegistryActions
                canMutate={!!canMutate}
                onActionSelect={() => {}}
                layout="modal-actions"
            />
        );
    }, [canMutate, displayVm, drawer.id, drawer.opportunityQueuePreviewSeed, record]);

    const statusSlot = useMemo(() => {
        const seedLabel = drawer.opportunityQueuePreviewSeed?.statusLabel?.trim();
        const showTargetSeed =
            holdPriorPayload && String(displayVm?.entity.id) !== String(drawer.id);
        if (showTargetSeed && seedLabel) {
            return (
                <VmOpportunityStatusControl
                    status={{ renderAs: "readonly_pill", label: seedLabel }}
                    canMutate={false}
                />
            );
        }
        if (displayVm && !showTargetSeed) {
            return (
                <VmOpportunityStatusControl
                    status={statusControlReadonlyForFirstPaint(displayVm.header.status)}
                    canMutate={false}
                />
            );
        }
        if (seedLabel) {
            return (
                <VmOpportunityStatusControl
                    status={{ renderAs: "readonly_pill", label: seedLabel }}
                    canMutate={false}
                />
            );
        }
        return undefined;
    }, [displayVm, drawer.id, drawer.opportunityQueuePreviewSeed?.statusLabel, holdPriorPayload]);

    const tabs = useMemo((): DrawerTabKey[] => {
        const fromVm = displayVm?.layout.tabs;
        if (fromVm && fromVm.length > 0) return fromVm;
        return OPPORTUNITY_INQUIRY_WORKFLOW_TAB_STRIP;
    }, [displayVm?.layout.tabs]);

    const lifecycleRail = useMemo(() => {
        if (!displayVm || !drawer.id || drawer.id === "new") return null;
        const rec = displayVm.above_fold.record ?? {};
        const currentStatus = String(rec.status_key ?? "").trim() || null;
        const qd = resolveOpportunityDrawerQueueDefinition(displayVm.workspace.queue_definition, {
            allowEnrollmentFallback: true,
        });
        const model = resolveRecordLifecycleRailModel({
            queueDefinition: qd,
            currentStatusKey: currentStatus,
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
        if (!qd) {
            return <RecordLifecycleRailSkeleton stepCount={6} />;
        }
        return null;
    }, [displayVm, drawer.id]);

    const showColdShell = coldLoading && !displayVm && !suppressFullDrawerLoading;

    const onTabSelect = useCallback((tab: DrawerTabKey) => setDrawerTab(tab), []);

    return (
        <Drawer
            isOpen={Boolean(drawer.type && drawer.id) && !isOpportunityDrawerOpening}
            onClose={closeDrawer}
            title={drawerTitle}
            headerSubtitle={displayVm?.header.subtitle ?? undefined}
            headerTitleRight={headerActions ?? undefined}
            statusBadge={statusSlot ?? undefined}
            postTabStrip={displayVm ? lifecycleRail : undefined}
            variant="adminV2"
            presentation="modal"
            panelClassName="max-w-7xl"
            zIndexBackdrop={ADMINV2_DRAWER_BACKDROP_Z}
            zIndexPanel={ADMINV2_DRAWER_PANEL_Z}
            accentColor={DRAWER_ACCENT_OPPORTUNITY}
            recordModalTone="cleaning-v2"
        >
            <div className="relative" data-adminv2-drawer="true" data-drawer-vm-runtime="opportunity">
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
                :   displayVm && record && drawer.id ?
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
                        {drawer.id ?
                            <CommunicationsDrawerBackgroundLoader
                                apiEntityType="opportunities"
                                entityId={drawer.id}
                            />
                        :   null}
                        {drawerTab === "overview" ?
                            <div
                                className="space-y-4"
                                data-adminv2-opportunity-drawer-body="true"
                                data-drawer-vm-runtime-overview="true"
                            >
                                <OpportunityDrawerInquiryWorkflowOverview
                                    displayVm={displayVm}
                                    drawerId={drawer.id}
                                    opportunitySingular={opportunitySingular}
                                    onSelectTab={onTabSelect}
                                />
                            </div>
                        :   <OpportunityDrawerVmTabPanes
                                drawerId={drawer.id}
                                drawerTab={drawerTab}
                                record={record}
                                onSelectTab={onTabSelect}
                            />
                        }
                    </>
                :   null}
            </div>
        </Drawer>
    );
}
