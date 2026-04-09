"use client";

import { type CSSProperties, type ReactNode, useEffect } from "react";
import { neutral, derived, brand, palette } from "@/styles/tokens/colors";

interface DrawerProps {
    isOpen: boolean;
    onClose: () => void;
    title: ReactNode;
    /** Optional: muted line under the title (e.g. record number). */
    headerSubtitle?: ReactNode;
    children: ReactNode;
    /** Optional: status badge shown on second row with actions */
    statusBadge?: ReactNode;
    /** Optional: primary action buttons on second row (sticky) */
    headerActions?: ReactNode;
    /** Optional: strip below actions row (e.g. workspace-style signal cards). Only body scrolls. */
    headerSignals?: ReactNode;
    /** Optional: sticky content below title/actions/signals (e.g. tabs). Only body scrolls. */
    headerExtra?: ReactNode;
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
}

export default function Drawer({
    isOpen,
    onClose,
    title,
    headerSubtitle,
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
}: DrawerProps) {
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

    if (!isOpen) return null;

    const titleText = typeof title === "string" ? title : title != null ? String(title) : "—";

    const isV2 = variant === "adminV2";
    const isModal = isV2 && presentation === "modal";
    const leftAccent = accentColor ?? (isV2 ? brand.primary : undefined);

    const panelStyle: CSSProperties = isModal
        ? {
              zIndex: zIndexPanel,
              backgroundColor: neutral.surface,
              color: neutral.textPrimary,
              borderColor: derived.border,
              boxShadow: derived.cardShadow,
          }
        : {
              zIndex: zIndexPanel,
              ...(isV2
                  ? {
                        backgroundColor: neutral.surface,
                        color: neutral.textPrimary,
                        borderColor: derived.border,
                        borderLeftWidth: 4,
                        borderLeftStyle: "solid",
                        borderLeftColor: leftAccent ?? brand.primary,
                    }
                  : accentColor
                    ? { borderLeftWidth: 4, borderLeftStyle: "solid", borderLeftColor: accentColor }
                    : {}),
          };

    const modalBodyBg: CSSProperties | undefined =
        isModal && isV2
            ? {
                  background: `linear-gradient(180deg, ${palette.riverStone} 0%, color-mix(in srgb, ${palette.riverStone} 88%, ${derived.canvasFieldDepth}) 100%)`,
                  color: neutral.textPrimary,
              }
            : isV2
              ? { backgroundColor: neutral.background, color: neutral.textPrimary }
              : undefined;

    const headerBlock = (
        <>
            <div
                className={`sticky top-0 z-10 shrink-0 border-b ${isV2 ? "" : "border-admin-border bg-admin-surface-card"}`}
                style={
                    isV2
                        ? {
                              backgroundColor: neutral.surface,
                              borderBottomColor: derived.border,
                          }
                        : undefined
                }
            >
                <div className="px-6 pt-4 pb-2">
                    <h2
                        id={isModal ? "admin-drawer-title" : undefined}
                        className={`text-xl font-bold leading-snug break-words ${isV2 ? "" : "text-alloy-forge"}`}
                        style={isV2 ? { color: neutral.textPrimary } : undefined}
                    >
                        {titleText}
                    </h2>
                    {headerSubtitle != null && headerSubtitle !== false && (
                        <p
                            className={`mt-1 text-sm font-medium ${isV2 ? "" : "text-alloy-midnight/55"}`}
                            style={isV2 ? { color: derived.textSecondary } : undefined}
                        >
                            {headerSubtitle}
                        </p>
                    )}
                </div>
                <div className="px-6 pb-4 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
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
                {headerSignals != null && headerSignals !== false && (
                    <div
                        className="px-6 pb-3"
                        style={
                            isV2
                                ? {
                                      borderBottomWidth: 1,
                                      borderBottomStyle: "solid",
                                      borderBottomColor: derived.border,
                                  }
                                : undefined
                        }
                    >
                        {headerSignals}
                    </div>
                )}
                {headerExtra != null && headerExtra !== false && (
                    <div
                        className={`px-6 pb-3 pt-2 border-t ${isV2 ? "" : "border-admin-border border-t-alloy-blue/30"}`}
                        style={isV2 ? { borderTopColor: derived.border } : undefined}
                    >
                        {headerExtra}
                    </div>
                )}
            </div>
            <div
                className={`flex-1 overflow-y-auto min-h-0 ${isModal ? "px-4 py-3 sm:px-5 sm:py-4" : "p-6"} ${isV2 ? "" : "bg-admin-surface-card"}`}
                style={modalBodyBg}
            >
                {children}
            </div>
        </>
    );

    if (isModal) {
        return (
            <>
                <div
                    className="fixed inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-200"
                    style={{ zIndex: zIndexBackdrop }}
                    onClick={onClose}
                    aria-hidden
                />
                <div
                    className="fixed inset-0 flex items-center justify-center p-3 sm:p-6 pointer-events-none"
                    style={{ zIndex: zIndexPanel }}
                >
                    <div
                        data-adminv2-drawer="true"
                        data-adminv2-record-modal="true"
                        className={`pointer-events-auto flex max-h-[min(920px,92vh)] w-full flex-col overflow-hidden rounded-2xl border border-solid shadow-2xl animate-in fade-in zoom-in-[0.99] duration-300 ${panelClassName ?? "max-w-5xl"}`}
                        style={panelStyle}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="admin-drawer-title"
                    >
                        {headerBlock}
                    </div>
                </div>
            </>
        );
    }

    return (
        <>
            <div
                className="fixed inset-0 bg-black/50"
                style={{ zIndex: zIndexBackdrop }}
                onClick={onClose}
            />
            <div
                data-adminv2-drawer={isV2 ? "true" : undefined}
                className={`fixed right-0 top-0 bottom-0 w-full shadow-xl flex flex-col border ${
                    panelClassName ?? "max-w-2xl"
                } ${isV2 ? "border-solid" : `bg-admin-surface-card border-admin-border ${accentColor ? "" : "border-l-4 border-alloy-blue/40"}`}`}
                style={panelStyle}
            >
                {headerBlock}
            </div>
        </>
    );
}
