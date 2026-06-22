"use client";

/**
 * POS-FP16 — PDF field map (review schematic).
 *
 * Draws the detected AcroForm field regions as an SVG schematic, page by page, from the
 * fields' `page` + `bbox`. We render this ourselves (not a div-overlay on the native PDF
 * viewer, which is an opaque embed) so selection + geometry are reliable. Clicking a
 * region selects the matching field row, and a selected row highlights its region.
 */

import type { PageMap } from "@/lib/pos/processingCase/structure/pdfFieldMap";

const PINE = "#00A283";

export default function PosPdfFieldMap({
    pages,
    selectedId,
    onSelect,
}: {
    pages: PageMap[];
    selectedId: string | null;
    onSelect: (id: string) => void;
}) {
    if (pages.length === 0) return null;
    return (
        <div className="space-y-2.5">
            {pages.map((pg) => (
                <div key={pg.page}>
                    <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-stone-400">
                        Page {pg.page} · {pg.rects.length} field{pg.rects.length === 1 ? "" : "s"}
                    </div>
                    <svg
                        viewBox={`0 0 ${pg.width} ${pg.height}`}
                        className="w-full rounded-md border border-stone-200"
                        style={{ aspectRatio: `${pg.width} / ${pg.height}`, background: "#fff" }}
                        role="img"
                        aria-label={`Detected field map for page ${pg.page}`}
                    >
                        {pg.rects.map((r) => {
                            const sel = r.id === selectedId;
                            return (
                                <g key={r.id} style={{ cursor: "pointer" }} onClick={() => onSelect(r.id)}>
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
                    </svg>
                </div>
            ))}
        </div>
    );
}
