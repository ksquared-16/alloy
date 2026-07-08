"use client";

/**
 * POS-FP16/FP17 — PDF field map (review schematic with form context + manual mapping).
 *
 * Renders the detected field regions as an SVG schematic, page by page, from page+bbox —
 * plus the page's text runs (labels/headers) behind the highlights so the operator sees
 * the FORM CONTEXT, not blank boxes. We draw this ourselves (not a div-overlay on the
 * opaque native PDF viewer) so geometry, selection, and manual mapping are reliable.
 *
 * Clicking a region selects the matching field row. In mapping mode (mappingPage set),
 * dragging on that page draws a rectangle that is reported via onDrawRect — the parent
 * inverts it to a PDF bbox and assigns it to the unmapped field.
 */

import { useRef, useState } from "react";
import type { PageMap } from "@/lib/pos/processingCase/structure/pdfFieldMap";

const PINE = "#00A283";

interface DragRect {
    x: number;
    y: number;
    w: number;
    h: number;
}

export default function PosPdfFieldMap({
    pages,
    selectedId,
    onSelect,
    mapping = false,
    onDrawRect,
}: {
    pages: PageMap[];
    selectedId: string | null;
    onSelect: (id: string) => void;
    mapping?: boolean;
    onDrawRect?: (page: number, rect: DragRect) => void;
}) {
    if (pages.length === 0) return null;
    return (
        <div className="space-y-2.5">
            {pages.map((pg) => (
                <PageSvg key={pg.page} pg={pg} selectedId={selectedId} onSelect={onSelect} mapping={mapping} onDrawRect={onDrawRect} />
            ))}
        </div>
    );
}

function PageSvg({
    pg,
    selectedId,
    onSelect,
    mapping,
    onDrawRect,
}: {
    pg: PageMap;
    selectedId: string | null;
    onSelect: (id: string) => void;
    mapping: boolean;
    onDrawRect?: (page: number, rect: DragRect) => void;
}) {
    const svgRef = useRef<SVGSVGElement | null>(null);
    const [start, setStart] = useState<{ x: number; y: number } | null>(null);
    const [drag, setDrag] = useState<DragRect | null>(null);

    const toViewBox = (clientX: number, clientY: number) => {
        const el = svgRef.current;
        if (!el) return { x: 0, y: 0 };
        const r = el.getBoundingClientRect();
        const x = ((clientX - r.left) / Math.max(1, r.width)) * pg.width;
        const y = ((clientY - r.top) / Math.max(1, r.height)) * pg.height;
        return { x: Math.max(0, Math.min(pg.width, x)), y: Math.max(0, Math.min(pg.height, y)) };
    };

    const onDown = (e: React.MouseEvent) => {
        if (!mapping) return;
        const p = toViewBox(e.clientX, e.clientY);
        setStart(p);
        setDrag({ x: p.x, y: p.y, w: 0, h: 0 });
    };
    const onMove = (e: React.MouseEvent) => {
        if (!mapping || !start) return;
        const p = toViewBox(e.clientX, e.clientY);
        setDrag({ x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) });
    };
    const onUp = () => {
        if (!mapping || !drag) {
            setStart(null);
            return;
        }
        if (drag.w >= 3 && drag.h >= 3 && onDrawRect) onDrawRect(pg.page, drag);
        setStart(null);
        setDrag(null);
    };

    return (
        <div>
            <div className="mb-1 flex items-center justify-between text-[10px] text-stone-400">
                <span className="font-medium uppercase tracking-wide">
                    Page {pg.page} · {pg.rects.length} field{pg.rects.length === 1 ? "" : "s"}
                </span>
                {!pg.hasPageDims ? <span className="italic">Context unavailable — relative layout only</span> : null}
                {mapping ? <span className="font-medium text-alloy-bend-pine">Drag to map the field</span> : null}
            </div>
            <svg
                ref={svgRef}
                viewBox={`0 0 ${pg.width} ${pg.height}`}
                className="w-full rounded-md border border-stone-200"
                style={{ aspectRatio: `${pg.width} / ${pg.height}`, background: "#fff", cursor: mapping ? "crosshair" : "default" }}
                role="img"
                aria-label={`Field map for page ${pg.page}`}
                onMouseDown={onDown}
                onMouseMove={onMove}
                onMouseUp={onUp}
                onMouseLeave={onUp}
            >
                {/* Form context — page text runs, faint, behind the highlights. */}
                {pg.texts.map((t, i) => (
                    <text key={i} x={t.x} y={t.y} fontSize={Math.max(6, pg.height * 0.012)} fill="#b9b4ad" style={{ pointerEvents: "none" }}>
                        {t.str.length > 40 ? `${t.str.slice(0, 40)}…` : t.str}
                    </text>
                ))}
                {/* Detected/selected field highlights. */}
                {pg.rects.map((r) => {
                    const sel = r.id === selectedId;
                    return (
                        <g key={r.id} style={{ cursor: mapping ? "crosshair" : "pointer" }} onClick={() => !mapping && onSelect(r.id)}>
                            <title>{`${r.label} · ${r.type}${r.confidence ? ` · ${r.confidence}` : ""}`}</title>
                            <rect
                                x={r.x}
                                y={r.y}
                                width={r.w}
                                height={r.h}
                                rx={1.5}
                                fill={PINE}
                                fillOpacity={sel ? 0.34 : 0.12}
                                stroke={sel ? PINE : "#9bbcb3"}
                                strokeWidth={sel ? 2.2 : 1}
                            />
                        </g>
                    );
                })}
                {/* In-progress mapping rectangle. */}
                {drag ? (
                    <rect x={drag.x} y={drag.y} width={drag.w} height={drag.h} rx={1.5} fill={PINE} fillOpacity={0.2} stroke={PINE} strokeWidth={2} strokeDasharray="4 2" />
                ) : null}
            </svg>
        </div>
    );
}
