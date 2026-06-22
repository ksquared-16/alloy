"use client";

import type { LayoutCollectionColumn, LayoutItem } from "@/lib/layout/layoutV2";
import LayoutRuntimeRelatedListCell from "@/components/layout/LayoutRuntimeRelatedListCell";
import type { AdornmentActionHandler } from "@/components/layout/LayoutRuntimePlanView";
import { layoutRuntimeRepeaterRowReactKey } from "@/lib/layout/runtime/layoutRuntimeRepeaterRowKey";
import { resolveChildRowTemplateRowLayout } from "@/lib/layout/runtime/resolveChildRowTemplateRowLayout";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

type Props = {
    item: LayoutItem;
    columns: LayoutCollectionColumn[];
    rows: ProofRuntimeRecord[];
    anchorRecord?: ProofRuntimeRecord;
    onAdornmentAction?: AdornmentActionHandler;
    emptyMessage?: string;
};

const TIER_LINE_CLASS = [
    "flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-alloy-midnight",
    "flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-alloy-midnight/70",
    "flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[11px] text-alloy-midnight/50",
] as const;

/** Configured-row related-list compact presentation — one record per block, stacked row lines. */
export default function LayoutRuntimeRelatedListCompactRows({
    item,
    columns,
    rows,
    anchorRecord,
    onAdornmentAction,
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
                        const lines = rowLayout.map((layoutRow, rowIndex) => {
                            const slots = layoutRow.slots.filter((col): col is LayoutCollectionColumn => Boolean(col));
                            if (slots.length === 0) return null;
                            return (
                                <div
                                    key={rowIndex}
                                    className={TIER_LINE_CLASS[Math.min(rowIndex, 2)]}
                                    data-layout-runtime-compact-row-line={rowIndex}
                                >
                                    {layoutRow.slots.map((col, slotIndex) =>
                                        col ?
                                            <LayoutRuntimeRelatedListCell
                                                key={`${col.refKey}-${slotIndex}`}
                                                row={row}
                                                col={col}
                                                rowKey={rowKey}
                                                anchorRecord={anchorRecord}
                                                onAction={onAdornmentAction}
                                            />
                                        :   null,
                                    )}
                                </div>
                            );
                        }).filter(Boolean);

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

                    return (
                        <li
                            key={rowKey}
                            className="flex min-w-0 flex-col gap-0.5 px-3 py-2.5"
                            data-layout-runtime-related-list-compact-row="true"
                        >
                            <div className={TIER_LINE_CLASS[0]}>
                                {columns.map((col) => (
                                    <LayoutRuntimeRelatedListCell
                                        key={col.refKey}
                                        row={row}
                                        col={col}
                                        rowKey={rowKey}
                                        anchorRecord={anchorRecord}
                                        onAction={onAdornmentAction}
                                    />
                                ))}
                            </div>
                        </li>
                    );
                })
            }
        </ul>
    );
}
