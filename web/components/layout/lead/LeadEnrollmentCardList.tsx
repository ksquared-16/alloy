"use client";

import { useCallback, useState } from "react";
import type { LayoutCollectionColumn, LayoutItem } from "@/lib/layout/layoutV2";
import { normalizeRefKeyOnRead } from "@/lib/layout/layoutRefKeyAliases";
import LayoutRuntimeChildLinkSurface from "@/components/layout/LayoutRuntimeChildLinkSurface";
import { useLayoutRuntimeDrawerEdit } from "@/components/layout/LayoutRuntimeDrawerEditProvider";
import LayoutRuntimeFieldInput from "@/components/layout/LayoutRuntimeFieldInput";
import type { AdornmentActionHandler } from "@/components/layout/LayoutRuntimePlanView";
import {
    formatLayoutRuntimeRepeaterColumnDisplay,
    formatLeadEnrollmentCardMetaLine,
} from "@/lib/layout/runtime/formatLayoutRuntimeRepeaterColumnDisplay";
import { layoutRuntimeFieldIsEditable } from "@/lib/layout/runtime/layoutRuntimeFieldEditability";
import {
    enrollmentGridColumnIsEditable,
    readEnrollmentGridCellRole,
} from "@/lib/layout/runtime/enrollmentGridPresentation";
import { layoutRuntimeEnrollmentPlacementDependentValueReader } from "@/lib/layout/runtime/resolveLayoutRuntimeEnrollmentPlacementContext";
import { layoutRuntimeRepeaterRowReactKey } from "@/lib/layout/runtime/layoutRuntimeRepeaterRowKey";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";

type Props = {
    item: LayoutItem;
    columns: LayoutCollectionColumn[];
    rows: ProofRuntimeRecord[];
    anchorRecord: ProofRuntimeRecord;
    overflowFooter?: React.ReactNode;
    canMutate?: boolean;
    onAdornmentAction?: AdornmentActionHandler;
};

/**
 * Compact child enrollment card list — designed operational rows, not a data table.
 */
export default function LeadEnrollmentCardList({
    item,
    columns,
    rows,
    anchorRecord,
    overflowFooter,
    canMutate,
    onAdornmentAction,
}: Props) {
    const edit = useLayoutRuntimeDrawerEdit();
    const readFirst = true;
    const [editingRowKeys, setEditingRowKeys] = useState<Set<string>>(() => new Set());

    const toggleRowEdit = useCallback((rowKey: string) => {
        setEditingRowKeys((prev) => {
            const next = new Set(prev);
            if (next.has(rowKey)) next.delete(rowKey);
            else next.add(rowKey);
            return next;
        });
    }, []);

    const nameColumn = columns.find((c) => readEnrollmentGridCellRole(item, c) === "primary_link") ?? columns[0];
    const metaColumns = columns.filter((c) => c !== nameColumn);

    const rowCanEdit = (rowKey: string, row: ProofRuntimeRecord, index: number) => {
        if (canMutate === false || !edit) return false;
        return columns.some((col) => {
            const editableRefKey = normalizeRefKeyOnRead(col.refKey);
            return (
                layoutRuntimeFieldIsEditable(
                    { refKey: editableRefKey, editable: col.editable ?? true },
                    "production",
                ) && enrollmentGridColumnIsEditable(col)
            );
        });
    };

    return (
        <div className="min-w-0" data-lead-enrollment-card-list="true" data-layout-runtime-enrollment-read-mode="card-list">
            {rows.length === 0 ?
                <div className="px-4 py-5 text-[12px] text-alloy-midnight/40">No children linked yet.</div>
            :   <ul className="flex flex-col gap-2 p-2">
                    {rows.map((row, index) => {
                        const rowKey = layoutRuntimeRepeaterRowReactKey(row, index, item.source ?? item.refKey);
                        const isEditing = readFirst ? editingRowKeys.has(rowKey) : false;
                        const showEdit = readFirst && rowCanEdit(rowKey, row, index);
                        const nameCol = nameColumn!;
                        const nameSynthetic: LayoutItem = {
                            id: nameCol.refKey,
                            kind: "field",
                            refKey: nameCol.refKey,
                            adornment: nameCol.adornment,
                        };
                        const metaLine = formatLeadEnrollmentCardMetaLine(row, metaColumns);

                        return (
                            <li
                                key={rowKey}
                                className="group rounded-lg border border-alloy-stone/12 bg-white px-3 py-2 shadow-[0_1px_2px_rgba(24,39,58,0.03)] transition-shadow hover:shadow-[0_2px_6px_rgba(24,39,58,0.06)]"
                                data-lead-enrollment-card-row="true"
                                data-layout-runtime-enrollment-row="true"
                                data-enrollment-row-editing={isEditing ? "true" : "false"}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0 flex-1">
                                        <LayoutRuntimeChildLinkSurface
                                            componentName="LeadEnrollmentCardList"
                                            surface="drawer"
                                            item={nameSynthetic}
                                            rowRecord={row}
                                            anchorRecord={anchorRecord}
                                            adornment={nameCol.adornment}
                                            display={formatLayoutRuntimeRepeaterColumnDisplay(row, nameCol)}
                                            onAction={onAdornmentAction}
                                            className="block truncate text-[13px] font-semibold leading-snug text-alloy-midnight hover:text-alloy-juniper"
                                        />
                                        {!isEditing && metaColumns.length > 0 ?
                                            <p
                                                className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-alloy-midnight/50"
                                                data-lead-enrollment-card-meta-line="true"
                                            >
                                                {metaLine}
                                            </p>
                                        :   null}
                                    </div>
                                    <div className="flex shrink-0 items-center gap-1.5">
                                        {showEdit ?
                                            <button
                                                type="button"
                                                className="rounded-md px-1.5 py-0.5 text-[10px] font-medium text-alloy-midnight/40 opacity-0 transition-opacity hover:bg-alloy-stone/10 hover:text-alloy-juniper group-hover:opacity-100 focus:opacity-100"
                                                onClick={() => toggleRowEdit(rowKey)}
                                                data-enrollment-row-action={isEditing ? "done" : "edit"}
                                            >
                                                {isEditing ? "Done" : "Edit"}
                                            </button>
                                        :   null}
                                    </div>
                                </div>
                                {isEditing && edit ?
                                    <div className="mt-2 grid grid-cols-1 gap-2 border-t border-alloy-stone/8 pt-2 sm:grid-cols-2">
                                        {columns
                                            .filter((col) => col !== nameColumn && enrollmentGridColumnIsEditable(col))
                                            .map((col) => (
                                                <label key={col.refKey} className="flex min-w-0 flex-col gap-0.5">
                                                    <span className="text-[9px] font-semibold uppercase tracking-wide text-alloy-midnight/40">
                                                        {col.label}
                                                    </span>
                                                    <LayoutRuntimeFieldInput
                                                        refKey={col.refKey}
                                                        value={edit.getFieldValue(
                                                            col.refKey,
                                                            formatLayoutRuntimeRepeaterColumnDisplay(row, col),
                                                            rowKey,
                                                        )}
                                                        rowKey={rowKey}
                                                        onChange={(v) => edit.setFieldValue(col.refKey, v, rowKey)}
                                                        getDependentValue={layoutRuntimeEnrollmentPlacementDependentValueReader(
                                                            row,
                                                            anchorRecord,
                                                            edit.getFieldValue,
                                                            rowKey,
                                                        )}
                                                        compact
                                                    />
                                                </label>
                                            ))}
                                    </div>
                                :   null}
                            </li>
                        );
                    })}
                </ul>
            }
            {overflowFooter}
        </div>
    );
}
