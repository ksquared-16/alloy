"use client";

import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useState,
    type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { ADMINV2_RAIL_MENU_Z } from "@/components/admin/Drawer";

/**
 * Platform-owned floating menu for the workspace command rail.
 *
 * Rail sections (Work Unit Actions, future rail popovers) must overlay the BOS command surface
 * when expanded. The BOS dock is a `position: fixed` body overlay at `ADMINV2_COMMAND_SURFACE_Z`
 * (90), so an inline-expanded rail body is both covered by BOS and reflows the BOS anchor when it
 * grows. This menu instead portals its content to `document.body`, anchored to the trigger, at
 * `ADMINV2_RAIL_MENU_Z` (95) — above BOS, below shell chrome — so it floats free of the rail
 * layout, is never clipped by rail parents, and opening it never shifts BOS.
 *
 * Positioning re-measures on scroll/resize and on anchor resize. Click-outside and Escape close.
 */

type AnchoredStyle = {
    position: "fixed";
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    visibility: "visible" | "hidden";
};

/** Breathing room below the menu before the viewport edge. */
const VIEWPORT_BOTTOM_INSET = 16;
const MIN_MENU_WIDTH = 240;

function measure(anchorEl: HTMLElement): AnchoredStyle {
    const rect = anchorEl.getBoundingClientRect();
    const top = Math.round(rect.bottom + 4);
    const width = Math.max(MIN_MENU_WIDTH, Math.round(rect.width));
    // Right-align to the trigger's right edge so the menu tracks the rail column.
    const left = Math.round(rect.right - width);
    const maxHeight = Math.max(120, Math.round(window.innerHeight - top - VIEWPORT_BOTTOM_INSET));
    return {
        position: "fixed",
        top,
        left: Math.max(8, left),
        width,
        maxHeight,
        visibility: rect.width > 0 ? "visible" : "hidden",
    };
}

const HIDDEN: AnchoredStyle = {
    position: "fixed",
    top: -9999,
    left: -9999,
    width: MIN_MENU_WIDTH,
    maxHeight: 120,
    visibility: "hidden",
};

type Props = {
    anchorEl: HTMLElement | null;
    open: boolean;
    onClose: () => void;
    ariaLabel?: string;
    children: ReactNode;
    /** Extra class on the floating panel. */
    className?: string;
    /** Forwarded to the panel for selector continuity with the prior inline body. */
    bodyDataAttr?: Record<string, string>;
};

export function CommandRailFloatingMenu({
    anchorEl,
    open,
    onClose,
    ariaLabel,
    children,
    className,
    bodyDataAttr,
}: Props) {
    const [portalReady, setPortalReady] = useState(false);
    const [menuEl, setMenuEl] = useState<HTMLDivElement | null>(null);
    const [style, setStyle] = useState<AnchoredStyle>(HIDDEN);

    useEffect(() => {
        setPortalReady(true);
    }, []);

    // Position tracking — only while open and anchored.
    useLayoutEffect(() => {
        if (!open || !anchorEl) {
            return;
        }
        const update = () => setStyle(measure(anchorEl));
        update();

        const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
        ro?.observe(anchorEl);

        const scrollSurface = document.querySelector(".adminv2-workspace-scroll-surface");
        scrollSurface?.addEventListener("scroll", update, { passive: true });
        window.addEventListener("resize", update);
        // Catch ancestor scrolls (rail, page) without binding to every container.
        window.addEventListener("scroll", update, { passive: true, capture: true });

        return () => {
            ro?.disconnect();
            scrollSurface?.removeEventListener("scroll", update);
            window.removeEventListener("resize", update);
            window.removeEventListener("scroll", update, { capture: true } as EventListenerOptions);
        };
    }, [open, anchorEl]);

    // Dismiss: click outside (ignoring the anchor) + Escape.
    useEffect(() => {
        if (!open) return;

        const onPointerDown = (e: PointerEvent) => {
            const target = e.target as Node | null;
            if (!target) return;
            if (menuEl?.contains(target)) return;
            if (anchorEl?.contains(target)) return;
            onClose();
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };

        document.addEventListener("pointerdown", onPointerDown, true);
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.removeEventListener("pointerdown", onPointerDown, true);
            document.removeEventListener("keydown", onKeyDown);
        };
    }, [open, anchorEl, menuEl, onClose]);

    if (!open || !portalReady || !anchorEl) return null;

    return createPortal(
        <div
            ref={setMenuEl}
            role="menu"
            aria-label={ariaLabel}
            // `reveal` choreography on open — the menu fades+lifts in as it mounts (one frame,
            // reduced-motion-safe at token level). Close is still an instant unmount: a `recede`
            // exit needs an engineered portal exit-window (the gated drawer/menu recede work).
            className={["adminv2-ws-command-rail-floating-menu motion-reveal", className]
                .filter(Boolean)
                .join(" ")}
            style={{
                position: style.position,
                top: style.top,
                left: style.left,
                width: style.width,
                maxHeight: style.maxHeight,
                overflowY: "auto",
                visibility: style.visibility,
                zIndex: ADMINV2_RAIL_MENU_Z,
            }}
            {...bodyDataAttr}
        >
            {children}
        </div>,
        document.body
    );
}
