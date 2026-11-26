"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Props = {
    open: boolean;
    anchorRef: React.RefObject<HTMLElement | null>;
    onClose?: () => void;
    className?: string;
    children: React.ReactNode;
};

type PopoverPos = {
    top: number;
    left: number;
    minWidth: number;
    maxHeight: number;
    placement: "above" | "below";
};

const VIEWPORT_MARGIN = 8;
const GAP = 4;
const MIN_HEIGHT = 160;

/**
 * Portal popover anchored to a trigger — avoids card/scroll clipping in composer drill-in.
 * Collision-aware: flips above when needed and clamps to the viewport with internal scroll.
 */
export default function ComposerFloatingPopover({
    open,
    anchorRef,
    onClose,
    className = "",
    children,
}: Props) {
    const [pos, setPos] = useState<PopoverPos | null>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    const computePosition = (): PopoverPos | null => {
        if (!open || !anchorRef.current) return null;
        const rect = anchorRef.current.getBoundingClientRect();
        const viewportH = window.innerHeight;
        const viewportW = window.innerWidth;
        const minWidth = Math.max(rect.width, 200);
        const spaceBelow = viewportH - rect.bottom - VIEWPORT_MARGIN - GAP;
        const spaceAbove = rect.top - VIEWPORT_MARGIN - GAP;

        const preferAbove = spaceBelow < MIN_HEIGHT && spaceAbove > spaceBelow;
        const placement: "above" | "below" = preferAbove ? "above" : "below";
        const maxHeight = Math.max(MIN_HEIGHT, preferAbove ? spaceAbove : spaceBelow);

        // Provisional top; refined after measure if placed above with unknown height.
        let top = preferAbove
            ? Math.max(VIEWPORT_MARGIN, rect.top - maxHeight - GAP)
            : rect.bottom + GAP;
        let left = rect.left;
        if (left + minWidth > viewportW - VIEWPORT_MARGIN) {
            left = Math.max(VIEWPORT_MARGIN, viewportW - minWidth - VIEWPORT_MARGIN);
        }
        if (left < VIEWPORT_MARGIN) left = VIEWPORT_MARGIN;

        return { top, left, minWidth, maxHeight, placement };
    };

    const updatePosition = () => {
        setPos(computePosition());
    };

    useLayoutEffect(() => {
        updatePosition();
    }, [open, anchorRef]);

    // After render, if above, pin the bottom edge to the anchor top using measured height.
    useLayoutEffect(() => {
        if (!open || !pos || !contentRef.current || !anchorRef.current) return;
        if (pos.placement !== "above") return;
        const rect = anchorRef.current.getBoundingClientRect();
        const height = Math.min(contentRef.current.getBoundingClientRect().height, pos.maxHeight);
        const nextTop = Math.max(VIEWPORT_MARGIN, rect.top - height - GAP);
        if (Math.abs(nextTop - pos.top) > 1) {
            setPos((current) => (current ? { ...current, top: nextTop } : current));
        }
    }, [open, pos?.placement, pos?.maxHeight, children]);

    useEffect(() => {
        if (!open) return;
        const onScrollOrResize = () => updatePosition();
        window.addEventListener("resize", onScrollOrResize);
        window.addEventListener("scroll", onScrollOrResize, true);
        return () => {
            window.removeEventListener("resize", onScrollOrResize);
            window.removeEventListener("scroll", onScrollOrResize, true);
        };
    }, [open, anchorRef]);

    useEffect(() => {
        if (!open || !onClose) return;
        const onDoc = (e: MouseEvent) => {
            const target = e.target as Node;
            if (anchorRef.current?.contains(target)) return;
            // The popover content is portaled to <body>, so it is NOT inside the anchor.
            // Without this guard, a mousedown on a popover item closes + unmounts the
            // portal before its click fires — the selection never commits.
            if (contentRef.current?.contains(target)) return;
            onClose();
        };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, [open, onClose, anchorRef]);

    if (!open || !pos || typeof document === "undefined") return null;

    return createPortal(
        <div
            ref={contentRef}
            className={className}
            data-composer-floating-popover="true"
            data-popover-placement={pos.placement}
            style={{
                position: "fixed",
                top: pos.top,
                left: pos.left,
                minWidth: pos.minWidth,
                maxHeight: pos.maxHeight,
                overflowY: "auto",
                zIndex: 300,
            }}
        >
            {children}
        </div>,
        document.body,
    );
}
