"use client";

import React, { type CSSProperties, isValidElement, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { shouldCloseAdminV2DrawerOnOutsideTarget } from "@/lib/adminV2/drawerOutsideClick";
import { BOS_ACTION_WORKSPACE_OPEN_ATTR } from "@/lib/bos/bosRailPresentationFlags";
import {
    DRAWER_AVAILABLE_RIGHT_CSS_VAR,
    DRAWER_BACKDROP_LEFT_CSS_VAR,
    DRAWER_COMPUTED_LEFT_CSS_VAR,
    DRAWER_COMPUTED_WIDTH_CSS_VAR,
    isAlloyOsSplitGeometryActive,
    isDrawerGeometryProbeActive,
    measureAndApplyDrawerWorkspaceGeometry,
} from "@/lib/bos/drawerWorkspaceGeometry";
import { ALLOY_OS_RUNTIME_SPLIT_ATTR } from "@/lib/adminV2/runtime/alloyOsRuntimeFlag";
import {
    LAYOUT_RUNTIME_DRAWER_OUTER_BORDER,
    LAYOUT_RUNTIME_DRAWER_OUTER_SHADOW,
} from "@/lib/layout/runtime/layoutRuntimeSurfaceStyles";
import { neutral, derived, palette } from "@/styles/tokens/colors";

/**
 * AdminV2 entity drawer stacking (see docs in sidebar branch below):
 * - Shell chrome (sidebar, top nav) must stay above the dim layer so Settings/links work in one click.
 * - Dim captures pointer events and closes the drawer; underlying workspace must not receive clicks.
 * - Panel is right-docked with an explicit max width — never a full-viewport hit target.
 */
export const ADMINV2_DRAWER_BACKDROP_Z = 60;
export const ADMINV2_DRAWER_PANEL_Z = 70;
/** Registry action modals from VM drawer (create work, tour, send form) — above panel, below shell chrome (100). */
export const ADMINV2_DRAWER_ACTION_MODAL_Z = 80;
/**
 * Scheduling / Inbox workspace BOS modal — above BOS float rail (~91) and rail menus (95),
 * below shell chrome (100). Without this, BOS controls stack over the workspace dialog.
 */
export const ADMINV2_WORKSPACE_BOS_BACKDROP_Z = 96;
export const ADMINV2_WORKSPACE_BOS_PANEL_Z = 97;
/**
 * Dialogs/overlays opened FROM INSIDE a workspace BOS modal that portal to `document.body`
 * (Processing Studio's Alloy dialogs, the form-builder question library). Portaling escapes the
 * shell's stacking context, so anything below the panel (97) / backdrop (96) opens BEHIND the
 * shell — invisible and unclickable, which reads to an operator as "the button does nothing."
 * Any new `document.body` portal launched from inside a BOS modal must use this.
 */
export const ADMINV2_WORKSPACE_BOS_NESTED_OVERLAY_Z = 110;
/** Above drawer panel; below drawer-adjacent modals (z-80+). */
/** Sidebar + top nav — above portaled drawer (panel z-70). */
export const ADMINV2_SHELL_CHROME_Z = 100;
/**
 * Global BOS / Orchestrator command surface (portaled to `document.body`).
 * Above entity drawer panel (70) and drawer popovers (~85); below shell chrome (100).
 */
export const ADMINV2_COMMAND_SURFACE_Z = 90;
/**
 * Floating platform rail menus (Work Unit Actions dropdown, future rail popovers) portaled to
 * `document.body`. Must overlay the BOS command surface (90) so a rail menu is never clipped or
 * covered by the BOS dock; stays below shell chrome (100). Use for any rail-anchored floating
 * menu rather than inline expansion, so opening a menu never reflows the BOS overlay anchor.
 */
export const ADMINV2_RAIL_MENU_Z = 95;
/** Matches `TopNavBar` `h-[3.75rem]`. */
export const ADMINV2_SHELL_HEADER_INSET = "3.75rem";
/** Matches workspace `pb-[96px]` + command surface `bottom-2` lift. */
export const ADMINV2_SHELL_COMMAND_INSET = "6.5rem";

interface DrawerProps {
    isOpen: boolean;
    onClose: () => void;
    title: React.ReactNode;
    /** Optional: muted line under the title (e.g. record number). */
    headerSubtitle?: React.ReactNode;
    /** Optional: right-side controls aligned with title/subtitle row. */
    headerTitleRight?: React.ReactNode;
    /** Optional: center column between record details and headerTitleRight (AdminV2 modal attention). */
    headerTitleCenter?: React.ReactNode;
    /**
     * Optional dense record context between subtitle and status/actions (e.g. workflow chips).
     * Connects header to body without changing entity-specific layout config.
     */
    headerRecordContext?: React.ReactNode;
    children: React.ReactNode;
    /** Optional: status badge shown on second row with actions */
    statusBadge?: React.ReactNode;
    /** Optional: primary action buttons on second row (sticky) */
    headerActions?: React.ReactNode;
    /** Optional: strip below actions row (e.g. workspace-style signal cards). Only body scrolls. */
    headerSignals?: React.ReactNode;
    /** Optional: sticky content below title/actions/signals (e.g. tabs). Only body scrolls. */
    headerExtra?: React.ReactNode;
    /** Optional: compact strip below tab row (e.g. lifecycle rail). Only body scrolls. */
    postTabStrip?: React.ReactNode;
    /** Optional: fixed overlays (action modals) — rendered in panel shell above scroll body. */
    overlayChildren?: React.ReactNode;
    /** Optional: use higher z-index when stacking drawers (e.g. 60/70) */
    zIndexBackdrop?: number;
    zIndexPanel?: number;
    /** Optional: 4px left accent border color (e.g. "rgb(0,69,140)") */
    accentColor?: string;
    /** Admin V2 workspace token surface (matches `WorkUnitWorkspace` / workspace.css variables). */
    variant?: "legacy" | "adminV2";
    /**
     * `sidebar`: docked right (default Admin V2 entity drawer).
     * `modal`: centered record workspace overlay (Admin V2 jobs).
     */
    presentation?: "sidebar" | "modal";
    /** Panel width (Tailwind). Default `max-w-2xl`; use `max-w-3xl` for wider record drawers. */
    panelClassName?: string;
    /**
     * Optional ambient styling for Admin V2 centered record modal only (visual system alignment).
     * Does not affect sidebar drawers or behavior.
     */
    recordModalTone?: "cleaning-v2";
    /**
     * CSS variables from `recordSurfaceContextStyle` — aligns modal chrome with workspace operational context.
     */
    recordModalContextStyle?: CSSProperties;
    /**
     * Optional diagnostics node accepted for caller compatibility (e.g. legacy
     * drawer). Type-only: not rendered here, so behavior is unchanged.
     */
    runtimeDebug?: React.ReactNode;
    /**
     * When set (AdminV2 modal + layout cutover), replaces the default multi-slot
     * header with a single proof-layout header composition.
     */
    composedStickyHeader?: React.ReactNode;
    /**
     * Fixed footer chrome inside the drawer panel (below scroll body) — e.g. floating save bar.
     */
    panelFooterChrome?: React.ReactNode;
    /** Alloy OS Focus Panel — docked peer column (geometry only; content from runtime). */
    focusPanelPresentation?: boolean;
}

export default function Drawer({
    isOpen,
    onClose,
    title,
    headerSubtitle,
    headerTitleRight,
    headerTitleCenter,
    headerRecordContext,
    statusBadge,
    headerActions,
    headerSignals,
    headerExtra,
    postTabStrip,
    overlayChildren,
    children,
    zIndexBackdrop = 40,
    zIndexPanel = 50,
    accentColor,
    variant = "legacy",
    presentation = "sidebar",
    panelClassName,
    recordModalTone,
    recordModalContextStyle,
    composedStickyHeader,
    panelFooterChrome,
    focusPanelPresentation = false,
}: DrawerProps) {
    const [portalReady, setPortalReady] = useState(false);
    useEffect(() => {
        setPortalReady(true);
    }, []);

    const isV2Early = variant === "adminV2";
    const bosWorkspaceDrawerLayoutEarly = isV2Early;

    useLayoutEffect(() => {
        if (!isOpen || !bosWorkspaceDrawerLayoutEarly || !portalReady) return;
        if (isDrawerGeometryProbeActive()) return;
        measureAndApplyDrawerWorkspaceGeometry();
    }, [isOpen, bosWorkspaceDrawerLayoutEarly, portalReady]);

    useEffect(() => {
        if (!isOpen || !bosWorkspaceDrawerLayoutEarly) return;
        const root = document.documentElement;
        const remeasure = () => {
            if (isDrawerGeometryProbeActive()) return;
            if (root.getAttribute(BOS_ACTION_WORKSPACE_OPEN_ATTR) === "true") return;
            measureAndApplyDrawerWorkspaceGeometry(root);
        };
        const mo = new MutationObserver(remeasure);
        mo.observe(root, {
            attributes: true,
            attributeFilter: [BOS_ACTION_WORKSPACE_OPEN_ATTR, ALLOY_OS_RUNTIME_SPLIT_ATTR],
        });
        return () => mo.disconnect();
    }, [isOpen, bosWorkspaceDrawerLayoutEarly]);

    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "";
        }
        return () => {
            document.body.style.overflow = "";
        };
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [isOpen, onClose]);

    /** Admin V2 fallback: outside mousedown when backdrop does not cover target (command bar excluded). */
    useEffect(() => {
        if (!isOpen || variant !== "adminV2") return;
        const onMouseDown = (e: MouseEvent) => {
            const target = e.target;
            if (target instanceof Element && target.closest(".adminv2-drawer-backdrop-hit")) return;
            if (!shouldCloseAdminV2DrawerOnOutsideTarget(target, {
                alloyOsSplitActive: isAlloyOsSplitGeometryActive(),
            })) return;
            e.preventDefault();
            e.stopPropagation();
            onClose();
        };
        document.addEventListener("mousedown", onMouseDown, true);
        return () => document.removeEventListener("mousedown", onMouseDown, true);
    }, [isOpen, onClose, variant]);

    const closeOnBackdropMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target !== e.currentTarget) return;
        e.preventDefault();
        e.stopPropagation();
        onClose();
    };

    if (!isOpen) return null;

    const titleContent: React.ReactNode =
        title != null && (typeof title === "string" || typeof title === "number" || isValidElement(title))
            ? title
            : "—";

    const isV2 = variant === "adminV2";
    const isModal = isV2 && presentation === "modal";
    const bosWorkspaceDrawerLayout = isV2;
    const workspaceDrawerPanelStyle: CSSProperties | undefined = bosWorkspaceDrawerLayout ?
        {
            left: `var(${DRAWER_COMPUTED_LEFT_CSS_VAR})`,
            width: `var(${DRAWER_COMPUTED_WIDTH_CSS_VAR})`,
            maxWidth: `var(${DRAWER_COMPUTED_WIDTH_CSS_VAR})`,
            transform: "none",
            right: "auto",
        }
    :   undefined;
    const workspaceDrawerBackdropStyle: CSSProperties | undefined = bosWorkspaceDrawerLayout ?
        {
            left: `var(${DRAWER_BACKDROP_LEFT_CSS_VAR})`,
            right: 0,
        }
    :   undefined;
    const cleaningRecordModalTone = isModal && recordModalTone === "cleaning-v2";
    const bosModalDrawerLayout = bosWorkspaceDrawerLayout && isModal;
    const leftAccent = accentColor ?? (isV2 ? palette.midnightForge : undefined);

    const panelStyle: CSSProperties = isModal
        ? {
              zIndex: zIndexPanel,
              backgroundColor: neutral.surface,
              color: neutral.textPrimary,
              borderTopColor: isV2 ? LAYOUT_RUNTIME_DRAWER_OUTER_BORDER : derived.border,
              borderRightColor: isV2 ? LAYOUT_RUNTIME_DRAWER_OUTER_BORDER : derived.border,
              borderBottomColor: isV2 ? LAYOUT_RUNTIME_DRAWER_OUTER_BORDER : derived.border,
              borderLeftColor: isV2 ? LAYOUT_RUNTIME_DRAWER_OUTER_BORDER : derived.border,
              boxShadow: cleaningRecordModalTone ? LAYOUT_RUNTIME_DRAWER_OUTER_SHADOW : derived.cardShadow,
              ...(workspaceDrawerPanelStyle ?? {}),
          }
        : {
              zIndex: zIndexPanel,
              ...(workspaceDrawerPanelStyle ?? {}),
              ...(isV2
                  ? {
                        backgroundColor: neutral.surface,
                        color: neutral.textPrimary,
                        borderTopColor: LAYOUT_RUNTIME_DRAWER_OUTER_BORDER,
                        borderRightColor: LAYOUT_RUNTIME_DRAWER_OUTER_BORDER,
                        borderBottomColor: LAYOUT_RUNTIME_DRAWER_OUTER_BORDER,
                        borderLeftColor: leftAccent ?? palette.midnightForge,
                        borderLeftWidth: 4,
                        borderLeftStyle: "solid",
                    }
                  : accentColor
                    ? { borderLeftWidth: 4, borderLeftStyle: "solid", borderLeftColor: accentColor }
                    : {}),
          };

    const modalBodyBg: CSSProperties | undefined =
        isModal && isV2
            ? cleaningRecordModalTone
                ? {
                      backgroundColor: "#ffffff",
                      color: neutral.textPrimary,
                  }
                : {
                      background: `linear-gradient(180deg, ${palette.riverStone} 0%, color-mix(in srgb, ${palette.riverStone} 88%, ${derived.canvasFieldDepth}) 100%)`,
                      color: neutral.textPrimary,
                  }
            : isV2
              ? { backgroundColor: "#ffffff", color: neutral.textPrimary }
              : undefined;

    const hasHeaderTitleRight = headerTitleRight != null && headerTitleRight !== false;
    const hasHeaderTitleCenter = headerTitleCenter != null && headerTitleCenter !== false;
    const usesThreeColumnHeader = hasHeaderTitleRight && hasHeaderTitleCenter;
    const usesTitleRailHeader = hasHeaderTitleRight && !usesThreeColumnHeader;

    const subtitleTypographyClass =
        cleaningRecordModalTone
            ? "mt-1.5 text-[13px] font-normal leading-snug"
            : usesThreeColumnHeader
              ? "mt-0.5 text-sm font-medium leading-snug"
              : `mt-1 text-sm font-medium ${isV2 ? "" : "text-alloy-midnight/55"}`;

    const subtitleStyle =
        isV2 && headerSubtitle != null && headerSubtitle !== false
            ? {
                  color: derived.textSecondary,
                  ...(cleaningRecordModalTone ? { opacity: 0.88 } : {}),
              }
            : undefined;

    /** Rich ReactNode subtitles must not be wrapped in <p> — avoids invalid nesting (e.g. div inside p). */
    const renderHeaderSubtitle = () => {
        if (headerSubtitle == null || headerSubtitle === false) return null;
        const isPlainText =
            typeof headerSubtitle === "string" || typeof headerSubtitle === "number";
        if (isPlainText) {
            return (
                <p className={subtitleTypographyClass} style={subtitleStyle}>
                    {headerSubtitle}
                </p>
            );
        }
        return (
            <div className={subtitleTypographyClass} style={subtitleStyle}>
                {headerSubtitle}
            </div>
        );
    };

    const hasHeaderSignals = headerSignals != null && headerSignals !== false;

    const closeButton = (
        <button
            type="button"
            onClick={onClose}
            className={`shrink-0 text-2xl leading-none transition-colors p-1 ${isV2 ? "" : "text-alloy-midnight/70 hover:text-alloy-forge"}`}
            style={isV2 ? { color: derived.textSecondary } : undefined}
            aria-label="Close"
        >
            ×
        </button>
    );

    const headerBlock = composedStickyHeader ? (
        <>
            <div
                className={`sticky top-0 ${isV2 ? "z-20" : "z-10"} shrink-0 ${cleaningRecordModalTone ? "border-b border-solid" : `border-b ${isV2 ? "" : "border-admin-border bg-admin-surface-card"}`}`}
                style={
                    isV2
                        ? {
                              ...(cleaningRecordModalTone
                                  ? {
                                        backgroundColor: "var(--vc-drawer-header-bg, #ffffff)",
                                        borderBottomColor: derived.border,
                                    }
                                  : {
                                        backgroundColor: neutral.surface,
                                        borderBottomColor: derived.border,
                                    }),
                          }
                        : undefined
                }
                data-drawer-composed-sticky-header="true"
            >
                {composedStickyHeader}
            </div>
            {overlayChildren != null && overlayChildren !== false ?
                <div className="relative shrink-0" data-adminv2-drawer-overlay-host="true">
                    {overlayChildren}
                </div>
            :   null}
            <div
                data-adminv2-record-modal-scroll
                className={`relative flex-1 overflow-y-auto min-h-0 ${isModal ? (cleaningRecordModalTone ? "px-4 py-2.5 sm:px-5 sm:py-3.5" : "px-4 py-3 sm:px-5 sm:py-4") : "p-6"} ${isV2 ? "[scrollbar-gutter:stable]" : "bg-admin-surface-card"}`}
                style={modalBodyBg}
            >
                {children}
            </div>
            {panelFooterChrome != null && panelFooterChrome !== false ?
                <div className="shrink-0 overflow-visible" data-adminv2-drawer-panel-footer="true">
                    {panelFooterChrome}
                </div>
            :   null}
        </>
    ) : (
        <>
            <div
                className={`sticky top-0 ${isV2 ? "z-20" : "z-10"} shrink-0 ${cleaningRecordModalTone ? "border-b border-solid" : `border-b ${isV2 ? "" : "border-admin-border bg-admin-surface-card"}`}`}
                style={
                    isV2
                        ? {
                              ...(cleaningRecordModalTone
                                  ? {
                                        backgroundColor: "var(--vc-drawer-header-bg, #ffffff)",
                                        borderBottomColor: derived.border,
                                    }
                                  : {
                                        backgroundColor: neutral.surface,
                                        borderBottomColor: derived.border,
                                    }),
                          }
                        : undefined
                }
            >
                <div
                    className={`${
                        usesThreeColumnHeader
                            ? cleaningRecordModalTone
                                ? "px-6 pt-3 pb-1"
                                : "px-6 pt-3 pb-1"
                            : cleaningRecordModalTone
                              ? "px-6 pt-3 pb-0.5"
                              : "px-6 pt-4 pb-2"
                    } ${
                        usesThreeColumnHeader
                            ? "flex flex-wrap items-start gap-x-3 gap-y-1"
                            : usesTitleRailHeader
                              ? "flex items-start justify-between gap-4"
                              : ""
                    }`}
                    data-drawer-header-title-row={usesThreeColumnHeader ? "three-column" : usesTitleRailHeader ? "two-column" : undefined}
                >
                    <div
                        className={
                            usesThreeColumnHeader
                                ? "min-w-0 shrink-0 basis-auto max-w-[min(100%,17rem)] sm:max-w-[20rem]"
                                : usesTitleRailHeader
                                  ? "min-w-0 flex-1"
                                  : ""
                        }
                        data-drawer-header-title-left="true"
                    >
                        <h2
                            id={isModal ? "admin-drawer-title" : undefined}
                            className={
                                cleaningRecordModalTone
                                    ? "text-[1.375rem] sm:text-2xl font-semibold tracking-tight leading-[1.2] break-words text-[rgb(39,63,82)]"
                                    : `text-xl font-bold leading-snug break-words ${isV2 ? "" : "text-alloy-forge"}`
                            }
                            style={isV2 && !cleaningRecordModalTone ? { color: neutral.textPrimary } : undefined}
                        >
                            {titleContent}
                        </h2>
                        {renderHeaderSubtitle()}
                    </div>
                    {usesThreeColumnHeader ? (
                        <div className="min-w-0 flex-1" data-drawer-header-title-center="true">
                            {headerTitleCenter}
                        </div>
                    ) : null}
                    {hasHeaderTitleRight ? (
                        <div
                            className={`flex shrink-0 items-start gap-3 ${cleaningRecordModalTone ? "py-0.5" : ""}`}
                            data-drawer-header-title-right="true"
                        >
                            {headerTitleRight}
                            {closeButton}
                        </div>
                    ) : null}
                </div>
                {headerRecordContext != null && headerRecordContext !== false && (
                    <div
                        data-adminv2-drawer-header-record-context
                        className={`border-t border-b px-6 ${cleaningRecordModalTone ? "py-1.5" : "py-1"} ${cleaningRecordModalTone ? "border-[var(--vc-drawer-hairline,rgba(39,63,82,0.12))] bg-[color-mix(in_srgb,var(--vc-drawer-header-bg,#fff)_92%,rgba(39,63,82,0.04))]" : "border-alloy-stone/15 bg-alloy-stone/[0.035]"}`}
                        style={
                            isV2 && !cleaningRecordModalTone
                                ? {
                                      borderTopColor: derived.border,
                                      borderBottomColor: derived.border,
                                      backgroundColor: "rgba(246, 248, 252, 0.65)",
                                  }
                                : undefined
                        }
                    >
                        {headerRecordContext}
                    </div>
                )}
                {headerTitleRight == null || headerTitleRight === false ? (
                    <div
                        className={`px-6 flex items-center justify-between ${cleaningRecordModalTone ? "py-1 pb-2 gap-2" : "pb-4 gap-4"}`}
                    >
                        <div className={`flex items-center min-w-0 ${cleaningRecordModalTone ? "gap-2" : "gap-3"}`}>
                            {statusBadge != null && statusBadge !== false && statusBadge}
                            {headerActions}
                        </div>
                        {closeButton}
                    </div>
                ) : null}
                {headerSignals != null && headerSignals !== false && (
                    <div
                        data-adminv2-record-modal-signals-wrap
                        className={`px-6 ${cleaningRecordModalTone ? "pb-0 pt-0 -mb-1.5" : "pb-3"}`}
                        style={
                            isV2
                                ? {
                                      borderBottomWidth: cleaningRecordModalTone ? 0 : 1,
                                      borderBottomStyle: "solid",
                                      borderBottomColor: derived.border,
                                      backgroundColor: cleaningRecordModalTone
                                          ? "transparent"
                                          : undefined,
                                  }
                                : undefined
                        }
                    >
                        {headerSignals}
                    </div>
                )}
                {headerExtra != null && headerExtra !== false && (
                    <div
                        data-adminv2-record-modal-tabs-wrap
                        className={`px-6 ${
                            cleaningRecordModalTone
                                ? hasHeaderSignals
                                    ? "pb-0 pt-0 -mt-1"
                                    : "pb-0 pt-1"
                                : usesThreeColumnHeader
                                  ? "pb-0 pt-0"
                                  : "pb-1 pt-0"
                        } ${cleaningRecordModalTone ? "border-t border-solid" : `border-t ${isV2 ? "" : "border-admin-border border-t-alloy-blue/30"}`}`}
                        style={
                            isV2
                                ? {
                                      borderTopColor: derived.border,
                                      backgroundColor: cleaningRecordModalTone ? neutral.surface : undefined,
                                  }
                                : undefined
                        }
                    >
                        {headerExtra}
                    </div>
                )}
                {postTabStrip != null && postTabStrip !== false && (
                    <div
                        data-adminv2-record-modal-post-tab-strip
                        className={`px-6 ${cleaningRecordModalTone ? "pb-2 pt-0" : "pb-2 pt-0"}`}
                        style={
                            isV2 && cleaningRecordModalTone
                                ? { backgroundColor: neutral.surface }
                                : undefined
                        }
                    >
                        {postTabStrip}
                    </div>
                )}
            </div>
            {overlayChildren != null && overlayChildren !== false ?
                <div className="relative shrink-0" data-adminv2-drawer-overlay-host="true">
                    {overlayChildren}
                </div>
            :   null}
            <div
                data-adminv2-record-modal-scroll
                className={`flex-1 overflow-y-auto min-h-0 ${isModal ? (cleaningRecordModalTone ? "px-4 py-2.5 sm:px-5 sm:py-3.5" : "px-4 py-3 sm:px-5 sm:py-4") : "p-6"} ${isV2 ? "[scrollbar-gutter:stable]" : "bg-admin-surface-card"}`}
                style={modalBodyBg}
            >
                {children}
            </div>
        </>
    );

    const drawerLayer =
        isModal ? (
            <>
                <div
                    className={`adminv2-drawer-backdrop-hit adminv2-drawer-modal-dim pointer-events-auto fixed transition-opacity duration-200 ${
                        bosWorkspaceDrawerLayout ?
                            "adminv2-drawer-workspace-backdrop-band"
                        :   "inset-0 bg-black/40 backdrop-blur-[2px]"
                    }`}
                    style={{
                        zIndex: zIndexBackdrop,
                        ...(workspaceDrawerBackdropStyle ?? {}),
                    }}
                    aria-hidden
                    onMouseDown={closeOnBackdropMouseDown}
                />
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="admin-drawer-title"
                    data-adminv2-drawer="true"
                    data-adminv2-record-modal="true"
                    data-adminv2-record-modal-tone={cleaningRecordModalTone ? "cleaning-v2" : undefined}
                    data-alloy-os-focus-panel-docked={focusPanelPresentation ? "true" : undefined}
                    className={`adminv2-drawer-modal-panel adminv2-drawer-shell-inset pointer-events-auto fixed flex max-h-[min(920px,100%)] flex-col overflow-hidden rounded-2xl border border-solid shadow-2xl animate-in fade-in zoom-in-[0.99] duration-300 ${bosModalDrawerLayout ? "adminv2-drawer-modal-panel--bos-rail" : "left-1/2 w-[min(calc(100vw-1.5rem),80rem)] -translate-x-1/2"} ${cleaningRecordModalTone ? "min-h-[min(520px,50%)]" : ""} ${bosModalDrawerLayout ? "" : (panelClassName ?? "max-w-5xl")}`}
                    style={
                        cleaningRecordModalTone && recordModalContextStyle
                            ? { ...recordModalContextStyle, ...panelStyle, zIndex: zIndexPanel }
                            : { ...panelStyle, zIndex: zIndexPanel }
                    }
                >
                    {headerBlock}
                </div>
            </>
        ) : (
            <>
                <div
                    className={`adminv2-drawer-backdrop-hit adminv2-drawer-sidebar-dim pointer-events-auto fixed ${
                        bosWorkspaceDrawerLayout ?
                            "adminv2-drawer-workspace-backdrop-band"
                        :   "inset-0 bg-black/50"
                    }`}
                    style={{
                        zIndex: zIndexBackdrop,
                        ...(workspaceDrawerBackdropStyle ?? {}),
                    }}
                    aria-hidden
                    onMouseDown={closeOnBackdropMouseDown}
                />
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="admin-drawer-title"
                    data-adminv2-drawer={isV2 ? "true" : undefined}
                    className={`adminv2-drawer-sidebar-panel pointer-events-auto fixed flex flex-col border shadow-xl ${bosWorkspaceDrawerLayout ? "left-auto" : "left-auto right-0 w-[min(100vw,42rem)] max-w-2xl"} ${isV2 ? "adminv2-drawer-shell-inset border-solid" : "inset-y-0"} ${panelClassName ?? ""} ${
                        isV2 ? "" : `bg-admin-surface-card border-admin-border ${accentColor ? "" : "border-l-4 border-alloy-blue/40"}`
                    }`}
                    style={panelStyle}
                >
                    {headerBlock}
                </div>
            </>
        );

    if (!portalReady || typeof document === "undefined") {
        return null;
    }
    return createPortal(drawerLayer, document.body);
}
