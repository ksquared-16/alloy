"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { DrawerHeaderMoreGuidanceLine } from "@/lib/admin/drawer/drawerHeaderAttentionPresentation";

/** Compact attention guidance popover for queue row widgets. */
export default function QueueRecordAttentionPopover({
    anchorEl,
    title,
    lines,
    onClose,
}: {
    anchorEl: HTMLElement;
    title: string;
    lines: DrawerHeaderMoreGuidanceLine[];
    onClose: () => void;
}) {
    const panelRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

    useEffect(() => {
        const update = () => {
            const rect = anchorEl.getBoundingClientRect();
            const width = Math.min(Math.max(rect.width, 280), window.innerWidth - 24);
            setPos({
                top: rect.bottom + 6,
                left: Math.min(Math.max(12, rect.left), window.innerWidth - width - 12),
                width,
            });
        };
        update();
        window.addEventListener("resize", update);
        window.addEventListener("scroll", update, true);
        return () => {
            window.removeEventListener("resize", update);
            window.removeEventListener("scroll", update, true);
        };
    }, [anchorEl]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        const onMouseDown = (e: MouseEvent) => {
            const t = e.target as Node;
            if (anchorEl.contains(t)) return;
            if (panelRef.current?.contains(t)) return;
            onClose();
        };
        document.addEventListener("keydown", onKey);
        const tid = window.setTimeout(() => document.addEventListener("mousedown", onMouseDown), 0);
        return () => {
            window.clearTimeout(tid);
            document.removeEventListener("keydown", onKey);
            document.removeEventListener("mousedown", onMouseDown);
        };
    }, [anchorEl, onClose]);

    if (!pos || typeof document === "undefined") return null;

    return createPortal(
        <div
            ref={panelRef}
            className="fixed z-[86] rounded-lg border border-alloy-ember/20 bg-white p-3 shadow-[0_12px_32px_-12px_rgba(24,39,58,0.22)]"
            style={{ top: pos.top, left: pos.left, width: pos.width }}
            data-queue-attention-detail-popover="true"
            role="dialog"
            aria-label="Attention details"
            onClick={(e) => e.stopPropagation()}
        >
            <div className="text-[10px] font-semibold uppercase tracking-wide text-alloy-ember/80">Attention</div>
            <div className="mt-1 text-sm font-semibold text-alloy-midnight">{title}</div>
            {lines.length > 0 ?
                <div className="mt-2 space-y-2">
                    {lines.map((line) => (
                        <div key={line.key}>
                            <div className="text-[10px] font-semibold uppercase tracking-wide text-alloy-muted">{line.label}</div>
                            <p className="mt-0.5 text-[11px] leading-snug text-alloy-midnight/80">{line.body}</p>
                        </div>
                    ))}
                </div>
            :   null}
        </div>,
        document.body,
    );
}
