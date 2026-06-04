"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import CommunicationsDrawerBackgroundLoader from "@/components/admin/communications/CommunicationsDrawerBackgroundLoader";
import CommunicationsDrawerSection from "@/components/admin/communications/CommunicationsDrawerSection";
import { OpportunityDrawerHeaderControls } from "@/components/admin/opportunity/OpportunityDrawerHeaderControls";
import OpportunityDrawerQueueNavigatorControls from "@/components/admin/OpportunityDrawerQueueNavigatorControls";
import VmInquiryRightColumn from "@/components/admin/vmDrawer/VmInquiryRightColumn";
import VmOpportunityStatusControl from "@/components/admin/vmDrawer/VmOpportunityStatusControl";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import Drawer, {
    ADMINV2_DRAWER_BACKDROP_Z,
    ADMINV2_DRAWER_PANEL_Z,
} from "@/components/admin/Drawer";
import { useOpportunityDrawerVmPayload } from "@/lib/adminV2/viewModel/drawer/vmRuntime/useOpportunityDrawerVmPayload";
import { logDrawerVmRuntime } from "@/lib/adminV2/viewModel/drawer/vmRuntime/drawerVmRuntimeLog";
import type { DrawerTabKey } from "@/lib/entityPresentation";
import { resolveOpportunityQueueNavigatorPosition } from "@/lib/admin/opportunityDrawerQueueNavigator";

const DRAWER_ACCENT_OPPORTUNITY = "#2d6a9f";

export default function OpportunityDrawerVmRuntime() {
    const { canMutate } = useAdminAuth();
    const {
        drawer,
        closeDrawer,
        isOpportunityDrawerOpening,
        isOpportunityQueueNavPending,
        navigateOpportunityInQueue,
    } = useAdminDrawer();
    const { displayVm, coldLoading, error, suppressFullDrawerLoading } = useOpportunityDrawerVmPayload();
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
    const inq = displayVm?.above_fold.render_model.inquiry_summary;
    const rightColumn = inq?.right_column ?? null;

    const queuePosition = useMemo(() => {
        if (!drawer.opportunityQueueNavigator || !drawer.id) return null;
        return resolveOpportunityQueueNavigatorPosition(drawer.id, drawer.opportunityQueueNavigator);
    }, [drawer.id, drawer.opportunityQueueNavigator]);

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
        if (!displayVm) return null;
        return (
            <VmOpportunityStatusControl
                status={displayVm.header.status}
                canMutate={!!canMutate}
            />
        );
    }, [canMutate, displayVm]);

    const tabs = displayVm?.layout.tabs ?? (["overview", "communications"] as DrawerTabKey[]);

    const showColdShell = coldLoading && !displayVm && !suppressFullDrawerLoading;

    const onTabSelect = useCallback((tab: DrawerTabKey) => setDrawerTab(tab), []);

    return (
        <Drawer
            isOpen={Boolean(drawer.type && drawer.id) && !isOpportunityDrawerOpening}
            onClose={closeDrawer}
            title={displayVm?.header.title ?? "Opportunity"}
            headerSubtitle={displayVm?.header.subtitle ?? undefined}
            headerTitleRight={headerActions ?? undefined}
            statusBadge={statusSlot ?? undefined}
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
                :   displayVm && record ?
                    <>
                        <div className="mb-3 flex flex-wrap gap-1 border-b border-alloy-stone/15 pb-2">
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
                                >
                                    {tab}
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
                                <div
                                    className={clsx(
                                        "grid gap-3",
                                        inq?.column_mode === "two" ? "md:grid-cols-[1fr_minmax(12rem,16rem)]" : "grid-cols-1"
                                    )}
                                >
                                    <div className="min-w-0 space-y-2 rounded-xl border border-alloy-stone/15 bg-white p-3">
                                        <h3 className="text-sm font-semibold text-alloy-midnight">
                                            {String(record.name ?? record.title ?? "Inquiry")}
                                        </h3>
                                        {displayVm.header.oper_trust_preview?.headline ?
                                            <p className="text-xs text-alloy-midnight/70">
                                                {displayVm.header.oper_trust_preview.headline}
                                            </p>
                                        :   null}
                                    </div>
                                    {rightColumn ?
                                        <VmInquiryRightColumn
                                            model={rightColumn}
                                            reminders={displayVm.summaries.reminders}
                                        />
                                    :   null}
                                </div>
                            </div>
                        :   null}
                        {drawerTab === "communications" && drawer.id ?
                            <div data-drawer-vm-runtime-comms="true">
                                <CommunicationsDrawerSection
                                    apiEntityType="opportunities"
                                    entityId={drawer.id}
                                    embedded
                                    active
                                />
                            </div>
                        :   null}
                    </>
                :   null}
            </div>
        </Drawer>
    );
}
