"use client";

import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from "react";

import { useBosPresentationControllerOptional } from "@/contexts/BosPresentationControllerContext";
import { BosMark } from "@/app/adminV2/components/bos/identity/BosMark";

/**
 * Adaptive Workspace System — BOS operator chrome outside the panel.
 * Pin / Unpin / Close live in BosRailHeader (inside the overlay, above z=90).
 * This host keeps: pinned resize handle + closed-state launcher.
 */
export function BosPresentationControls() {
    const controller = useBosPresentationControllerOptional();
    const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

    const onPointerDown = useCallback(
        (event: ReactPointerEvent<HTMLButtonElement>) => {
            if (!controller || controller.derivation.effective !== "pinned") return;
            event.preventDefault();
            dragRef.current = {
                startX: event.clientX,
                startWidth: controller.derivation.pinnedWidthPx,
            };
            event.currentTarget.setPointerCapture(event.pointerId);
        },
        [controller],
    );

    const onPointerMove = useCallback(
        (event: ReactPointerEvent<HTMLButtonElement>) => {
            if (!controller || !dragRef.current) return;
            const delta = dragRef.current.startX - event.clientX;
            controller.setPinnedWidthPx(dragRef.current.startWidth + delta);
        },
        [controller],
    );

    const onPointerUp = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
        if (!dragRef.current) return;
        dragRef.current = null;
        try {
            event.currentTarget.releasePointerCapture(event.pointerId);
        } catch {
            /* ignore */
        }
    }, []);

    if (!controller) return null;

    const { derivation, openFloating, restoreDefaultWidth } = controller;
    const effective = derivation.effective;
    const isPinned = effective === "pinned";
    const isClosed = effective === "closed";

    return (
        <>
            {isPinned ? (
                <button
                    type="button"
                    data-bos-resize-handle
                    aria-label="Resize BOS"
                    title="Drag to resize · double-click restores default"
                    className="absolute left-0 top-0 z-[82] h-full w-1.5 -translate-x-1/2 cursor-col-resize border-0 bg-transparent p-0 hover:bg-alloy-juniper/25"
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                    onDoubleClick={() => restoreDefaultWidth()}
                />
            ) : null}

            {isClosed || (derivation.temporaryFallback && derivation.preferred === "pinned") ? (
                <button
                    type="button"
                    data-bos-launcher
                    data-adaptive-bos-rail-trigger
                    aria-label="Open BOS"
                    onClick={() => openFloating()}
                    className="fixed bottom-5 right-5 z-[91] inline-flex items-center gap-2 rounded-full border border-alloy-juniper/35 bg-white px-3.5 py-2.5 text-[12px] font-semibold text-alloy-juniper shadow-[0_8px_24px_rgba(15,23,42,0.14)] transition hover:bg-alloy-juniper/5"
                >
                    <BosMark size="sm" className="shrink-0" />
                    BOS
                </button>
            ) : null}
        </>
    );
}
