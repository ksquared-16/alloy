"use client";

import type { LayoutCollectionColumn, LayoutItem } from "@/lib/layout/layoutV2";
import { formatLayoutRuntimeRepeaterColumnDisplay } from "@/lib/layout/runtime/formatLayoutRuntimeRepeaterColumnDisplay";
import { layoutRuntimeRepeaterRowReactKey } from "@/lib/layout/runtime/layoutRuntimeRepeaterRowKey";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

type Props = {
    item: LayoutItem;
    columns: LayoutCollectionColumn[];
    rows: ProofRuntimeRecord[];
    emptyMessage?: string;
};

/** Single-line related-list rows for Experience Builder compact presentation. */
export default function LayoutRuntimeRelatedListCompactRows({
    item,
    columns,
    rows,
    emptyMessage = "No records yet.",
}: Props) {
    const primaryColumn = columns[0];
    const detailColumns = columns.slice(1);

    return (
        <ul className="divide-y divide-alloy-stone/10" data-layout-runtime-related-list-compact="true">
            {rows.length === 0 ?
                <li className="px-3 py-4 text-xs text-alloy-midnight/50">{emptyMessage}</li>
            :   rows.map((row, index) => {
                    const rowKey = layoutRuntimeRepeaterRowReactKey(row, index, item.source ?? item.refKey);
                    const primary =
                        primaryColumn ?
                            formatLayoutRuntimeRepeaterColumnDisplay(row, primaryColumn)
                        :   "—";
                    const details = detailColumns
                        .map((col) => formatLayoutRuntimeRepeaterColumnDisplay(row, col))
                        .filter((value) => value && value !== "—");
                    return (
                        <li
                            key={rowKey}
                            className="flex min-w-0 items-center justify-between gap-3 px-3 py-2.5 text-xs"
                            data-layout-runtime-related-list-compact-row="true"
                        >
                            <span className="min-w-0 truncate font-medium text-alloy-midnight">{primary}</span>
                            {details.length > 0 ?
                                <span className="min-w-0 truncate text-alloy-midnight/55">{details.join(" · ")}</span>
                            :   null}
                        </li>
                    );
                })
            }
        </ul>
    );
}
