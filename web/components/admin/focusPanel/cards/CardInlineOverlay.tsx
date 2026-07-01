"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";

type Props = {
    /** Whether the overlay is open. */
    open: boolean;
    /** Collapse the overlay (← Close, ESC, or click-out). */
    onClose: () => void;
    /** Short overlay heading (e.g. "Readiness", "Current work"). */
    title: string;
    /** Deeper evidence rows. */
    children: ReactNode;
    /** Optional right-aligned footer slot (e.g. a deeper handoff link). */
    footerRight?: ReactNode;
    /** data-* hook for tests (the overlay container gets it). */
    dataOverlay?: string;
};

/**
 * Card-local INLINE OVERLAY for diagnostic / action cards (Readiness, Current
 * Work). Deeper evidence appears as a dropdown anchored to the card — it does NOT
 * become a centered Focus Card and does NOT report depth to the host. The base
 * Work surface never moves: the overlay is absolutely positioned (CSS) so it
 * covers the card(s) below WITHOUT reflowing the grid.
 *
 * Dismissal: an invisible backdrop catches click-out (no harsh scrim), and ESC is
 * captured before the drawer's own close handler so the overlay collapses FIRST
 * and the record stays open.
 *
 * Direction is INVARIANT: the overlay always expands DOWNWARD and never pushes the
 * canvas or opens upward. When there isn't room below (e.g. the bottom card of a
 * scrolled panel), we SCROLL the panel so the downward overlay becomes visible —
 * we never reverse direction. (Enrollment Freeze rule.)
 *
 * @see docs/sprints/06_2026/focus-panel-inline-overlay-finalization
 */
export default function CardInlineOverlay({ open, onClose, title, children, footerRight, dataOverlay }: Props) {
    const overlayRef = useRef<HTMLDivElement>(null);

    // Reposition (never reverse): if the downward overlay would fall below the
    // viewport, scroll it into view through the nearest scrollable ancestor.
    useLayoutEffect(() => {
        if (!open) return;
        const el = overlayRef.current;
        if (!el || typeof el.scrollIntoView !== "function") return;
        const rect = el.getBoundingClientRect();
        const viewportBottom = typeof window === "undefined" ? 0 : window.innerHeight;
        if (viewportBottom && rect.bottom > viewportBottom - 8) {
            el.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== "Escape") return;
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            onClose();
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <>
            <button
                type="button"
                className="alloy-os-card-overlay__backdrop"
                aria-label="Close"
                data-card-overlay-backdrop="true"
                onClick={onClose}
            />
            <div
                ref={overlayRef}
                className="alloy-os-card-overlay"
                role="dialog"
                data-card-overlay={dataOverlay ?? "true"}
                data-overlay-direction="down"
            >
                <p className="alloy-os-card-overlay__title">{title}</p>
                <div className="alloy-os-card-overlay__body">{children}</div>
                <div className="alloy-os-card-overlay__foot">
                    <button
                        type="button"
                        className="alloy-os-ucard__action alloy-os-ucard__action--system5"
                        onClick={onClose}
                        data-card-overlay-close="true"
                    >
                        ← Close
                    </button>
                    {footerRight ?? null}
                </div>
            </div>
        </>
    );
}
