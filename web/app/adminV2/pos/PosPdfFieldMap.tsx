"use client";

/**
 * POS-FP16/FP17 — PDF field map (review schematic with form context + manual mapping).
 *
 * Explicit canvas modes:
 * - select: click region to select; blank canvas deselects; regions recede when unselected
 * - draw_region: drag to define a rectangle; tiny drags ignored; returns to select on complete
 *
 * resize_region and pan are not canvas modes — viewport scroll/zoom is handled by
 * ProcessingSourceDocumentViewport without interfering with region overlays.
 */

import { useRef, useState } from "react";
import type { PageMap } from "@/lib/pos/processingCase/structure/pdfFieldMap";
import {
    isCanvasInteractionLocked,
    regionVisualStyle,
    resolveRegionVisualKind,
    shouldAcceptDrawRect,
    type ProcessingCanvasMode,
    type RegionVisualKind,
} from "@/lib/pos/processingCase/formDraft/processingCanvasInteraction";
import { WS_TEXT_MUTED, WS_TEXT_SECONDARY } from "@/components/workspace/workspaceTokens";

interface DragRect {
    x: number;
    y: number;
    w: number;
    h: number;
}

export type RegionOverlayMeta = {
    id: string;
    mappingOrigin?: "auto_detected" | "operator_created" | "operator_corrected";
};

export type PendingRegionOverlay = {
    page: number;
    x: number;
    y: number;
    w: number;
    h: number;
};

export default function PosPdfFieldMap({
    pages,
    selectedId,
    regionMeta = [],
    pendingRegion,
    canvasMode = "select",
    onSelect,
    onDeselect,
    onDrawRect,
}: {
    pages: PageMap[];
    selectedId: string | null;
    regionMeta?: RegionOverlayMeta[];
    pendingRegion?: PendingRegionOverlay | null;
    canvasMode?: ProcessingCanvasMode;
    onSelect: (id: string) => void;
    onDeselect?: () => void;
    onDrawRect?: (page: number, rect: DragRect) => void;
}) {
    if (pages.length === 0) return null;

    const metaById = new Map(regionMeta.map((m) => [m.id, m]));

    return (
        <div className="space-y-3" data-workspace-artifact-pages="true" data-canvas-mode={canvasMode}>
            {pages.map((pg) => (
                <PageSvg
                    key={pg.page}
                    pg={pg}
                    selectedId={selectedId}
                    metaById={metaById}
                    pendingRegion={pendingRegion?.page === pg.page ? pendingRegion : null}
                    canvasMode={canvasMode}
                    onSelect={onSelect}
                    onDeselect={onDeselect}
                    onDrawRect={onDrawRect}
                />
            ))}
        </div>
    );
}

