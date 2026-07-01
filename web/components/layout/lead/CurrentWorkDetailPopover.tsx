"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import CurrentWorkActionOverlay from "@/components/workIntent/CurrentWorkActionOverlay";
import type { StageWorkRuntimeProjection } from "@/lib/lifecycle/stageWorkRuntimeTypes";

/** Overlay detail for KPI Current Work — does not shift drawer layout. */
export default function CurrentWorkDetailPopover({
    anchorEl,
    opportunityId,
    runtime,
    canMutate,
    onClose,
}: {
    anchorEl: HTMLElement;
    opportunityId: string;
    runtime: StageWorkRuntimeProjection;
    canMutate?: boolean;
    onClose: () => void;
}) {
    const panelRef = useRef<HTMLDivElement>(null);
    const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

    useEffect(() => {
        const update = () => {
            const rect = anchorEl.getBoundingClientRect();
            const width = Math.min(Math.max(rect.width, 320), window.innerWidth - 24);
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
            className="fixed z-[86] max-h-[min(28rem,calc(100vh-6rem))] overflow-y-auto rounded-lg border border-alloy-juniper/20 bg-white p-3 shadow-[0_12px_32px_-12px_rgba(24,39,58,0.22)]"
            style={{ top: pos.top, left: pos.left, width: pos.width }}
            data-current-work-detail-popover="true"
            role="dialog"
            aria-label="Current work"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
        >
            <CurrentWorkActionOverlay
                opportunityId={opportunityId}
                runtime={runtime}
                canMutate={canMutate}
            />
        </div>,
        document.body,
    );
}
