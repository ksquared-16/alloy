"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DrawerTabKey } from "@/lib/entityPresentation";
import { usePathname } from "next/navigation";
import PersonDrawerChildTitleRow from "@/components/admin/entity/PersonDrawerChildTitleRow";
import PersonDrawerHeaderMetadata, {
    formatPersonDrawerRecordNumber,
} from "@/components/admin/entity/PersonDrawerHeaderMetadata";
import PersonDrawerParentTitleRow from "@/components/admin/entity/PersonDrawerParentTitleRow";
import PersonsDrawerVmBody, { PersonsDrawerVmTabStrip } from "@/components/admin/vmDrawer/PersonsDrawerVmBody";
import VmPersonStatusControl from "@/components/admin/vmDrawer/VmPersonStatusControl";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import type { AdminDrawerEntityType } from "@/contexts/AdminDrawerContext";
import Drawer, {
    ADMINV2_DRAWER_BACKDROP_Z,
    ADMINV2_DRAWER_PANEL_Z,
} from "@/components/admin/Drawer";
import { resolvePersonDrawerOperatingBackLink } from "@/lib/admin/person/personDrawerBackLink";
import type { PersonDrawerVmChrome } from "@/lib/admin/person/resolvePersonDrawerVmOverviewSections";
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

function resolvePersonDrawerVmChrome(
    displayVm: { surface: string } | null,
    isChildSurface: boolean
): PersonDrawerVmChrome {
    if (!displayVm) return "generic";
    if (isChildSurface || displayVm.surface === "child") return "child";
    if (displayVm.surface === "parent") return "parent";
    return "generic";
}

export default function PersonsDrawerVmRuntime() {
    const pathname = usePathname();
    const { canMutate } = useAdminAuth();
    const { drawer, closeDrawer, openDrawer, canGoBack, previousDrawer, goBack } = useAdminDrawer();
    const [drawerTab, setDrawerTab] = useState<DrawerTabKey>("overview");
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

    const chrome = useMemo(
        () => resolvePersonDrawerVmChrome(displayVm, isChildSurface),
        [displayVm, isChildSurface]
    );

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

    const statusControl = useMemo(() => {
        if (!displayVm?.header.status_label) return null;
        return <VmPersonStatusControl statusLabel={displayVm.header.status_label} />;
    }, [displayVm?.header.status_label]);

    useEffect(() => {
        setDrawerTab("overview");
    }, [drawer.id, chrome]);

    const backLink = useMemo(
        () => resolvePersonDrawerOperatingBackLink(canGoBack, previousDrawer, drawer.openSource),
        [canGoBack, previousDrawer, drawer.openSource]
    );

    const drawerTitle = useMemo(() => {
        if (!record) return displayVm?.header.title ?? defaultTitle;
        if (chrome === "child") return <PersonDrawerChildTitleRow record={record} />;
        if (chrome === "parent") return <PersonDrawerParentTitleRow record={record} />;
        return displayVm?.header.title ?? defaultTitle;
    }, [record, chrome, displayVm?.header.title, defaultTitle]);

    const headerSubtitle = useMemo(() => {
        if (!record) return undefined;
        if (chrome === "child" || chrome === "parent") {
            const recordNum = formatPersonDrawerRecordNumber(record);
            return (
                <div
                    className="mt-0.5"
                    data-person-drawer-header-subtitle={chrome}
                >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-snug text-alloy-midnight/75">
                        {statusControl ?
                            <span className="shrink-0">{statusControl}</span>
                        :   null}
                        {recordNum ?
                            <span className="font-medium text-alloy-midnight/80">{recordNum}</span>
                        :   null}
                        {backLink ?
                            <>
                                {recordNum ?
                                    <span className="text-alloy-midnight/30">·</span>
                                :   null}
                                <button
                                    type="button"
                                    onClick={() => goBack()}
                                    className="text-[12px] font-medium text-alloy-blue hover:underline"
                                    data-record-drawer-back-link="true"
                                >
                                    {backLink.label}
                                </button>
                            </>
                        :   null}
                    </div>
                </div>
            );
        }
        return (
            <PersonDrawerHeaderMetadata
                record={record}
                backLink={backLink ? { label: backLink.label, onClick: () => goBack() } : null}
                statusSlot={statusControl}
            />
        );
    }, [record, chrome, statusControl, backLink, goBack]);

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

    const headerExtra =
        chrome === "parent" || chrome === "child" ?
            <PersonsDrawerVmTabStrip active={drawerTab} onSelect={setDrawerTab} />
        :   undefined;

    return (
        <Drawer
            isOpen={Boolean(drawer.type && drawer.id) && drawer.type === "persons"}
            onClose={closeDrawer}
            title={drawerTitle}
            headerSubtitle={headerSubtitle}
            variant="adminV2"
            presentation="modal"
            panelClassName="max-w-5xl"
            zIndexBackdrop={ADMINV2_DRAWER_BACKDROP_Z}
            zIndexPanel={ADMINV2_DRAWER_PANEL_Z}
            accentColor={accentColor}
            recordModalTone="cleaning-v2"
            runtimeDebug={runtimeDebug}
            statusBadge={chrome === "generic" ? statusControl ?? undefined : undefined}
            headerExtra={headerExtra}
        >
            <div
                className="relative"
                data-adminv2-drawer="true"
                data-drawer-vm-runtime={isChildSurface ? "child" : "person"}
                data-person-drawer-vm-chrome={chrome}
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
                    <PersonsDrawerVmBody
                        displayVm={displayVm}
                        chrome={chrome}
                        layoutVariant={layoutVariant}
                        isChildSurface={isChildSurface}
                        personId={displayVm.entity.id}
                        canMutate={!!canMutate}
                        drawerTab={drawerTab}
                        onSelectTab={setDrawerTab}
                        onOpenDrawer={onOpenDrawer}
                        onOpenLinkedPerson={onOpenLinkedPerson}
                    />
                :   null}
            </div>
        </Drawer>
    );
}
