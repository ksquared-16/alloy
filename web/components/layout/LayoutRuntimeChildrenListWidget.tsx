"use client";

import { useLayoutRuntimeCompositionHints } from "@/lib/layout/runtime/layoutRuntimeCompositionContext";
import { summarizeLeadDrawerChildrenStrip } from "@/lib/layout/runtime/leadOverviewComposition";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import { readLayoutRuntimeRepeaterRows } from "@/lib/layout/runtime/readLayoutRuntimeRepeaterRows";
import { formatLayoutRuntimeStatusLabel } from "@/lib/layout/runtime/formatLayoutRuntimeStatusLabel";

const CHILDREN_REPEATER_ITEM = {
    id: "children",
    kind: "related_list" as const,
    source: "children",
    refKey: "children",
};

const MAX_VISIBLE_CHILDREN = 3;

type Props = {
    record: ProofRuntimeRecord;
    compact?: boolean;
    /** When true, body is count + label for LeadOperatingSummaryCard chrome. */
    operatingCard?: boolean;
};

function displayValue(raw: unknown): string | null {
    if (raw == null) return null;
    const text = String(raw).trim();
    return text.length > 0 ? text : null;
}

/** Compact summary-strip widget — count/status summary or row preview. */
export default function LayoutRuntimeChildrenListWidget({
    record,
    compact = false,
    operatingCard = false,
}: Props) {
    const { childrenListSummaryOnly } = useLayoutRuntimeCompositionHints();
    const summaryOnly = childrenListSummaryOnly === true;

    if (summaryOnly) {
        const summary = summarizeLeadDrawerChildrenStrip(record);
        return (
            <div
                className="flex min-h-0 flex-col justify-center gap-0.5"
                data-layout-runtime-children-list-widget="summary"
            >
                {operatingCard ?
                    <>
                        <span className="text-[1.125rem] font-semibold leading-none tabular-nums text-alloy-midnight">
                            {summary.count}
                        </span>
                        <span className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/45">
                            {summary.count === 1 ? "Child" : "Children"}
                        </span>
                        {summary.statusSummary ?
                            <span className="line-clamp-2 text-[10px] leading-snug text-alloy-midnight/50">
                                {summary.statusSummary}
                            </span>
                        :   null}
                    </>
                :   <>
                        <span className="text-[12px] font-semibold leading-snug text-alloy-midnight">{summary.label}</span>
                    </>
                }
            </div>
        );
    }

    const rows = readLayoutRuntimeRepeaterRows(record, CHILDREN_REPEATER_ITEM);
    const visibleRows = compact ? rows.slice(0, MAX_VISIBLE_CHILDREN) : rows;
    const overflowCount = compact && rows.length > MAX_VISIBLE_CHILDREN ? rows.length - MAX_VISIBLE_CHILDREN : 0;

    if (rows.length === 0) {
        return (
            <span className="text-xs text-[#9aa4bf]" data-layout-runtime-children-list-widget="empty">
                No children linked yet
            </span>
        );
    }

    return (
        <div className="min-h-0" data-layout-runtime-children-list-widget="true">
            <ul className={`flex flex-col ${compact ? "gap-1" : "gap-1.5"}`}>
                {visibleRows.map((row, index) => {
                    const name = displayValue(row["child.name"]) ?? "—";
                    const meta = [
                        displayValue(row["child.program"]),
                        formatLayoutRuntimeStatusLabel(row["child.status"], {
                            refKey: "child.status",
                            renderHint: "status",
                        }),
                    ]
                        .filter(Boolean)
                        .join(" · ");
                    return (
                        <li
                            key={String(row.id ?? index)}
                            className={
                                compact ?
                                    "truncate text-[11px] leading-snug text-alloy-midnight/85"
                                :   "rounded bg-[#f7f9fc] px-2 py-1 text-xs text-[#273f52]"
                            }
                            data-layout-runtime-children-list-row="true"
                        >
                            <div className={`truncate ${compact ? "font-semibold" : "font-medium"}`}>{name}</div>
                            {meta ?
                                <div className={`truncate ${compact ? "text-[10px] text-alloy-midnight/45" : "text-[10px] text-[#9aa4bf]"}`}>
                                    {meta}
                                </div>
                            :   null}
                        </li>
                    );
                })}
            </ul>
            {overflowCount > 0 ?
                <div
                    className="mt-1 text-[10px] font-medium text-alloy-midnight/45"
                    data-layout-runtime-children-list-overflow="true"
                >
                    +{overflowCount} more
                </div>
            :   null}
        </div>
    );
}
