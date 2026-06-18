"use client";

import { useCallback, useRef } from "react";
import {
    clampLayoutBuilderInspectorRailWidth,
    writeLayoutBuilderInspectorRailWidth,
} from "@/lib/layout/layoutBuilderInspectorRailWidth";

type Props = {
    onResize: (widthPx: number) => void;
};

/** Drag handle on the left edge of the layout builder inspector rail. */
export default function LayoutBuilderInspectorResizeHandle({ onResize }: Props) {
    const draggingRef = useRef(false);

    const onPointerDown = useCallback(
        (event: React.PointerEvent<HTMLButtonElement>) => {
            event.preventDefault();
            draggingRef.current = true;
            event.currentTarget.setPointerCapture(event.pointerId);

            const startX = event.clientX;
            const startWidth = event.currentTarget.parentElement?.getBoundingClientRect().width ?? 0;

            const onMove = (moveEvent: PointerEvent) => {
                if (!draggingRef.current) return;
                const delta = startX - moveEvent.clientX;
                const next = clampLayoutBuilderInspectorRailWidth(startWidth + delta);
                onResize(next);
            };

            const onUp = (upEvent: PointerEvent) => {
                draggingRef.current = false;
                window.removeEventListener("pointermove", onMove);
                window.removeEventListener("pointerup", onUp);
                const delta = startX - upEvent.clientX;
                const next = clampLayoutBuilderInspectorRailWidth(startWidth + delta);
                writeLayoutBuilderInspectorRailWidth(next);
                onResize(next);
            };

            window.addEventListener("pointermove", onMove);
            window.addEventListener("pointerup", onUp);
        },
        [onResize],
    );

    return (
        <button
            type="button"
            aria-label="Resize properties panel"
            className="absolute inset-y-0 left-0 z-20 w-1.5 -translate-x-1/2 cursor-col-resize border-0 bg-transparent p-0 hover:bg-alloy-pine/20 focus-visible:bg-alloy-pine/25"
            data-testid="layout-builder-inspector-resize-handle"
            onPointerDown={onPointerDown}
        />
    );
}
