"use client";

import React, { type CSSProperties, isValidElement, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { shouldCloseAdminV2DrawerOnOutsideTarget } from "@/lib/adminV2/drawerOutsideClick";
import { neutral, derived, palette } from "@/styles/tokens/colors";

/**
 * AdminV2 entity drawer stacking (see docs in sidebar branch below):
 * - Shell chrome (sidebar, top nav) must stay above the dim layer so Settings/links work in one click.
 * - Dim is pointer-events-none so workspace routes under the panel receive clicks.
 * - Panel is right-docked with an explicit max width — never a full-viewport hit target.
 */
export const ADMINV2_DRAWER_BACKDROP_Z = 60;
export const ADMINV2_DRAWER_PANEL_Z = 70;
/** Above drawer panel; below drawer-adjacent modals (z-80+). */
/** Sidebar + top nav — above portaled drawer (panel z-70). */
export const ADMINV2_SHELL_CHROME_Z = 100;
/**
 * Global BOS / Orchestrator command surface (portaled to `document.body`).
 * Above entity drawer panel (70) and drawer popovers (~85); below shell chrome (100).
 */
export const ADMINV2_COMMAND_SURFACE_Z = 90;
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
}

export default function Drawer({
    isOpen,
    onClose,
    title,
    headerSubtitle,
    headerTitleRight,
    headerRecordContext,
    statusBadge,
    headerActions,
    headerSignals,
    headerExtra,
    children,
    zIndexBackdrop = 40,
    zIndexPanel = 50,
    accentColor,
    variant = "legacy",
    presentation = "sidebar",
    panelClassName,
    recordModalTone,
    recordModalContextStyle,
}: DrawerProps) {
    const [portalReady, setPortalReady] = useState(false);
    useEffect(() => {
        setPortalReady(true);
    }, []);

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

    /** Admin V2: dim stays pointer-events-none; close on outside mousedown (command bar excluded). */
    useEffect(() => {
        if (!isOpen || variant !== "adminV2") return;
        const onMouseDown = (e: MouseEvent) => {
            if (!shouldCloseAdminV2DrawerOnOutsideTarget(e.target)) return;
            onClose();
        };
        document.addEventListener("mousedown", onMouseDown);
        return () => document.removeEventListener("mousedown", onMouseDown);
    }, [isOpen, onClose, variant]);

    if (!isOpen) return null;

    const titleContent: React.ReactNode =
        title != null && (typeof title === "string" || typeof title === "number" || isValidElement(title))
            ? title
            : "—";

    const isV2 = variant === "adminV2";
    const isModal = isV2 && presentation === "modal";
    const cleaningRecordModalTone = isModal && recordModalTone === "cleaning-v2";
    const leftAccent = accentColor ?? (isV2 ? palette.midnightForge : undefined);

    const panelStyle: CSSProperties = isModal
        ? {
              zIndex: zIndexPanel,
              backgroundColor: neutral.surface,
              color: neutral.textPrimary,
              borderTopColor: derived.border,
              borderRightColor: derived.border,
              borderBottomColor: derived.border,
              borderLeftColor: cleaningRecordModalTone && recordModalContextStyle
                  ? "var(--vc-record-rim)"
                  : derived.border,
              boxShadow: cleaningRecordModalTone
                  ? "0 12px 40px rgba(39, 63, 82, 0.1), 0 2px 8px rgba(39, 63, 82, 0.04)"
                  : derived.cardShadow,
              ...(cleaningRecordModalTone && recordModalContextStyle
                  ? {
                        borderLeftWidth: 3,
                        borderLeftStyle: "solid",
                    }
                  : {}),
          }
        : {
              zIndex: zIndexPanel,
              ...(isV2
                  ? {
                        backgroundColor: neutral.surface,
                        color: neutral.textPrimary,
                        borderTopColor: derived.border,
                        borderRightColor: derived.border,
                        borderBottomColor: derived.border,
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
                      backgroundColor: neutral.background,
                      color: neutral.textPrimary,
                  }
                : {
                      background: `linear-gradient(180deg, ${palette.riverStone} 0%, color-mix(in srgb, ${palette.riverStone} 88%, ${derived.canvasFieldDepth}) 100%)`,
                      color: neutral.textPrimary,
                  }
            : isV2
              ? { backgroundColor: neutral.background, color: neutral.textPrimary }
              : undefined;

    const subtitleTypographyClass =
        cleaningRecordModalTone
            ? "mt-1.5 text-[13px] font-normal leading-snug"
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

    const headerBlock = (
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
                                        borderRightWidth: 3,
                                        borderRightStyle: "solid",
                                        borderRightColor: "var(--vc-header-rail-accent)",
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
                    className={`${cleaningRecordModalTone ? "px-6 pt-3.5 pb-1" : "px-6 pt-4 pb-2"} ${
                        headerTitleRight != null && headerTitleRight !== false ? "flex items-start justify-between gap-4" : ""
                    }`}
                >
                    <div className={headerTitleRight != null && headerTitleRight !== false ? "min-w-0 flex-1" : ""}>
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
                    {headerTitleRight != null && headerTitleRight !== false ? (
                        <div
                            className={`flex shrink-0 items-start gap-3 ${cleaningRecordModalTone ? "py-0.5" : ""}`}
                        >
                            {headerTitleRight}
                            <button
                                type="button"
                                onClick={onClose}
                                className={`shrink-0 text-2xl leading-none transition-colors p-1 ${isV2 ? "" : "text-alloy-midnight/70 hover:text-alloy-forge"}`}
                                style={isV2 ? { color: derived.textSecondary } : undefined}
                                aria-label="Close"
                            >
                                ×
                            </button>
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
                        <button
                            type="button"
                            onClick={onClose}
                            className={`shrink-0 text-2xl leading-none transition-colors p-1 ${isV2 ? "" : "text-alloy-midnight/70 hover:text-alloy-forge"}`}
                            style={isV2 ? { color: derived.textSecondary } : undefined}
                            aria-label="Close"
                        >
                            ×
                        </button>
                    </div>
                ) : null}
                {headerSignals != null && headerSignals !== false && (
                    <div
                        data-adminv2-record-modal-signals-wrap
                        className={`px-6 ${cleaningRecordModalTone ? "pb-1.5 pt-0.5" : "pb-3"}`}
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
                        className={`px-6 ${cleaningRecordModalTone ? "pb-2 pt-1" : "pb-1 pt-0"} ${cleaningRecordModalTone ? "border-t border-solid" : `border-t ${isV2 ? "" : "border-admin-border border-t-alloy-blue/30"}`}`}
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
            </div>
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
                    className="adminv2-drawer-modal-dim fixed inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-200 pointer-events-none"
                    style={{ zIndex: zIndexBackdrop }}
                    aria-hidden
                />
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="admin-drawer-title"
                    data-adminv2-drawer="true"
                    data-adminv2-record-modal="true"
                    data-adminv2-record-modal-tone={cleaningRecordModalTone ? "cleaning-v2" : undefined}
                    className={`adminv2-drawer-modal-panel adminv2-drawer-shell-inset pointer-events-auto fixed left-1/2 flex w-[min(calc(100vw-1.5rem),80rem)] max-h-[min(920px,100%)] -translate-x-1/2 flex-col overflow-hidden rounded-2xl border border-solid shadow-2xl animate-in fade-in zoom-in-[0.99] duration-300 ${cleaningRecordModalTone ? "min-h-[min(520px,50%)]" : ""} ${panelClassName ?? "max-w-5xl"}`}
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
                    className="adminv2-drawer-sidebar-dim fixed inset-0 bg-black/50 pointer-events-none"
                    style={{ zIndex: zIndexBackdrop }}
                    aria-hidden
                />
                <div
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="admin-drawer-title"
                    data-adminv2-drawer={isV2 ? "true" : undefined}
                    className={`adminv2-drawer-sidebar-panel pointer-events-auto fixed right-0 left-auto flex w-[min(100vw,42rem)] max-w-2xl flex-col border shadow-xl ${isV2 ? "adminv2-drawer-shell-inset border-solid" : "inset-y-0"} ${panelClassName ?? ""} ${
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
