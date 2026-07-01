"use client";

import type { ReactNode } from "react";
import { ADMINV2_DRAWER_ACTION_MODAL_LAYER_Z } from "@/lib/adminV2/drawerActionModalLayer";

type Props = {
    open: boolean;
    onClose: () => void;
    children: ReactNode;
    busy?: boolean;
    panelClassName?: string;
    "data-testid"?: string;
};

/** Shared fixed overlay for opportunity drawer registry action modals. */
export function ActionModalOverlayShell({
    open,
    onClose,
    children,
    busy = false,
    panelClassName = "w-full max-w-md overflow-hidden rounded-2xl border border-alloy-stone/25 bg-white shadow-2xl",
    "data-testid": dataTestId,
}: Props) {
    if (!open) return null;

    return (
        <div
            className="fixed inset-0 flex items-center justify-center bg-black/30 p-4 backdrop-blur-[1px]"
            style={{ zIndex: ADMINV2_DRAWER_ACTION_MODAL_LAYER_Z }}
            data-opportunity-drawer-action-overlay="true"
            data-testid={dataTestId}
            onClick={() => {
                if (!busy) onClose();
            }}
        >
            <div
                role="dialog"
                aria-modal="true"
                className={panelClassName}
                onClick={(e) => e.stopPropagation()}
            >
                {children}
            </div>
        </div>
    );
}
