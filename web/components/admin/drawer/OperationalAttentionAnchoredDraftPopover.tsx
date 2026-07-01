"use client";

import { useEffect, useRef, type RefObject } from "react";

type Props = {
    open: boolean;
    onClose: () => void;
    /** Element that was clicked to open (toggle clicks are ignored for outside-close). */
    anchorRef: RefObject<HTMLElement | null>;
    /** Short heading inside the panel (e.g. “Enhanced draft”). */
    title: string;
    /** Optional muted line under title. */
    subtitle?: string | null;
    body: string;
    copyLabel: string;
    "data-drawer-slot"?: string;
};

/**
 * Anchored overlay under the Recommended-by-Alloy strip: does not grow header layout; scrolls internally.
 */
export default function OperationalAttentionAnchoredDraftPopover({
    open,
    onClose,
    anchorRef,
    title,
    subtitle,
    body,
    copyLabel,
    "data-drawer-slot": dataSlot = "attention_draft_popover",
}: Props) {
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;

        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };

        const onMouseDown = (e: MouseEvent) => {
            const t = e.target as Node;
            if (anchorRef.current?.contains(t)) return;
            if (panelRef.current?.contains(t)) return;
            onClose();
        };

        document.addEventListener("keydown", onKey);
        const tid = window.setTimeout(() => {
            document.addEventListener("mousedown", onMouseDown);
        }, 0);
        return () => {
            window.clearTimeout(tid);
            document.removeEventListener("keydown", onKey);
            document.removeEventListener("mousedown", onMouseDown);
        };
    }, [open, onClose, anchorRef]);

    if (!open || !body.trim()) return null;

    function copyBody() {
        if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
            void navigator.clipboard.writeText(body);
        }
    }

    return (
        <div
            ref={panelRef}
            className="absolute left-0 right-0 top-full z-[70] mt-1 max-h-[min(42vh,280px)] overflow-y-auto rounded-md border border-[color-mix(in_srgb,rgb(188,67,0)_22%,var(--d-border,rgba(39,63,82,0.18)))] border-l-[3px] border-l-[rgb(188,67,0)] bg-white px-2 py-1.5 text-alloy-midnight shadow-lg"
            data-drawer-slot={dataSlot}
            role="dialog"
            aria-modal="true"
            aria-label={title}
        >
            <div className="text-[9px] font-semibold uppercase tracking-wide text-alloy-midnight/48">{title}</div>
            {subtitle ? <p className="mt-0.5 text-[8px] text-alloy-midnight/52">{subtitle}</p> : null}
            <pre className="mt-1 max-h-[min(36vh,220px)] overflow-y-auto whitespace-pre-wrap break-words rounded border border-alloy-stone/12 bg-alloy-stone/[0.04] px-1.5 py-1 font-sans text-[10px] leading-relaxed text-alloy-midnight/88">
                {body}
            </pre>
            <button
                type="button"
                className="mt-1.5 text-[9px] font-semibold text-alloy-blue hover:underline"
                onClick={(e) => {
                    e.preventDefault();
                    copyBody();
                }}
            >
                {copyLabel}
            </button>
        </div>
    );
}
