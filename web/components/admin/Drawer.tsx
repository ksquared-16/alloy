"use client";

import { ReactNode, useEffect } from "react";

interface DrawerProps {
    isOpen: boolean;
    onClose: () => void;
    title: ReactNode;
    children: ReactNode;
    /** Optional: status badge shown on second row with actions */
    statusBadge?: ReactNode;
    /** Optional: primary action buttons on second row (sticky) */
    headerActions?: ReactNode;
    /** Optional: sticky content below title/actions (e.g. tabs). Only body scrolls. */
    headerExtra?: ReactNode;
    /** Optional: use higher z-index when stacking drawers (e.g. 60/70) */
    zIndexBackdrop?: number;
    zIndexPanel?: number;
    /** Optional: 4px left accent border color (e.g. "rgb(0,69,140)") */
    accentColor?: string;
}

export default function Drawer({ isOpen, onClose, title, statusBadge, headerActions, headerExtra, children, zIndexBackdrop = 40, zIndexPanel = 50, accentColor }: DrawerProps) {
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

    return (
        <>
            <div
                className="fixed inset-0 bg-black/50"
                style={{ zIndex: zIndexBackdrop }}
                onClick={onClose}
            />
            <div
                className={`fixed right-0 top-0 bottom-0 w-full max-w-2xl bg-admin-surface-card border border-admin-border shadow-xl flex flex-col ${accentColor ? "" : "border-l-4 border-alloy-blue/40"}`}
                style={{ zIndex: zIndexPanel, ...(accentColor ? { borderLeftWidth: 4, borderLeftStyle: "solid", borderLeftColor: accentColor } : {}) }}
            >
                {/* Sticky header: white/light with subtle border (dashboard-style) */}
                <div className="sticky top-0 z-10 shrink-0 border-b border-admin-border bg-admin-surface-card">
                    {/* Row 1: full title only — no truncation */}
                    <div className="px-6 pt-4 pb-2">
                        <h2 className="text-xl font-bold text-alloy-forge leading-snug break-words">
                            {titleText}
                        </h2>
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
                            className="shrink-0 text-alloy-midnight/70 hover:text-alloy-forge text-2xl leading-none transition-colors p-1"
                            aria-label="Close"
                        >
                            ×
                        </button>
                    </div>
                    {headerExtra != null && headerExtra !== false && (
                        <div className="px-6 pb-3 pt-2 border-t border-admin-border border-t-alloy-blue/30">
                            {headerExtra}
                        </div>
                    )}
                </div>
                <div className="flex-1 overflow-y-auto p-6 bg-admin-surface-card">{children}</div>
            </div>
        </>
    );
}
