"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import {
    computeFocusPanelGridColumns,
    resolveFocusPanelCellGridSpan,
    type FocusPanelGridRow,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardGrid";

type Props = {
    rows: FocusPanelGridRow[];
    renderCell: (cellKey: string) => ReactNode;
    className?: string;
};

/**
 * Concept B responsive card grid — reads its own width for column collapse.
 */
export default function FocusPanelCardGrid({ rows, renderCell, className }: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [columns, setColumns] = useState<1 | 2 | 3 | 4>(2);

    useEffect(() => {
        const el = containerRef.current;
        if (!el || typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver((entries) => {
            const width = entries[0]?.contentRect.width ?? el.clientWidth;
            setColumns(computeFocusPanelGridColumns(width));
        });
        ro.observe(el);
        setColumns(computeFocusPanelGridColumns(el.clientWidth));
        return () => ro.disconnect();
    }, []);

    return (
        <div
            ref={containerRef}
            className={["alloy-os-focus-panel-grid", className].filter(Boolean).join(" ")}
            data-focus-panel-card-grid="true"
            data-focus-panel-grid-columns={columns}
            style={{ ["--alloy-os-fp-cols" as string]: columns }}
        >
            {rows.flatMap((row) =>
                row.cells.map((cell) => {
                    const span = resolveFocusPanelCellGridSpan(cell.span, columns);
                    return (
                        <div
                            key={cell.key}
                            className="alloy-os-focus-panel-grid__cell"
                            data-focus-panel-grid-cell={cell.key}
                            data-focus-panel-grid-span={cell.span}
                            style={{ gridColumn: `span ${span}` }}
                        >
                            {renderCell(cell.key)}
                        </div>
                    );
                }),
            )}
        </div>
    );
}
