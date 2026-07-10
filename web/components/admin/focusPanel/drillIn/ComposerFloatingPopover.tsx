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

/** Portal popover anchored to a trigger — avoids card/scroll clipping in composer drill-in. */
export default function ComposerFloatingPopover({
    open,
    anchorRef,
    onClose,
    className = "",
    children,
}: Props) {
    const [pos, setPos] = useState<{ top: number; left: number; minWidth: number } | null>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    const updatePosition = () => {
        if (!open || !anchorRef.current) {
            setPos(null);
            return;
        }
        const rect = anchorRef.current.getBoundingClientRect();
        setPos({ top: rect.bottom + 4, left: rect.left, minWidth: Math.max(rect.width, 200) });
    };

    useLayoutEffect(() => {
        updatePosition();
    }, [open, anchorRef]);

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
            style={{
                position: "fixed",
                top: pos.top,
                left: pos.left,
                minWidth: pos.minWidth,
                zIndex: 300,
            }}
        >
            {children}
        </div>,
        document.body,
    );
}
