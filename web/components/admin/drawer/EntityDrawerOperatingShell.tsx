"use client";

/**
 * Shared AdminV2 entity drawer operating shell — platform-owned frame + header host.
 *
 * Wraps `Drawer` + optional `ProofRecordModalHeaderShell` composition (via composedStickyHeader).
 * Entity runtimes supply header content and body children; layouts own scroll-body content only.
 *
 * @see docs/system/drawer-operating-model-v1.md
 */

import type { ReactNode } from "react";
import Drawer, {
    ADMINV2_DRAWER_BACKDROP_Z,
    ADMINV2_DRAWER_PANEL_Z,
} from "@/components/admin/Drawer";
import {
    entityDrawerAccentColor,
    type EntityDrawerOperatingEntity,
} from "@/lib/admin/drawer/entityDrawerOperatingModel";

export type EntityDrawerOperatingShellProps = {
    entity: EntityDrawerOperatingEntity;
    isOpen: boolean;
    onClose: () => void;
    title: ReactNode;
    children: ReactNode;
    /** Layout cutover path — single proof-layout header (tabs, lifecycle container, controls). */
    composedStickyHeader?: ReactNode;
    /** Legacy multi-slot header — used when composedStickyHeader is absent. */
    headerSubtitle?: ReactNode;
    headerTitleCenter?: ReactNode;
    headerTitleRight?: ReactNode;
    panelFooterChrome?: ReactNode;
    panelClassName?: string;
    /** Value for `data-drawer-runtime` on the body wrapper. */
    runtimeDataAttribute: string;
    /** Optional diagnostic attrs on the runtime body wrapper (e.g. drawer subject context). */
    runtimeShellDataAttributes?: Record<string, string | undefined>;
    holdPriorPayload?: boolean;
    /** Layout-owned operational widgets — platform container only. Omitted when null/empty. */
    summaryStrip?: ReactNode;
};

export default function EntityDrawerOperatingShell({
    entity,
    isOpen,
    onClose,
    title,
    children,
    composedStickyHeader,
    headerSubtitle,
    headerTitleCenter,
    headerTitleRight,
    panelFooterChrome,
    panelClassName,
    runtimeDataAttribute,
    runtimeShellDataAttributes,
    holdPriorPayload = false,
    summaryStrip,
}: EntityDrawerOperatingShellProps) {
    const useComposedHeader = composedStickyHeader != null && composedStickyHeader !== false;
    const showSummaryStrip = summaryStrip != null && summaryStrip !== false;
    const resolvedPanelClassName = [
        panelClassName,
        holdPriorPayload ? "adminv2-drawer-panel--swap-hold" : "",
    ]
        .filter(Boolean)
        .join(" ");

    return (
        <Drawer
            isOpen={isOpen}
            onClose={onClose}
            title={title}
            headerSubtitle={useComposedHeader ? undefined : headerSubtitle}
            headerTitleCenter={useComposedHeader ? undefined : headerTitleCenter}
            headerTitleRight={useComposedHeader ? undefined : headerTitleRight}
            composedStickyHeader={useComposedHeader ? composedStickyHeader : undefined}
            panelFooterChrome={panelFooterChrome}
            variant="adminV2"
            presentation="modal"
            panelClassName={resolvedPanelClassName || undefined}
            zIndexBackdrop={ADMINV2_DRAWER_BACKDROP_Z}
            zIndexPanel={ADMINV2_DRAWER_PANEL_Z}
            accentColor={entityDrawerAccentColor(entity)}
            recordModalTone="cleaning-v2"
        >
            <div
                className="relative"
                data-adminv2-drawer="true"
                data-drawer-runtime={runtimeDataAttribute}
                data-entity-drawer-operating-shell={entity}
                {...(holdPriorPayload ? { "data-drawer-vm-transition-hold": "true" } : {})}
                {...runtimeShellDataAttributes}
            >
                <div
                    className="flex min-h-0 flex-col gap-2 bg-white"
                    data-entity-drawer-scroll-body="true"
                >
                    {showSummaryStrip ?
                        <div
                            className="shrink-0 px-0 pb-1 pt-1"
                            data-entity-drawer-summary-strip="true"
                            data-entity-drawer-summary-strip-entity={entity}
                            data-entity-drawer-summary-strip-scrolls="true"
                        >
                            {summaryStrip}
                        </div>
                    :   null}
                    {children}
                </div>
            </div>
        </Drawer>
    );
}
