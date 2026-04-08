"use client";

import { type CSSProperties, type ReactNode, useEffect } from "react";
import { neutral, derived, brand } from "@/styles/tokens/colors";

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
    const leftAccent = accentColor ?? (isV2 ? brand.primary : undefined);

    const panelStyle: CSSProperties = {
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
                {/* Sticky header: white/light with subtle border (dashboard-style) */}
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
                    {/* Row 1: full title only — no truncation */}
                    <div className="px-6 pt-4 pb-2">
                        <h2
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
                    {/* Row 2: status + actions + close */}
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
                            style={isV2 ? { borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: derived.border } : undefined}
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
                    className={`flex-1 overflow-y-auto p-6 ${isV2 ? "" : "bg-admin-surface-card"}`}
                    style={isV2 ? { backgroundColor: neutral.background, color: neutral.textPrimary } : undefined}
                >
                    {children}
                </div>
            </div>
        </>
    );
}
