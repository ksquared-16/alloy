"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { DrawerTabKey } from "@/lib/entityPresentation";
import PersonDrawerChildTitleRow from "@/components/admin/entity/PersonDrawerChildTitleRow";
import PersonDrawerHeaderMetadata, {
    formatPersonDrawerRecordNumber,
} from "@/components/admin/entity/PersonDrawerHeaderMetadata";
import PersonDrawerParentTitleRow from "@/components/admin/entity/PersonDrawerParentTitleRow";
import PersonsDrawerVmBody from "@/components/admin/vmDrawer/PersonsDrawerVmBody";
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
import { peekPersonsDrawerDisplayVm } from "@/lib/adminV2/viewModel/drawer/vmRuntime/vmDrawerPayloadPeekSeed";
import { logDrawerVmRuntime } from "@/lib/adminV2/viewModel/drawer/vmRuntime/drawerVmRuntimeLog";
import LayoutRuntimeDrawerShell, { type LayoutRuntimeDrawerTab } from "@/components/layout/LayoutRuntimeDrawerShell";
import LayoutRuntimeDrawerBody from "@/components/layout/LayoutRuntimeDrawerBody";
import { useRecordDrawerLayoutDoc } from "@/lib/layout/runtime/useRecordDrawerLayoutDoc";
import {
    buildChildLayoutRuntimeRecordFromVm,
    buildPersonLayoutRuntimeRecordFromVm,
} from "@/lib/layout/runtime/buildPersonChildLayoutRuntimeRecordFromVm";
import { parseLayoutRefKey } from "@/lib/layout/layoutRefKeyAliases";

const DRAWER_ACCENT_PERSON = "#0d9488";
const DRAWER_ACCENT_CHILD = "#2563eb";

