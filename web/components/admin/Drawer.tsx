"use client";

import { ReactNode, useEffect } from "react";

interface DrawerProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: ReactNode;
    /** Optional: use higher z-index when stacking drawers (e.g. 60/70) */
    zIndexBackdrop?: number;
    zIndexPanel?: number;
}

export default function Drawer({ isOpen, onClose, title, children, zIndexBackdrop = 40, zIndexPanel = 50 }: DrawerProps) {
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
            <div className="fixed right-0 top-0 bottom-0 w-full max-w-2xl bg-white shadow-xl overflow-y-auto" style={{ zIndex: zIndexPanel }}>
                <div className="sticky top-0 bg-white border-b border-alloy-stone/30 px-6 py-4 flex items-center justify-between">
                    <h2 className="text-xl font-bold text-alloy-midnight">{title}</h2>
                    <button
                        onClick={onClose}
                        className="text-alloy-midnight/60 hover:text-alloy-midnight text-2xl leading-none"
                    >
                        ×
                    </button>
                </div>
                <div className="p-6">{children}</div>
            </div>
        </>
    );
}

