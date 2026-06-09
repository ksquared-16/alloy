"use client";

import { useCallback, useMemo } from "react";
import PersonDrawerChildLifecycleRail from "@/components/admin/entity/PersonDrawerChildLifecycleRail";
import PersonDrawerOperatingSections from "@/components/admin/entity/PersonDrawerOperatingSections";
import VmPersonStatusControl from "@/components/admin/vmDrawer/VmPersonStatusControl";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import type { AdminDrawerEntityType } from "@/contexts/AdminDrawerContext";
import Drawer, {
    ADMINV2_DRAWER_BACKDROP_Z,
    ADMINV2_DRAWER_PANEL_Z,
} from "@/components/admin/Drawer";
import { PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS } from "@/lib/admin/person/personDrawerChildChrome";
import { layoutVariantFromChildVm } from "@/lib/adminV2/viewModel/drawer/vmRuntime/personDrawerVmLayout";
import { useChildDrawerVmPayload } from "@/lib/adminV2/viewModel/drawer/vmRuntime/useChildDrawerVmPayload";

const DRAWER_ACCENT_CHILD = "#2563eb";

export default function ChildDrawerVmRuntime() {
    const { canMutate } = useAdminAuth();
    const { drawer, closeDrawer, openDrawer } = useAdminDrawer();
    const { displayVm, coldLoading, error, suppressFullDrawerLoading } = useChildDrawerVmPayload();

    const record = displayVm?.record ?? null;
    const layoutVariant = useMemo(
        () => (displayVm ? layoutVariantFromChildVm(displayVm) : null),
        [displayVm]
    );

    const childChromeHint = useMemo(
        () => ({ presentation_emphasis: PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS }),
        []
    );

    const onOpenLinkedPerson = useCallback(
        (personId: string) => {
            openDrawer({
                type: "persons",
                id: personId,
                source: "person_household_link",
                opportunityWorkspaceContext: drawer.opportunityWorkspaceContext ?? undefined,
            });
        },
        [drawer.opportunityWorkspaceContext, openDrawer]
    );

    const onOpenDrawer = useCallback(
        (type: AdminDrawerEntityType, id: string) => {
            openDrawer({
                type,
                id,
                opportunityWorkspaceContext: drawer.opportunityWorkspaceContext ?? undefined,
            });
        },
        [drawer.opportunityWorkspaceContext, openDrawer]
    );

    const showColdShell = coldLoading && !displayVm && !suppressFullDrawerLoading;

    return (
        <Drawer
            isOpen={Boolean(drawer.type && drawer.id) && drawer.type === "persons"}
            onClose={closeDrawer}
            title={displayVm?.header.title ?? "Child"}
            headerSubtitle={displayVm?.header.subtitle ?? undefined}
            variant="adminV2"
            presentation="modal"
            panelClassName="max-w-5xl"
            zIndexBackdrop={ADMINV2_DRAWER_BACKDROP_Z}
            zIndexPanel={ADMINV2_DRAWER_PANEL_Z}
            accentColor={DRAWER_ACCENT_CHILD}
            recordModalTone="cleaning-v2"
            statusBadge={
                displayVm ?
                    <VmPersonStatusControl
                        statusLabel={displayVm.header.status_label}
                        entityLabel="Child status"
                    />
                :   undefined
            }
        >
            <div className="relative" data-adminv2-drawer="true" data-drawer-vm-runtime="child">
                {error ?
                    <p className="text-sm text-alloy-ember">{error}</p>
                :   null}
                {showColdShell ?
                    <div className="py-12 text-center" data-drawer-vm-runtime-cold-loading="true">
                        <p className="text-sm font-medium text-alloy-midnight/75">Loading child…</p>
                    </div>
                :   displayVm && record && layoutVariant ?
                    <div
                        className="space-y-4"
                        data-adminv2-person-drawer-body="true"
                        data-drawer-vm-runtime-overview="true"
                    >
                        <PersonDrawerChildLifecycleRail
                            record={record}
                            chromeHint={childChromeHint}
                            onSelectTab={() => {}}
                        />
                        <PersonDrawerOperatingSections
                            variant={layoutVariant}
                            record={record}
                            personId={displayVm.entity.id}
                            canMutate={!!canMutate}
                            bodyHydrated
                            childChromeHint={childChromeHint}
                            onOpenDrawer={onOpenDrawer}
                            onOpenLinkedPerson={onOpenLinkedPerson}
                            onPersonUpdated={() => {}}
                            onRecordUpdated={() => {}}
                        />
                    </div>
                :   null}
            </div>
        </Drawer>
    );
}