function PageSvg({
    pg,
    selectedId,
    metaById,
    pendingRegion,
    canvasMode,
    onSelect,
    onDeselect,
    onDrawRect,
}: {
    pg: PageMap;
    selectedId: string | null;
    metaById: Map<string, RegionOverlayMeta>;
    pendingRegion: PendingRegionOverlay | null;
    canvasMode: ProcessingCanvasMode;
    onSelect: (id: string) => void;
    onDeselect?: () => void;
    onDrawRect?: (page: number, rect: DragRect) => void;
}) {
    const svgRef = useRef<SVGSVGElement | null>(null);
    const [start, setStart] = useState<{ x: number; y: number } | null>(null);
    const [drag, setDrag] = useState<DragRect | null>(null);
    const drawMode = canvasMode === "draw_region";

    const toViewBox = (clientX: number, clientY: number) => {
        const el = svgRef.current;
        if (!el) return { x: 0, y: 0 };
        const r = el.getBoundingClientRect();
        const x = ((clientX - r.left) / Math.max(1, r.width)) * pg.width;
        const y = ((clientY - r.top) / Math.max(1, r.height)) * pg.height;
        return { x: Math.max(0, Math.min(pg.width, x)), y: Math.max(0, Math.min(pg.height, y)) };
    };

    const onDown = (e: React.MouseEvent) => {
        if (!drawMode) return;
        e.stopPropagation();
        e.preventDefault();
        const p = toViewBox(e.clientX, e.clientY);
        setStart(p);
        setDrag({ x: p.x, y: p.y, w: 0, h: 0 });
    };

    const onMove = (e: React.MouseEvent) => {
        if (!drawMode || !start) return;
        const p = toViewBox(e.clientX, e.clientY);
        setDrag({
            x: Math.min(start.x, p.x),
            y: Math.min(start.y, p.y),
            w: Math.abs(p.x - start.x),
            h: Math.abs(p.y - start.y),
        });
    };

    const onUp = () => {
        if (!drawMode || !drag) {
            setStart(null);
            setDrag(null);
            return;
        }
        if (shouldAcceptDrawRect(drag.w, drag.h) && onDrawRect) {
            onDrawRect(pg.page, drag);
        }
        setStart(null);
        setDrag(null);
    };

    const onCanvasClick = (e: React.MouseEvent) => {
        if (drawMode || isCanvasInteractionLocked(canvasMode)) return;
        if (e.target === svgRef.current) onDeselect?.();
    };

    const onRegionClick = (e: React.MouseEvent, id: string) => {
        if (drawMode) return;
        e.stopPropagation();
        if (selectedId === id) onDeselect?.();
        else onSelect(id);
    };

    return (
        <article
            className={`rounded-lg border bg-white p-2 shadow-[0_1px_4px_rgba(24,39,58,0.05)] ${
                drawMode ? "border-alloy-bend-pine/30 ring-1 ring-alloy-bend-pine/10" : "border-alloy-stone/18"
            }`}
            data-workspace-artifact-page="true"
            data-canvas-mode={canvasMode}
        >
            <div className={`mb-1.5 flex items-center justify-between text-[10px] ${WS_TEXT_SECONDARY}`}>
                <span className="font-semibold uppercase tracking-[0.06em]">
                    Page {pg.page} · {pg.rects.length} field{pg.rects.length === 1 ? "" : "s"}
                </span>
                {!pg.hasPageDims ? <span className={`italic ${WS_TEXT_MUTED}`}>Relative layout only</span> : null}
                {drawMode ? <span className="font-semibold text-alloy-bend-pine">Draw region</span> : null}
            </div>
            <svg
                ref={svgRef}
                viewBox={`0 0 ${pg.width} ${pg.height}`}
                className="w-full rounded-md border border-alloy-stone/15"
                style={{
                    aspectRatio: `${pg.width} / ${pg.height}`,
                    background: "#fff",
                    cursor: drawMode ? "crosshair" : "default",
                }}
                role="img"
                aria-label={`Field map for page ${pg.page}`}
                data-testid={`pdf-field-map-page-${pg.page}`}
                onClick={onCanvasClick}
                onMouseDown={onDown}
                onMouseMove={onMove}
                onMouseUp={onUp}
                onMouseLeave={onUp}
            >
                {pg.texts.map((t, i) => (
                    <text key={i} x={t.x} y={t.y} fontSize={Math.max(6, pg.height * 0.012)} fill="#b9b4ad" style={{ pointerEvents: "none" }}>
                        {t.str.length > 40 ? `${t.str.slice(0, 40)}…` : t.str}
                    </text>
                ))}

                {pg.rects.map((r) => {
                    const sel = r.id === selectedId;
                    const origin = metaById.get(r.id)?.mappingOrigin;
                    const kind = resolveRegionVisualKind(origin, false);
                    return (
                        <RegionRect
                            key={r.id}
                            kind={kind}
                            selected={sel}
                            x={r.x}
                            y={r.y}
                            w={r.w}
                            h={r.h}
                            title={`${r.label} · ${r.type}${r.confidence ? ` · ${r.confidence}` : ""}`}
                            cursor={drawMode ? "crosshair" : "pointer"}
                            onClick={(e) => onRegionClick(e, r.id)}
                            testId={`region-${r.id}`}
                        />
                    );
                })}

                {pendingRegion ? (
                    <RegionRect
                        kind="operator_unsaved"
                        selected
                        x={pendingRegion.x}
                        y={pendingRegion.y}
                        w={pendingRegion.w}
                        h={pendingRegion.h}
                        title="Unsaved manual region"
                        cursor="default"
                        testId="region-pending-manual"
                    />
                ) : null}

                {drag ? (
                    <RegionRect
                        kind="operator_unsaved"
                        selected={false}
                        x={drag.x}
                        y={drag.y}
                        w={drag.w}
                        h={drag.h}
                        title="Drawing…"
                        cursor="crosshair"
                        testId="region-draw-preview"
                    />
                ) : null}
            </svg>
        </article>
    );
}

function RegionRect({
    kind,
    selected,
    x,
    y,
    w,
    h,
    title,
    cursor,
    onClick,
    testId,
}: {
    kind: RegionVisualKind;
    selected: boolean;
    x: number;
    y: number;
    w: number;
    h: number;
    title: string;
    cursor: string;
    onClick?: (e: React.MouseEvent) => void;
    testId?: string;
}) {
    const style = regionVisualStyle(kind, selected);
    return (
        <g style={{ cursor }} onClick={onClick} data-testid={testId}>
            <title>{title}</title>
            <rect
                x={x}
                y={y}
                width={w}
                height={h}
                rx={1.5}
                fill={style.fill}
                fillOpacity={style.fillOpacity}
                stroke={style.stroke}
                strokeWidth={style.strokeWidth}
                strokeDasharray={style.strokeDasharray}
            />
        </g>
    );
}
