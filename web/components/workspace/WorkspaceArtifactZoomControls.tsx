"use client";

/**
 * @module WorkspaceArtifactZoomControls
 *
 * Canonical zoom toolbar for artifact document viewports (PDF / region stacks).
 */

import { Minus, Plus } from "lucide-react";

import { WS_TEXT_SECONDARY } from "@/components/workspace/workspaceTokens";

const ZOOM_MIN = 50;
const ZOOM_MAX = 200;
const ZOOM_STEP = 25;

const ZOOM_BTN =
    "inline-flex h-6 w-6 items-center justify-center rounded border border-alloy-stone/20 text-alloy-midnight/65 hover:bg-alloy-stone/[0.05] disabled:opacity-40";

export default function WorkspaceArtifactZoomControls({
    zoom,
    onZoomChange,
    onFitWidth,
}: {
    zoom: number;
    onZoomChange: (next: number) => void;
    onFitWidth: () => void;
}) {
    return (
        <div
            className="flex shrink-0 items-center justify-end gap-1.5 border-b border-alloy-stone/15 bg-white px-2 py-1"
            data-workspace-artifact-zoom="true"
        >
            <button
                type="button"
                onClick={onFitWidth}
                className="rounded border border-alloy-stone/20 px-2 py-0.5 text-[10px] font-medium text-alloy-midnight/70 hover:bg-alloy-stone/[0.04]"
            >
                Fit width
            </button>
            <button
                type="button"
                aria-label="Zoom out"
                disabled={zoom <= ZOOM_MIN}
                onClick={() => onZoomChange(Math.max(ZOOM_MIN, zoom - ZOOM_STEP))}
                className={ZOOM_BTN}
            >
                <Minus className="h-3 w-3" aria-hidden strokeWidth={2} />
            </button>
            <span className={`min-w-[2.75rem] text-center text-[10px] font-medium tabular-nums ${WS_TEXT_SECONDARY}`}>
                {zoom}%
            </span>
            <button
                type="button"
                aria-label="Zoom in"
                disabled={zoom >= ZOOM_MAX}
                onClick={() => onZoomChange(Math.min(ZOOM_MAX, zoom + ZOOM_STEP))}
                className={ZOOM_BTN}
            >
                <Plus className="h-3 w-3" aria-hidden strokeWidth={2} />
            </button>
        </div>
    );
}
