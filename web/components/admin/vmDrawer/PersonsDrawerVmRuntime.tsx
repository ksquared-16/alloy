"use client";

import { useCallback, useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
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
import { PERSON_DRAWER_GUARDIAN_PRESENTATION_EMPHASIS } from "@/lib/admin/person/personDrawerParentChrome";
import {
    layoutVariantFromChildVm,
    layoutVariantFromPersonVm,
} from "@/lib/adminV2/viewModel/drawer/vmRuntime/personDrawerVmLayout";
import { usePersonsDrawerVmPayload } from "@/lib/adminV2/viewModel/drawer/vmRuntime/usePersonsDrawerVmPayload";
import { logDrawerVmRuntime } from "@/lib/adminV2/viewModel/drawer/vmRuntime/drawerVmRuntimeLog";
import {
    drawerDebugSourceFromPathname,
    drawerDebugSurfaceFromPresentation,
} from "@/lib/adminV2/drawer/drawerRuntimeDebug";

const DRAWER_ACCENT_PERSON = "#0d9488";
const DRAWER_ACCENT_CHILD = "#2563eb";

export default function PersonsDrawerVmRuntime() {
    const pathname = usePathname();
    const { canMutate } = useAdminAuth();
    const { drawer, closeDrawer, openDrawer } = useAdminDrawer();
    const { displayVm, isChildSurface, coldLoading, error, suppressFullDrawerLoading } =
        usePersonsDrawerVmPayload();

    useEffect(() => {
        if (!displayVm) return;
        logDrawerVmRuntime("render", {
            person_id: displayVm.entity.id,
            drawer_id: drawer.id,
            runtime: isChildSurface ? "child" : "person",
        });
    }, [displayVm, drawer.id, isChildSurface]);

    const record = displayVm?.record ?? null;
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

    const childChromeHint = useMemo(
        () => ({ presentation_emphasis: PERSON_DRAWER_CHILD_PRESENTATION_EMPHASIS }),
        []
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
    const accentColor = isChildSurface ? DRAWER_ACCENT_CHILD : DRAWER_ACCENT_PERSON;
    const defaultTitle = isChildSurface ? "Child" : "Person";

    const runtimeDebug = useMemo(
        () =>
            drawer.type && drawer.id ?
                {
                    route: isChildSurface ? ("child-vm" as const) : ("person-vm" as const),
                    surface: drawerDebugSurfaceFromPresentation("modal"),
                    source: drawerDebugSourceFromPathname(pathname),
                    path: pathname ?? "",
                    entityType: drawer.type,
                    entityId: String(drawer.id),
                    statusComponent: "unknown" as const,
                }
            :   null,
        [drawer.type, drawer.id, isChildSurface, pathname]
    );

    return (
        <Drawer
            isOpen={Boolean(drawer.type && drawer.id) && drawer.type === "persons"}
            onClose={closeDrawer}
            title={displayVm?.header.title ?? defaultTitle}
            headerSubtitle={displayVm?.header.subtitle ?? undefined}
            variant="adminV2"
            presentation="modal"
            panelClassName="max-w-5xl"
            zIndexBackdrop={ADMINV2_DRAWER_BACKDROP_Z}
            zIndexPanel={ADMINV2_DRAWER_PANEL_Z}
            accentColor={accentColor}
            recordModalTone="cleaning-v2"
            runtimeDebug={runtimeDebug}
            statusBadge={
                displayVm ?
                    <VmPersonStatusControl statusLabel={displayVm.header.status_label} />
                :   undefined
            }
        >
            <div
                className="relative"
                data-adminv2-drawer="true"
                data-drawer-vm-runtime={isChildSurface ? "child" : "person"}
            >
                {error ?
                    <p className="text-sm text-alloy-ember">{error}</p>
                :   null}
                {showColdShell ?
                    <div className="py-12 text-center" data-drawer-vm-runtime-cold-loading="true">
                        <p className="text-sm font-medium text-alloy-midnight/75">
                            Loading {isChildSurface ? "child" : "person"}…
                        </p>
                    </div>
                :   displayVm && record && layoutVariant ?
                    <div
                        className="space-y-4"
                        data-adminv2-person-drawer-body="true"
                        data-drawer-vm-runtime-overview="true"
                    >
                        {isChildSurface ?
                            <PersonDrawerChildLifecycleRail
                                record={record}
                                chromeHint={childChromeHint}
                                onSelectTab={() => {}}
                            />
                        :   null}
                        <PersonDrawerOperatingSections
                            variant={layoutVariant}
                            record={record}
                            personId={displayVm.entity.id}
                            canMutate={!!canMutate}
                            bodyHydrated
                            childChromeHint={isChildSurface ? childChromeHint : null}
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