const PERSON_DRAWER_TAB_LABELS: Partial<Record<DrawerTabKey, string>> = {
    overview: "Overview",
    related: "Related",
    documents: "Documents",
    communications: "Communications",
    notes: "Notes",
    activity: "Activity",
};
const PERSON_OPERATING_TABS: DrawerTabKey[] = ["overview", "related", "documents", "communications"];

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
    } =
        useAdminDrawer();
    const [drawerTab, setDrawerTab] = useState<DrawerTabKey>("overview");
    const { displayVm, isChildSurface, coldLoading, error, suppressFullDrawerLoading, holdPriorPayload } =
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

    const vmMatchesRender = useMemo(
        () =>
            displayVm != null &&
            String(displayVm.entity.id) === String(drawerVmRender.id) &&
            drawerVmRender.type === "persons",
        [displayVm, drawerVmRender.id, drawerVmRender.type]
    );

    const committedTitleRef = useRef<ReactNode>(isChildSurface ? "Child" : "Person");

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
            const pinOppId = drawer.personDrawerOpenSeed?.opportunity_id?.trim() || undefined;
            openDrawer({
                type: "persons",
                id: personId,
                source: "person_household_link",
                opportunityWorkspaceContext: drawer.opportunityWorkspaceContext ?? undefined,
                personDrawerOpenSeed: {
                    personId,
                    opportunity_id: pinOppId,
                },
            });
        },
        [drawer.opportunityWorkspaceContext, drawer.personDrawerOpenSeed?.opportunity_id, openDrawer]
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

    const committedVisible =
        vmMatchesRender && Boolean(displayVm && record && layoutVariant);

    const showColdShell =
        coldLoading && !displayVm && !suppressFullDrawerLoading && drawer.type === drawerVmRender.type;

    const hasWarmPayloadOnOpen = useMemo(
        () =>
            drawer.type === "persons" &&
            drawerVmRender.type === "persons" &&
            String(drawer.id) === String(drawerVmRender.id) &&
            peekPersonsDrawerDisplayVm(drawer) != null,
        [drawer, drawerVmRender.type, drawerVmRender.id]
    );

    const drawerOpen =
        Boolean(drawer.type && drawer.id) &&
        drawer.type === "persons" &&
        drawerVmRender.type === "persons" &&
        Boolean(drawerVmRender.id) &&
        (committedVisible || showColdShell || hasWarmPayloadOnOpen);
    const accentColor = isChildSurface ? DRAWER_ACCENT_CHILD : DRAWER_ACCENT_PERSON;
    const defaultTitle = isChildSurface ? "Child" : "Person";

    const statusControl = useMemo(() => {
        if (!committedVisible) return null;
        const label = displayVm?.header.status_label?.trim() || null;
        return (
            <VmPersonStatusControl
                statusLabel={label}
                entityLabel={isChildSurface ? "Child status" : "Person status"}
            />
        );
    }, [committedVisible, displayVm?.header.status_label, isChildSurface]);

    useEffect(() => {
        setDrawerTab("overview");
    }, [drawer.id, chrome]);

    const backLink = useMemo(
        () =>
            resolvePersonDrawerOperatingBackLink(canGoBack, previousDrawer, drawer.openSource, {
                stack,
                drawer,
            }),
        [canGoBack, previousDrawer, drawer, stack]
    );

    const handleBackLink = useCallback(() => {
        if (backLink?.mode === "back_to_lead") {
            goBackToLead();
            return;
        }
        goBack();
    }, [backLink?.mode, goBack, goBackToLead]);

    const drawerTitle = useMemo(() => {
        if (!committedVisible || !record) return committedTitleRef.current;
        const next =
            chrome === "child" ?
                <PersonDrawerChildTitleRow record={record} />
            : chrome === "parent" ?
                <PersonDrawerParentTitleRow record={record} />
            :   displayVm?.header.title ?? defaultTitle;
        committedTitleRef.current = next;
        return next;
    }, [record, chrome, displayVm?.header.title, defaultTitle, committedVisible]);

    const headerSubtitle = useMemo(() => {
        if (!committedVisible || !record) return undefined;
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
                                    onClick={handleBackLink}
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
                backLink={backLink ? { label: backLink.label, onClick: handleBackLink } : null}
                statusSlot={statusControl}
            />
        );
    }, [record, chrome, statusControl, backLink, handleBackLink]);

    // ── Layout Runtime: configured drawer doc + adapter record ──────────────────
    const recordEntityType: "person" | "child" = isChildSurface ? "child" : "person";
    const layoutDoc = useRecordDrawerLayoutDoc(recordEntityType, committedVisible);

    const runtimeRecord = useMemo(() => {
        if (!record || !displayVm) return null;
        const personId = String(displayVm.entity.id);
        return recordEntityType === "child"
            ? buildChildLayoutRuntimeRecordFromVm(record, personId)
            : buildPersonLayoutRuntimeRecordFromVm(record, personId);
    }, [record, displayVm, recordEntityType]);

    /** Persist an inline field edit. VM owns the action: PATCH the person record. */
    const commitPersonField = useCallback(
        async (refKey: string, value: string) => {
            const id = drawer.id?.trim();
            if (!id) return;
            const { fieldKey } = parseLayoutRefKey(refKey);
            if (!fieldKey) return;
            try {
                await fetch(`/api/admin/persons/${id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ [fieldKey]: value }),
                });
            } catch {
                /* surfaced on next refresh; non-blocking */
            }
        },
        [drawer.id]
    );

    const shellTabs = useMemo<LayoutRuntimeDrawerTab[]>(() => {
        if (chrome === "generic") return [{ key: "overview", label: "Overview" }];
        return PERSON_OPERATING_TABS.map((tab) => ({ key: tab, label: PERSON_DRAWER_TAB_LABELS[tab] ?? tab }));
    }, [chrome]);

    /** Body for the active tab — Layout Runtime body (overview) or VM panes (others). */
    const vmBodyFallback =
        committedVisible && displayVm && record && layoutVariant ? (
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
        ) : null;

    const tabBody =
        showColdShell ? (
            <div className="py-12 text-center" data-drawer-vm-runtime-cold-loading="true">
                <p className="text-sm font-medium text-alloy-midnight/75">
                    Loading {isChildSurface ? "child" : "person"}…
                </p>
            </div>
        ) : drawerTab === "overview" && layoutDoc.renderable && layoutDoc.doc && runtimeRecord ? (
            <LayoutRuntimeDrawerBody
                doc={layoutDoc.doc}
                record={runtimeRecord}
                layoutSource={layoutDoc.layoutSource}
                surface={`${recordEntityType}_drawer_overview`}
                fallback={vmBodyFallback}
                onFieldCommit={canMutate ? commitPersonField : undefined}
                editableEntity={recordEntityType}
            />
        ) : (
            vmBodyFallback
        );

    return (
        <Drawer
            isOpen={drawerOpen}
            onClose={closeDrawer}
            title={drawerTitle}
            chromeless
            variant="adminV2"
            presentation="modal"
            panelClassName="max-w-5xl"
            zIndexBackdrop={ADMINV2_DRAWER_BACKDROP_Z}
            zIndexPanel={ADMINV2_DRAWER_PANEL_Z}
            accentColor={accentColor}
            recordModalTone="cleaning-v2"
        >
            <LayoutRuntimeDrawerShell
                title={drawerTitle}
                onClose={closeDrawer}
                statusSlot={statusControl ?? headerSubtitle}
                tabs={shellTabs}
                activeTab={drawerTab}
                onSelectTab={(key) => setDrawerTab(key as DrawerTabKey)}
                surface={`${recordEntityType}_drawer`}
            >
                <div
                    className="relative"
                    data-adminv2-drawer="true"
                    data-drawer-runtime={isChildSurface ? "child-vm" : "person-vm"}
                    data-person-drawer-vm-chrome={chrome}
                    {...(holdPriorPayload ? { "data-drawer-vm-transition-hold": "true" } : {})}
                >
                    {error ? <p className="text-sm text-alloy-ember">{error}</p> : null}
                    {tabBody}
                </div>
            </LayoutRuntimeDrawerShell>
        </Drawer>
    );
}
