"use client";

import DrawerOverviewEmptyState from "@/components/layout/DrawerOverviewEmptyState";
import LayoutRuntimePersonLinkSurface from "@/components/layout/LayoutRuntimePersonLinkSurface";
import type { AdornmentActionHandler } from "@/components/layout/LayoutRuntimePlanView";
import type { LayoutCollectionColumn, LayoutItem } from "@/lib/layout/layoutV2";
import { formatLayoutRuntimeRepeaterColumnDisplay } from "@/lib/layout/runtime/formatLayoutRuntimeRepeaterColumnDisplay";
import { layoutRuntimeRepeaterRowReactKey } from "@/lib/layout/runtime/layoutRuntimeRepeaterRowKey";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import { resolveChildRowTemplateRowLayout } from "@/lib/layout/runtime/resolveChildRowTemplateRowLayout";
import {
    PRESENTATION_DATA_VALUE_COMPACT,
    PRESENTATION_LABEL,
} from "@/lib/presentation/presentationTypography";

type Props = {
    item: LayoutItem;
    columns: LayoutCollectionColumn[];
    rows: ProofRuntimeRecord[];
    anchorRecord: ProofRuntimeRecord;
    entityLabel?: string;
    onAdornmentAction?: AdornmentActionHandler;
};

function isPersonNameColumn(col: LayoutCollectionColumn): boolean {
    const key = col.refKey.toLowerCase();
    return key.includes("name") || key.includes("display_name") || key.includes("primary_contact");
}

export default function LeadContactRepeaterCardList({
    item,
    columns,
    rows,
    anchorRecord,
    entityLabel = "contacts",
    onAdornmentAction,
}: Props) {
    const configuredRowLayout = resolveChildRowTemplateRowLayout(item);
    const nameColumn = columns.find(isPersonNameColumn) ?? columns[0];

    const renderFieldValue = (row: ProofRuntimeRecord, col: LayoutCollectionColumn) => {
        const display = formatLayoutRuntimeRepeaterColumnDisplay(row, col);
        if (isPersonNameColumn(col)) {
            const personId = String(row["person.id"] ?? row.person_id ?? row.id ?? "").trim();
            const synthetic: LayoutItem = {
                id: col.refKey,
                kind: "field",
                refKey: col.refKey,
            };
            if (personId) {
                return (
                    <LayoutRuntimePersonLinkSurface
                        componentName="LeadContactRepeaterCardList"
                        surface="drawer"
                        item={synthetic}
                        personId={personId}
                        rowRecord={row}
                        anchorRecord={anchorRecord}
                        display={display}
                        onAction={onAdornmentAction}
                        className={`block min-w-0 truncate font-medium text-alloy-midnight hover:text-alloy-juniper ${PRESENTATION_DATA_VALUE_COMPACT}`}
                    />
                );
            }
        }
        const key = col.refKey.toLowerCase();
        if (key.includes("primary") && display) {
            return (
                <span className="inline-flex rounded-full border border-alloy-juniper/20 bg-alloy-juniper/8 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-alloy-midnight/75">
                    {display}
                </span>
            );
        }
        return <span className={PRESENTATION_DATA_VALUE_COMPACT}>{display}</span>;
    };

    return (
        <div className="min-w-0" data-lead-contact-repeater-card-list="true">
            {rows.length === 0 ?
                <div className="p-2">
                    <DrawerOverviewEmptyState
                        message={`No ${entityLabel} on this record yet.`}
                        hint="Link household adults or add contact details to populate this list."
                        compact
                    />
                </div>
            :   <ul className="flex flex-col gap-2 p-2">
                    {rows.map((row, index) => {
                        const rowKey = layoutRuntimeRepeaterRowReactKey(row, index, item.source ?? item.refKey);
                        if (configuredRowLayout) {
                            return (
                                <li
                                    key={rowKey}
                                    className="rounded-lg border border-alloy-stone/12 bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(24,39,58,0.03)]"
                                    data-contact-repeater-card-row="true"
                                >
                                    <div className="space-y-2">
                                        {configuredRowLayout.map((layoutRow) => (
                                            <div
                                                key={layoutRow.rowIndex}
                                                className="grid gap-2"
                                                style={{
                                                    gridTemplateColumns: `repeat(${Math.max(1, layoutRow.columnCount)}, minmax(0, 1fr))`,
                                                }}
                                            >
                                                {layoutRow.slots.map((col, slot) => {
                                                    if (!col) return <div key={slot} />;
                                                    return (
                                                        <div key={`${layoutRow.rowIndex}-${slot}`} className="min-w-0">
                                                            <p className={PRESENTATION_LABEL}>{col.label ?? col.refKey}</p>
                                                            <div className="mt-0.5">{renderFieldValue(row, col)}</div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ))}
                                    </div>
                                </li>
                            );
                        }

                        const primaryCol = nameColumn!;
                        return (
                            <li
                                key={rowKey}
                                className="rounded-lg border border-alloy-stone/12 bg-white px-3 py-2.5"
                                data-contact-repeater-card-row="true"
                            >
                                <div className="font-medium">{renderFieldValue(row, primaryCol)}</div>
                                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                                    {columns
                                        .filter((col) => col !== primaryCol)
                                        .map((col) => (
                                            <span key={col.refKey} className="text-[11px] text-alloy-midnight/65">
                                                {renderFieldValue(row, col)}
                                            </span>
                                        ))}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            }
        </div>
    );
}
