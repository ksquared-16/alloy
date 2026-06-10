"use client";

import { useCallback, useState } from "react";
import type { LayoutCollectionColumn, LayoutItem } from "@/lib/layout/layoutV2";
import { normalizeRefKeyOnRead } from "@/lib/layout/layoutRefKeyAliases";
import DrawerHouseholdChildLinkAvatar from "@/components/layout/DrawerHouseholdChildLinkAvatar";
import LayoutRuntimeChildLinkSurface from "@/components/layout/LayoutRuntimeChildLinkSurface";
import { personDrawerHouseholdInitials } from "@/lib/admin/person/personDrawerHouseholdDisplay";
import { useLayoutRuntimeDrawerEdit } from "@/components/layout/LayoutRuntimeDrawerEditProvider";
import LayoutRuntimeFieldInput from "@/components/layout/LayoutRuntimeFieldInput";
import type { AdornmentActionHandler } from "@/components/layout/LayoutRuntimePlanView";
import LeadEnrollmentCardMetaLines from "@/components/layout/lead/LeadEnrollmentCardMetaLines";
import DrawerOverviewEmptyState from "@/components/layout/DrawerOverviewEmptyState";
import {
    formatLayoutRuntimeRepeaterColumnDisplay,
} from "@/lib/layout/runtime/formatLayoutRuntimeRepeaterColumnDisplay";
import { layoutRuntimeFieldIsEditable } from "@/lib/layout/runtime/layoutRuntimeFieldEditability";
import {
    enrollmentGridColumnIsEditable,
    readEnrollmentGridCellRole,
} from "@/lib/layout/runtime/enrollmentGridPresentation";
import { layoutRuntimeEnrollmentPlacementDependentValueReader } from "@/lib/layout/runtime/resolveLayoutRuntimeEnrollmentPlacementContext";
import { layoutRuntimeRepeaterRowReactKey } from "@/lib/layout/runtime/layoutRuntimeRepeaterRowKey";
import type { ProofRuntimeRecord } from "@/lib/layout/runtime/proofRecordContext";
import {
    PRESENTATION_DATA_VALUE_COMPACT,
    PRESENTATION_LABEL,
} from "@/lib/presentation/presentationTypography";

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
    const statusColumn = columns.find((c) => {
        const key = c.refKey.toLowerCase();
        return key.includes("status") || c.renderHint === "status";
    });
    const metaColumns = columns.filter((c) => c !== nameColumn && c !== statusColumn);

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
                <div className="p-2">
                    <DrawerOverviewEmptyState
                        message="No children linked yet."
                        hint="Add a child to capture program interest and enrollment details."
                        compact
                    />
                </div>
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
                        const statusDisplay =
                            statusColumn ? formatLayoutRuntimeRepeaterColumnDisplay(row, statusColumn) : null;
                        const childDisplayName = formatLayoutRuntimeRepeaterColumnDisplay(row, nameCol);
                        const childId = String(row["child.id"] ?? row.id ?? "").trim();
                        const childPhotoUrl = String(row["child.photo_url"] ?? row.photo_url ?? row.image_url ?? "").trim() || null;

                        return (
                            <li
                                key={rowKey}
                                className="group rounded-lg border border-alloy-stone/12 bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(24,39,58,0.03)] transition-shadow hover:shadow-[0_2px_6px_rgba(24,39,58,0.06)]"
                                data-lead-enrollment-card-row="true"
                                data-layout-runtime-enrollment-row="true"
                                data-enrollment-row-editing={isEditing ? "true" : "false"}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex min-w-0 flex-1 items-start gap-2.5">
                                        {!isEditing ?
                                            <DrawerHouseholdChildLinkAvatar
                                                childId={childId}
                                                displayName={childDisplayName}
                                                initials={personDrawerHouseholdInitials(childDisplayName)}
                                                photoUrl={childPhotoUrl}
                                                rowRecord={row}
                                                onAdornmentAction={onAdornmentAction}
                                                componentName="LeadEnrollmentCardList"
                                            />
                                        :   null}
                                        <div className="min-w-0 flex-1">
                                            <div className="flex min-w-0 items-start justify-between gap-2">
                                                {childId ?
                                                    <LayoutRuntimeChildLinkSurface
                                                        componentName="LeadEnrollmentCardList"
                                                        surface="drawer"
                                                        item={nameSynthetic}
                                                        rowRecord={row}
                                                        anchorRecord={anchorRecord}
                                                        adornment={null}
                                                        display={childDisplayName}
                                                        onAction={onAdornmentAction}
                                                        className={`block min-w-0 truncate hover:text-alloy-juniper ${PRESENTATION_DATA_VALUE_COMPACT}`}
                                                    />
                                                :   <p className={`min-w-0 truncate ${PRESENTATION_DATA_VALUE_COMPACT}`}>
                                                        {childDisplayName}
                                                    </p>
                                                }
                                            {!isEditing && statusDisplay && statusDisplay !== "—" ?
                                                <span className="shrink-0 rounded-full border border-alloy-juniper/20 bg-alloy-juniper/8 px-2 py-0.5 text-[11px] font-medium text-alloy-midnight/90">
                                                    {statusDisplay}
                                                </span>
                                            :   null}
                                        </div>
                                        {!isEditing && metaColumns.length > 0 ?
                                            <LeadEnrollmentCardMetaLines row={row} metaColumns={metaColumns} />
                                        :   null}
                                        </div>
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
                                                    <span className={PRESENTATION_LABEL}>
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
