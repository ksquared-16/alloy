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
}

export default function Drawer({ isOpen, onClose, title, children, statusBadge, headerActions, headerExtra, zIndexBackdrop = 40, zIndexPanel = 50 }: DrawerProps) {
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
            <div className="fixed right-0 top-0 bottom-0 w-full max-w-2xl bg-white shadow-xl flex flex-col border-l border-[#59678b]/40" style={{ zIndex: zIndexPanel }}>
                <div className="sticky top-0 z-10 bg-white shrink-0 border-b border-alloy-stone/30 shadow-[0_1px_3px_rgba(0,0,0,0.06)]">
                    <div className="px-6 py-4 flex items-center justify-between gap-4">
                        <div className="min-w-0 flex-1 flex items-center gap-3">
                            <h2 className="text-xl font-bold text-alloy-midnight truncate">{title}</h2>
                            {statusBadge != null && statusBadge !== false && statusBadge}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            {headerActions}
                            <button
                                onClick={onClose}
                                className="text-alloy-midnight/60 hover:text-alloy-midnight text-2xl leading-none"
                            >
                                ×
                            </button>
                        </div>
                    </div>
                    {headerExtra != null && headerExtra !== false && (
                        <div className="px-6 pb-3 border-t border-alloy-stone/20 bg-white">
                            {headerExtra}
                        </div>
                    )}
                </div>
                <div className="flex-1 overflow-y-auto p-6">{children}</div>
            </div>
        </>
    );
}

