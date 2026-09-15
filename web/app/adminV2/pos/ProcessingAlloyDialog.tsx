"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ADMINV2_WORKSPACE_BOS_NESTED_OVERLAY_Z } from "@/components/admin/Drawer";

export default function ProcessingAlloyDialog({
    open,
    onClose,
    title,
    subtitle,
    children,
    footer,
    testId,
    size = "default",
    labelledById = "processing-alloy-dialog-title",
}: {
    open: boolean;
    onClose: () => void;
    title: string;
    subtitle?: string;
    children: ReactNode;
    footer?: ReactNode;
    testId?: string;
    /** "wide" is for surfaces that show a rendered experience rather than a few settings. */
    size?: "default" | "wide";
    labelledById?: string;
}) {
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    if (!open || typeof document === "undefined") return null;

    // Nests ABOVE the Processing BOS modal shell (panel ADMINV2_WORKSPACE_BOS_PANEL_Z=97, backdrop 96 —
    // components/admin/Drawer.tsx). At the old z-[80] these dialogs (import intent, rename, confirm, create-form,
    // …) opened BEHIND the shell + its backdrop and looked broken (e.g. "Import document"/"Open" did nothing).
/*
 * VIEWPORT-BOUNDED, HEADER AND FOOTER FIXED.
 *
 * The panel was `overflow-hidden` with no height bound, so a dialog taller than the screen grew
 * past it and had its own overflow rule CLIP the bottom — Save and Cancel were rendered, and
 * unreachable, with no scrollbar to suggest otherwise. Measured on the packet step Configure
 * surface at laptop height.
 *
 * The shape used below is the one components/admin/Drawer.tsx already uses for its modal panel: a
 * max-height flex column, header and footer `shrink-0`, and the body the only thing that scrolls
 * (`flex-1 min-h-0 overflow-y-auto` — min-h-0 is what lets a flex child shrink below its content
 * instead of pushing the footer off-screen). `100dvh` rather than `100vh` so a mobile URL bar
 * cannot hide the footer.
 */
    return createPortal(
        <div
            style={{ zIndex: ADMINV2_WORKSPACE_BOS_NESTED_OVERLAY_Z }}
            className="pointer-events-auto fixed inset-0 flex items-center justify-center bg-alloy-midnight/35 p-4 backdrop-blur-[1px]"
            role="presentation"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-labelledby={labelledById}
                aria-modal="true"
                data-testid={testId}
                className={`flex max-h-[calc(100dvh-2rem)] w-full flex-col ${size === "wide" ? "max-w-[min(56rem,100%)]" : "max-w-[440px]"} overflow-hidden rounded-2xl border border-alloy-stone/15 bg-white shadow-[0_24px_64px_rgba(15,23,42,0.18)]`}
                onClick={(e) => e.stopPropagation()}
            >
                <header className="shrink-0 border-b border-alloy-stone/10 px-6 pb-4 pt-6">
                    <h2 id={labelledById} className="text-[17px] font-semibold tracking-tight text-alloy-midnight">
                        {title}
                    </h2>
                    {subtitle ? <p className="mt-1.5 text-[13px] leading-snug text-alloy-midnight/50">{subtitle}</p> : null}
                </header>
                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 [scrollbar-gutter:stable]">{children}</div>
                {footer ? (
                    <footer className="shrink-0 flex items-center justify-end gap-2 border-t border-alloy-stone/10 bg-alloy-stone/[0.04] px-6 py-4">
                        {footer}
                    </footer>
                ) : null}
            </div>
        </div>,
        document.body
    );
}
