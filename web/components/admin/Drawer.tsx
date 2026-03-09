"use client";

import { ReactNode, useEffect } from "react";

interface DrawerProps {
    isOpen: boolean;
    onClose: () => void;
    title: ReactNode;
    children: ReactNode;
    /** Optional: status badge shown next to title in header */
    statusBadge?: ReactNode;
    /** Optional: primary action buttons aligned right in header (sticky) */
    headerActions?: ReactNode;
    /** Optional: sticky content below title row (e.g. tabs). Only body scrolls. */
    headerExtra?: ReactNode;
    /** Optional: use higher z-index when stacking drawers (e.g. 60/70) */
    zIndexBackdrop?: number;
    zIndexPanel?: number;
    /** Optional: 4px left accent border color (e.g. "rgb(0,69,140)") */
    accentColor?: string;
}

export default function Drawer({ isOpen, onClose, title, children, statusBadge, headerActions, headerExtra, zIndexBackdrop = 40, zIndexPanel = 50, accentColor }: DrawerProps) {
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

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/50"
                style={{ zIndex: zIndexBackdrop }}
                onClick={onClose}
            />

            {/* Drawer */}
            <div
                className={`fixed right-0 top-0 bottom-0 w-full max-w-2xl bg-admin-surface-card shadow-xl flex flex-col ${accentColor ? "" : "border-l-4 border-alloy-blue/40"}`}
                style={{ zIndex: zIndexPanel, ...(accentColor ? { borderLeftWidth: 4, borderLeftStyle: "solid", borderLeftColor: accentColor } : {}) }}
            >
                <div className="sticky top-0 z-10 bg-alloy-blue/[0.04] shrink-0 border-b border-admin-border">
                    <div className="px-6 py-4 flex items-center justify-between gap-4">
                        <div className="min-w-0 flex-1 flex items-center gap-3">
                            <h2 className="text-xl font-bold text-alloy-midnight truncate">{typeof title === "string" ? title : title != null ? String(title) : "—"}</h2>
                            {statusBadge != null && statusBadge !== false && statusBadge}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            {headerActions}
                            <button
                                onClick={onClose}
                                className="text-alloy-muted hover:text-alloy-midnight text-2xl leading-none transition-colors"
                            >
                                ×
                            </button>
                        </div>
                    </div>
                    {headerExtra != null && headerExtra !== false && (
                        <div className="px-6 pb-3 border-t border-admin-border bg-alloy-blue/[0.02]">
                            {headerExtra}
                        </div>
                    )}
                </div>
                <div className="flex-1 overflow-y-auto p-6 bg-admin-surface-card">{children}</div>
            </div>
        </>
    );
}

