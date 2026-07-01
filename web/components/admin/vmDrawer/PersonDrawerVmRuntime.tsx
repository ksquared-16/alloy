"use client";

import { useCallback, useMemo } from "react";
import PersonDrawerOperatingSections from "@/components/admin/entity/PersonDrawerOperatingSections";
import VmPersonStatusControl from "@/components/admin/vmDrawer/VmPersonStatusControl";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import type { AdminDrawerEntityType } from "@/contexts/AdminDrawerContext";
import Drawer, {
    ADMINV2_DRAWER_BACKDROP_Z,
    ADMINV2_DRAWER_PANEL_Z,
} from "@/components/admin/Drawer";
import { PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS } from "@/lib/admin/person/personDrawerParentChrome";
import { layoutVariantFromPersonVm } from "@/lib/adminV2/viewModel/drawer/vmRuntime/personDrawerVmLayout";
import { usePersonDrawerVmPayload } from "@/lib/adminV2/viewModel/drawer/vmRuntime/usePersonDrawerVmPayload";

const DRAWER_ACCENT_PERSON = "#0d9488";

export default function PersonDrawerVmRuntime() {
    const { canMutate } = useAdminAuth();
    const { drawer, closeDrawer, openDrawer } = useAdminDrawer();
    const { displayVm, coldLoading, error, suppressFullDrawerLoading } = usePersonDrawerVmPayload();

    const record = displayVm?.record ?? null;
    const layoutVariant = useMemo(
        () => (displayVm ? layoutVariantFromPersonVm(displayVm) : null),
        [displayVm]
    );

    const parentChromeHint = useMemo(() => {
        if (displayVm?.surface !== "parent") return null;
        return { presentation_emphasis: PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS };
    }, [displayVm?.surface]);

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
            title={displayVm?.header.title ?? "Person"}
            headerSubtitle={displayVm?.header.subtitle ?? undefined}
            variant="adminV2"
            presentation="modal"
            panelClassName="max-w-5xl"
            zIndexBackdrop={ADMINV2_DRAWER_BACKDROP_Z}
            zIndexPanel={ADMINV2_DRAWER_PANEL_Z}
            accentColor={DRAWER_ACCENT_PERSON}
            recordModalTone="cleaning-v2"
            statusBadge={
                displayVm ?
                    <VmPersonStatusControl
                        personId={String(displayVm.entity.id)}
                        statusLabel={displayVm.header.status_label}
                        currentStatusKey={String(record?.status_key ?? "").trim()}
                        statusControl={displayVm.header.status}
                        canMutate={!!canMutate}
                    />
                :   undefined
            }
        >
            <div className="relative" data-adminv2-drawer="true" data-drawer-vm-runtime="person">
                {error ?
                    <p className="text-sm text-alloy-ember">{error}</p>
                :   null}
                {showColdShell ?
                    <div className="adminv2-drawer-vm-cold-loading" data-drawer-vm-runtime-cold-loading="true">
                        <p className="text-sm font-medium text-alloy-midnight/75">Loading person…</p>
                    </div>
                :   displayVm && record && layoutVariant ?
                    <div
                        className="space-y-4"
                        data-adminv2-person-drawer-body="true"
                        data-drawer-vm-runtime-overview="true"
                    >
                        <PersonDrawerOperatingSections
                            variant={layoutVariant}
                            record={record}
                            personId={displayVm.entity.id}
                            canMutate={!!canMutate}
                            bodyHydrated
                            parentChromeHint={parentChromeHint}
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
