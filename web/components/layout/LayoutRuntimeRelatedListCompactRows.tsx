"use client";

import type { LayoutCollectionColumn, LayoutItem } from "@/lib/layout/layoutV2";
import { formatLayoutRuntimeCompactRowLine } from "@/lib/layout/runtime/formatLayoutRuntimeCompactRowLine";
import { layoutRuntimeRepeaterRowReactKey } from "@/lib/layout/runtime/layoutRuntimeRepeaterRowKey";
import { resolveChildRowTemplateRowLayout } from "@/lib/layout/runtime/resolveChildRowTemplateRowLayout";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

type Props = {
    item: LayoutItem;
    columns: LayoutCollectionColumn[];
    rows: ProofRuntimeRecord[];
    emptyMessage?: string;
};

function CompactRowLine({
    row,
    slots,
    rowIndex,
}: {
    row: ProofRuntimeRecord;
    slots: Array<LayoutCollectionColumn | undefined>;
    rowIndex: number;
}) {
    const { segments, lineClassName } = formatLayoutRuntimeCompactRowLine(row, slots, rowIndex);
    if (segments.length === 0) return null;

    return (
        <div className={`min-w-0 truncate ${lineClassName}`} data-layout-runtime-compact-row-line={rowIndex}>
            {segments.map((segment, index) => (
                <span key={index}>
                    {index > 0 ?
                        <span className="mx-1 text-alloy-midnight/30">·</span>
                    :   null}
                    <span className={segment.className || undefined}>{segment.text}</span>
                </span>
            ))}
        </div>
    );
}

/** Configured-row related-list compact presentation — one record per block, stacked row lines. */
export default function LayoutRuntimeRelatedListCompactRows({
    item,
    columns,
    rows,
    emptyMessage = "No records yet.",
}: Props) {
    const rowLayout = resolveChildRowTemplateRowLayout(item);

    return (
        <ul className="divide-y divide-alloy-stone/10" data-layout-runtime-related-list-compact="true">
            {rows.length === 0 ?
                <li className="px-3 py-4 text-xs text-alloy-midnight/50">{emptyMessage}</li>
            :   rows.map((row, index) => {
                    const rowKey = layoutRuntimeRepeaterRowReactKey(row, index, item.source ?? item.refKey);

                    if (rowLayout && rowLayout.length > 0) {
                        const lines = rowLayout
                            .map((layoutRow, rowIndex) => (
                                <CompactRowLine
                                    key={rowIndex}
                                    row={row}
                                    slots={layoutRow.slots}
                                    rowIndex={rowIndex}
                                />
                            ))
                            .filter(Boolean);

                        return (
                            <li
                                key={rowKey}
                                className="flex min-w-0 flex-col gap-0.5 px-3 py-2.5"
                                data-layout-runtime-related-list-compact-row="true"
                            >
                                {lines.length > 0 ?
                                    lines
                                :   <span className="text-xs text-alloy-midnight/50">—</span>}
                            </li>
                        );
                    }

                    const primaryColumn = columns[0];
                    const detailColumns = columns.slice(1);
                    const primary =
                        primaryColumn ?
                            formatLayoutRuntimeCompactRowLine(row, [primaryColumn], 0).segments
                                .map((s) => s.text)
                                .join(" · ")
                        :   "—";
                    const details = detailColumns
                        .map((col) => formatLayoutRuntimeCompactRowLine(row, [col], 1).segments[0]?.text)
                        .filter((value) => value && value !== "—");

                    return (
                        <li
                            key={rowKey}
                            className="flex min-w-0 flex-col gap-0.5 px-3 py-2.5"
                            data-layout-runtime-related-list-compact-row="true"
                        >
                            <span className="min-w-0 truncate text-xs font-medium text-alloy-midnight">{primary}</span>
                            {details.length > 0 ?
                                <span className="min-w-0 truncate text-xs text-alloy-midnight/55">{details.join(" · ")}</span>
                            :   null}
                        </li>
                    );
                })
            }
        </ul>
    );
}
