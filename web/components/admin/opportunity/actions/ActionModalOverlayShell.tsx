"use client";

import { useEffect, type CSSProperties, type ReactNode } from "react";
import { ADMINV2_DRAWER_ACTION_MODAL_LAYER_Z } from "@/lib/adminV2/drawerActionModalLayer";
import { hasOpenTransientPopup } from "@/lib/adminV2/runtime/focusPanel/escapeLayerOwnership";

type Props = {
    open: boolean;
    onClose: () => void;
    children: ReactNode;
    busy?: boolean;
    panelClassName?: string;
    "data-testid"?: string;
};

/**
 * Shared fixed overlay for opportunity drawer registry action modals.
 *
 * ── ESCAPE (E2E-13) ──
 * Every modal on this shell (Add Person / Add Parent / Add Contact, the relationship wizard, Add
 * Child, Create Work Item) offers Close/Cancel, and none ignored Escape on purpose — the only
 * deliberate rule was "not while busy", which the backdrop already follows. So Escape closes here,
 * once, under the same rule, instead of in each modal. An open popup inside the modal (a select's
 * menu) keeps the key: it closes first, as it does everywhere else.
 *
 * ── GEOMETRY (E2E-14) ──
 * The overlay sat at z 95 under the shell chrome (z 100, 3.75rem tall), so a viewport-tall panel
 * centred in the full viewport put its header — and its Close — beneath the top bar. The overlay now
 * starts below the chrome (`--adminv2-drawer-inset-top`, the band every record surface already
 * uses) and publishes `--alloy-action-modal-max-h`, the height a panel can actually use, so panels
 * size against the shell instead of guessing at the viewport. Layering is unchanged: menus portaled
 * above it still render above it.
 */
export function ActionModalOverlayShell({
    open,
    onClose,
    children,
    busy = false,
    panelClassName = "w-full max-w-md overflow-hidden rounded-2xl border border-alloy-stone/25 bg-white shadow-2xl",
    "data-testid": dataTestId,
}: Props) {
    useEffect(() => {
        if (!open) return;
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== "Escape" || event.defaultPrevented || busy) return;
            if (hasOpenTransientPopup(document)) return;
            event.stopPropagation();
            onClose();
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [open, busy, onClose]);

    if (!open) return null;

    const style = {
        zIndex: ADMINV2_DRAWER_ACTION_MODAL_LAYER_Z,
        top: "var(--adminv2-drawer-inset-top, 3.75rem)",
        "--alloy-action-modal-max-h": "calc(100dvh - var(--adminv2-drawer-inset-top, 3.75rem) - 2rem)",
    } as CSSProperties;

    return (
        <div
            className="fixed inset-x-0 bottom-0 flex items-center justify-center bg-black/30 p-4 backdrop-blur-[1px]"
            style={style}
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
